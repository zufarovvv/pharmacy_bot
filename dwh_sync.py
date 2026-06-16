"""
Синк дашборда аптеки/сети из DWH (ClickHouse) + Excel (планы, каталог проектов).

Мостик сеть→точки — ПО ИМЕНИ: из планов берём ключ названия (напр. 'CITY PHARM'),
находим все точки DWH (org apt=1, fomid>0) с этим именем, суммируем факт по ним.

Факт по проекту: для условия 'Закуп' — приходы (incomeln, priceprih),
для 'Продажа' — продажи (invoiceln, price). Период: II Q 2026 (апр-июнь).
Чтобы укладываться в лимит чтения DWH (1М строк), агрегируем ПО КАЖДОЙ ТОЧКЕ,
фильтруя товары по FOM ID из каталога (~255).

Запуск:  uv run python dwh_sync.py "<имя или ИНН>" [view_tg_id]
"""
import asyncio
import json
import os
import re
import sys

import asyncpg
from dotenv import load_dotenv

from dwh import get_dwh_client
from projects_catalog import load_projects_catalog, PLAN_TO_CATALOG
from plans_loader import load_plans

load_dotenv()

MONTHS = [(4, 'april', 'plan_apr', 'апрель'),
          (5, 'may', 'plan_may', 'май'),
          (6, 'june', 'plan_jun', 'июнь')]
_SUFFIXES = ['MCHJ', 'MCH J', 'XK', 'ХК', 'ООО', 'OOO', 'ЧП', 'ИП']


def fmt(n):
    return f'{int(round(n)):,}'.replace(',', ' ')


def network_key(name):
    """Из юр.названия делает ключ для поиска точек по имени. '"CITY PHARM" MChJ' -> 'CITY PHARM'."""
    s = (name or '').upper()
    for ch in '"«»\'`':
        s = s.replace(ch, ' ')
    for suf in _SUFFIXES:
        s = re.sub(rf'\b{re.escape(suf)}\b', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def resolve_points(client, key):
    """Все fomid точек DWH, чьё имя содержит ключ (apt=1, fomid>0)."""
    r = client.query(
        "SELECT DISTINCT fomid FROM org WHERE apt=1 AND fomid>0 AND upper(name) LIKE %(k)s",
        parameters={'k': f'%{key}%'})
    return sorted({row[0] for row in r.result_rows})


def aggregate_network(client, fomids, all_fom_ids):
    """{'incomeln': {month:{fom_good:[kol,summa]}}, 'invoiceln': {...}} — суммарно по точкам."""
    fom_list = ','.join(str(f) for f in all_fom_ids)
    out = {'incomeln': {}, 'invoiceln': {}}
    for fomid in fomids:
        gm = client.query(
            f"SELECT id, fom_good FROM good WHERE pharmacy_id={fomid} AND fom_good IN ({fom_list})")
        g2f = {row[0]: int(row[1]) for row in gm.result_rows}
        if not g2f:
            continue
        gids = ','.join(str(g) for g in g2f)
        # Приходы (Закуп). Продажи (invoiceln) — отдельно позже: там нет колонки good,
        # товар тянется через incomeln, нужен доп. join.
        q = client.query(
            f"SELECT toMonth(data) AS m, good AS gid, sum(kol) AS s_kol, sum(kol*priceprih) AS s_sum "
            f"FROM incomeln WHERE pharmacy_id={fomid} AND good IN ({gids}) "
            f"AND data>='2026-04-01' AND data<'2026-07-01' GROUP BY m, good")
        for m, gid, kol, s in q.result_rows:
            fg = g2f.get(int(gid))
            if fg is None:
                continue
            b = out['incomeln'].setdefault(int(m), {}).setdefault(fg, [0.0, 0.0])
            b[0] += float(kol)
            b[1] += float(s)
    return out


def build_dashboard(inn, plan_rec, catalog, agg, fomids):
    by_fom = catalog['by_fom_id']
    cat_projects = catalog['projects']
    projects_out = []
    q_plan = q_fact = q_bonus = 0.0
    completed = partial = critical = 0

    for plan_name, prec in plan_rec['projects'].items():
        plan_q = prec.get('plan_iiq', 0) or 0
        if plan_q <= 0:
            continue
        cat_name = PLAN_TO_CATALOG.get(plan_name.upper())
        cinfo = cat_projects.get(cat_name) if cat_name else None
        fom_ids = cinfo['fom_ids'] if cinfo else set()
        condition = cinfo['condition'] if cinfo else 'Закуп'
        src = 'invoiceln' if condition == 'Продажа' else 'incomeln'

        months_out, fact_q, bonus_q = {}, 0.0, 0.0
        for mnum, mkey, plan_key, mlabel in MONTHS:
            md = agg[src].get(mnum, {})
            m_fact = 0.0
            for fg in fom_ids:
                if fg in md:
                    kol, summa = md[fg]
                    m_fact += summa
                    prod = by_fom.get(fg)
                    if prod:
                        bonus_q += kol * (prod['bonus_apt_prodaja'] if condition == 'Продажа'
                                          else prod['bonus_apt_zakup'])
            fact_q += m_fact
            m_plan = prec.get(plan_key, 0) or 0
            months_out[mkey] = {'plan': fmt(m_plan), 'fact': fmt(m_fact),
                                'percent': round(m_fact / m_plan * 100) if m_plan else 0,
                                'label': mlabel}

        pct = round(fact_q / plan_q * 100) if plan_q else 0
        status = 'completed' if pct >= 100 else ('partial' if pct >= 50 else 'critical')
        completed += pct >= 100
        partial += 50 <= pct < 100
        critical += pct < 50
        q_plan += plan_q
        q_fact += fact_q
        q_bonus += bonus_q

        projects_out.append({
            'name': cat_name or plan_name, 'status': status, 'percent': pct,
            'plan': fmt(plan_q), 'quarter_plan': fmt(plan_q), 'quarter_plan_raw': plan_q,
            'fact': fmt(fact_q), 'condition': condition,
            'bonus_amount': fmt(bonus_q), 'bonus_amount_raw': bonus_q,
            'remaining': fmt(max(0, plan_q - fact_q)), 'months': months_out,
            '_no_catalog': cat_name is None,
        })

    projects_out.sort(key=lambda p: p['quarter_plan_raw'], reverse=True)
    q_pct = round(q_fact / q_plan * 100) if q_plan else 0
    meta = plan_rec['meta']
    return {
        'inn': str(inn), 'name': meta.get('name') or '', 'legal_name': meta.get('name') or '',
        'region': meta.get('region') or '', 'district': meta.get('district') or '',
        'category': '', 'manager': meta.get('manager') or '',
        'manager_phone': '', 'manager_username': '',
        'stats': {'completed': int(completed), 'partial': int(partial), 'critical': int(critical)},
        'months': _quarter_months(projects_out),
        'totals': {'quarter_plan': fmt(q_plan), 'quarter_plan_raw': q_plan,
                   'quarter_percent': q_pct, 'total_bonus': fmt(q_bonus),
                   'total_bonus_raw': q_bonus, 'remaining': fmt(max(0, q_plan - q_fact))},
        'bonuses': {'accrued': {'amount': fmt(q_bonus), 'desc': 'бонус аптеки (DWH+план)'},
                    'completed': {'amount': fmt(q_bonus), 'desc': ''},
                    'potential': {'amount': '0', 'desc': ''}},
        'projects': projects_out, 'income_quarter': fmt(q_fact),
        '_source': 'dwh_sync_IIQ', '_points': len(fomids),
    }


def _quarter_months(projects_out):
    agg = {}
    for mnum, mkey, plan_key, mlabel in MONTHS:
        pl = fa = 0.0
        for p in projects_out:
            mm = p['months'].get(mkey, {})
            pl += float(str(mm.get('plan', '0')).replace(' ', '') or 0)
            fa += float(str(mm.get('fact', '0')).replace(' ', '') or 0)
        agg[mkey] = {'plan': fmt(pl), 'fact': fmt(fa),
                     'percent': round(fa / pl * 100) if pl else 0, 'label': mlabel}
    return agg


async def save(dashboard, view_tg_id):
    conn = await asyncpg.connect(user=os.getenv('DB_USER'), password=os.getenv('DB_PASS'),
                                 database=os.getenv('DB_NAME'), host=os.getenv('DB_HOST'))
    try:
        if view_tg_id:
            await conn.execute('''INSERT INTO users (telegram_id, role, language)
                VALUES ($1,'user','ru') ON CONFLICT (telegram_id) DO UPDATE SET role='user';''', view_tg_id)
        await conn.execute('''
            INSERT INTO pharmacies (inn, owner_tg_id, business_name, pharmacy_name, dashboard_data)
            VALUES ($1,$2,$3,$4,$5::jsonb)
            ON CONFLICT (inn) DO UPDATE SET owner_tg_id=COALESCE($2,pharmacies.owner_tg_id),
                business_name=$3, pharmacy_name=$4, dashboard_data=$5::jsonb;''',
            dashboard['inn'], view_tg_id, dashboard['legal_name'], dashboard['name'],
            json.dumps(dashboard, ensure_ascii=False))
    finally:
        await conn.close()


def sync_one(inn, view_tg_id=None):
    catalog = load_projects_catalog()
    plans = load_plans()['pharmacies']
    if str(inn) not in plans:
        print(f'❌ ИНН {inn} нет в планах'); return None
    plan_rec = plans[str(inn)]
    key = network_key(plan_rec['meta'].get('name'))

    client = get_dwh_client()
    fomids = resolve_points(client, key)
    print(f"Ключ имени: '{key}' → точек DWH: {len(fomids)}")
    if not fomids:
        print('❌ точки не найдены по имени'); return None

    all_fom_ids = list(catalog['by_fom_id'].keys())
    agg = aggregate_network(client, fomids, all_fom_ids)
    dashboard = build_dashboard(inn, plan_rec, catalog, agg, fomids)

    print(f"Аптека: {dashboard['name']} | ИНН {inn} | менеджер {dashboard['manager']}")
    print(f"  Квартал: план {dashboard['totals']['quarter_plan']} | факт {dashboard['income_quarter']} "
          f"| {dashboard['totals']['quarter_percent']}% | бонус {dashboard['totals']['total_bonus']}")
    print(f"  Проекты ({len(dashboard['projects'])}):")
    for p in dashboard['projects'][:14]:
        flag = ' [нет в каталоге]' if p['_no_catalog'] else ''
        print(f"    {p['name']:<16} план {p['plan']:>13} факт {p['fact']:>13} = {p['percent']:>4}%  [{p['condition']}]{flag}")

    if view_tg_id is not None:
        asyncio.run(save(dashboard, view_tg_id))
        print(f"\n✅ Записано. Смотреть: ?tg_id={view_tg_id}")
    return dashboard


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Использование: uv run python dwh_sync.py <inn> [view_tg_id]'); sys.exit(1)
    sync_one(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else None)
