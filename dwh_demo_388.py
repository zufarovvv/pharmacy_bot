"""
ДЕМО: вытаскивает одну реальную аптеку (fomid=388) из ClickHouse DWH,
собирает dashboard_data из РЕАЛЬНЫХ продаж (doctype=2 = розничные чеки)
и кладёт в наш PostgreSQL (pharmacies) по ИНН, чтобы показать в приложении.

Запуск:  uv run python dwh_demo_388.py
Смотреть: http://localhost:8080/?tg_id=388   (или через ngrok домен)
"""
import asyncio
import json
import os

import asyncpg
from dotenv import load_dotenv

from dwh import get_dwh_client

load_dotenv()

FOMID = 388
VIEW_TG_ID = 388          # под этим tg_id будем смотреть аптеку
QUARTER = [('january', 1), ('february', 2), ('march', 3)]
YEAR = 2026


def fmt(n):
    """1234567 -> '1 234 567'."""
    return f'{int(round(n)):,}'.replace(',', ' ')


def pull_from_dwh():
    c = get_dwh_client()

    # 1) Паспорт аптеки
    r = c.query(
        "SELECT id, fomid, inn, name, full_name, adress, phone, category, regeon, plan "
        "FROM org WHERE fomid = %(f)s AND apt = 1 LIMIT 1",
        parameters={'f': FOMID},
    )
    if not r.result_rows:
        raise SystemExit(f'Аптека fomid={FOMID} не найдена в org')
    org = dict(zip(r.column_names, r.result_rows[0]))

    # 2) Реальные продажи по месяцам квартала (doctype=2 = розничные чеки)
    months = {}
    q_fact = 0
    for name, mnum in QUARTER:
        rr = c.query(
            "SELECT count() cheks, sum(summa) summa FROM invoice "
            "WHERE pharmacy_id = %(p)s AND doctype = 2 "
            "AND toYear(data) = %(y)s AND toMonth(data) = %(m)s",
            parameters={'p': org['fomid'], 'y': YEAR, 'm': mnum},
        )
        row = rr.result_rows[0]
        fact = float(row[1] or 0)
        q_fact += fact
        months[name] = {'fact': fmt(fact), 'plan': '—', 'percent': 0, '_cheks': int(row[0] or 0)}

    return org, months, q_fact


def build_dashboard(org, months, q_fact):
    inn = (org.get('inn') or '').strip()
    return {
        'inn': inn,
        'name': org.get('name') or '',
        'legal_name': org.get('full_name') or org.get('name') or '',
        'region': f"Регион {org.get('regeon')}",
        'district': org.get('adress') or '',
        'city': '',
        'category': str(org.get('category') or ''),
        'manager': '',
        'manager_phone': org.get('phone') or '',
        'manager_username': '',
        'months': months,
        'totals': {
            'quarter_plan': '—',
            'quarter_plan_raw': 0,
            'quarter_percent': 0,
            'total_bonus': '0',
            'total_bonus_raw': 0,
            'remaining': '',
            'months': months,
        },
        'bonuses': {
            'accrued': {'amount': '0', 'desc': 'из DWH (демо)'},
            'completed': {'amount': '0', 'desc': ''},
            'potential': {'amount': '0', 'desc': ''},
        },
        'stats': {'completed': 0, 'partial': 0, 'critical': 0},
        'projects': [],
        'income_quarter': fmt(q_fact),
        '_source': 'clickhouse_dwh_demo',
    }


async def save(org, dashboard):
    inn = (org.get('inn') or '').strip()
    conn = await asyncpg.connect(
        user=os.getenv('DB_USER'), password=os.getenv('DB_PASS'),
        database=os.getenv('DB_NAME'), host=os.getenv('DB_HOST'),
    )
    try:
        # юзер для просмотра (?tg_id=388)
        await conn.execute('''
            INSERT INTO users (telegram_id, role, language) VALUES ($1,'user','ru')
            ON CONFLICT (telegram_id) DO UPDATE SET role='user';
        ''', VIEW_TG_ID)
        # аптека с реальными данными из DWH
        await conn.execute('''
            INSERT INTO pharmacies (inn, owner_tg_id, business_name, pharmacy_name, dashboard_data)
            VALUES ($1,$2,$3,$4,$5::jsonb)
            ON CONFLICT (inn) DO UPDATE
            SET owner_tg_id=$2, business_name=$3, pharmacy_name=$4, dashboard_data=$5::jsonb;
        ''', inn, VIEW_TG_ID, dashboard['legal_name'], dashboard['name'],
            json.dumps(dashboard, ensure_ascii=False))
    finally:
        await conn.close()


def main():
    org, months, q_fact = pull_from_dwh()
    print(f"Аптека: {org['name']} | ИНН {org['inn']} | fomid {org['fomid']}")
    for n, _ in QUARTER:
        print(f"  {n}: {months[n]['fact']} сум  ({months[n]['_cheks']} чеков)")
    print(f"  Продажи за квартал: {fmt(q_fact)} сум")
    dashboard = build_dashboard(org, months, q_fact)
    asyncio.run(save(org, dashboard))
    print(f"\n✅ Записано в pharmacies (ИНН {org['inn']}). Смотреть: ?tg_id={VIEW_TG_ID}")


if __name__ == '__main__':
    main()
