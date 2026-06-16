"""
Синк дашборда аптеки ТОЛЬКО из Excel (СВОД II-Q + каталог Проектов).
Факт берётся из Excel (ФАКТ апрель/май/июнь), не из DWH.

Проект: имя нормализуется через каталог (PLAN_TO_CATALOG), оттуда же менеджер/условие.
Квартальный факт = факт_апр + факт_май + факт_июнь. % = факт/план.

Запуск:  uv run python plans_sync.py <inn> [view_tg_id]
         uv run python plans_sync.py --all          (прогон всех аптек, без записи view)
"""
import asyncio
import json
import os
import sys

import asyncpg
from dotenv import load_dotenv

from projects_catalog import load_projects_catalog, PLAN_TO_CATALOG
from plans_loader import load_plans

load_dotenv()

MONTHS = [('plan_apr', 'fact_apr', 'april', 'апрель'),
          ('plan_may', 'fact_may', 'may', 'май'),
          ('plan_jun', 'fact_jun', 'june', 'июнь')]


def fmt(n):
    return f'{int(round(n)):,}'.replace(',', ' ')


def build_dashboard(inn, plan_rec, catalog):
    cat_projects = catalog['projects']
    projects_out = []
    q_plan = q_fact = 0.0
    completed = partial = critical = 0

    for plan_name, prec in plan_rec['projects'].items():
        plan_q = prec.get('plan_iiq', 0) or 0
        fact_q = sum(prec.get(fk, 0) or 0 for _, fk, _, _ in MONTHS)
        if plan_q <= 0 and fact_q <= 0:
            continue
        cat_name = PLAN_TO_CATALOG.get(plan_name.upper())
        cinfo = cat_projects.get(cat_name) if cat_name else None
        condition = cinfo['condition'] if cinfo else ''
        manager = cinfo['manager'] if cinfo else ''

        months_out = {}
        for pk, fk, mkey, mlabel in MONTHS:
            mp = prec.get(pk, 0) or 0
            mf = prec.get(fk, 0) or 0
            months_out[mkey] = {'plan': fmt(mp), 'fact': fmt(mf),
                                'percent': round(mf / mp * 100) if mp else 0, 'label': mlabel}

        pct = round(fact_q / plan_q * 100) if plan_q else 0
        status = 'completed' if pct >= 100 else ('partial' if pct >= 50 else 'critical')
        completed += pct >= 100
        partial += 50 <= pct < 100
        critical += pct < 50
        q_plan += plan_q
        q_fact += fact_q

        projects_out.append({
            'name': cat_name or plan_name, 'status': status, 'percent': pct,
            'plan': fmt(plan_q), 'quarter_plan': fmt(plan_q), 'quarter_plan_raw': plan_q,
            'fact': fmt(fact_q), 'condition': condition, 'manager': manager,
            'bonus_amount': '0', 'bonus_amount_raw': 0,
            'remaining': fmt(max(0, plan_q - fact_q)), 'months': months_out,
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
                   'quarter_percent': q_pct, 'total_bonus': '0', 'total_bonus_raw': 0,
                   'remaining': fmt(max(0, q_plan - q_fact))},
        'bonuses': {'accrued': {'amount': '0', 'desc': ''},
                    'completed': {'amount': '0', 'desc': ''},
                    'potential': {'amount': '0', 'desc': ''}},
        'projects': projects_out, 'income_quarter': fmt(q_fact),
        '_source': 'plans_IIQ',
    }


def _quarter_months(projects_out):
    agg = {}
    for pk, fk, mkey, mlabel in MONTHS:
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
    dashboard = build_dashboard(inn, plans[str(inn)], catalog)

    print(f"Аптека: {dashboard['name']} | ИНН {inn} | менеджер {dashboard['manager']} | {dashboard['region']}")
    print(f"  Квартал: план {dashboard['totals']['quarter_plan']} | факт {dashboard['income_quarter']} "
          f"| {dashboard['totals']['quarter_percent']}%")
    print(f"  Проекты ({len(dashboard['projects'])}):")
    for p in dashboard['projects'][:14]:
        print(f"    {p['name']:<16} план {p['plan']:>14} факт {p['fact']:>14} = {p['percent']:>4}%")

    if view_tg_id is not None:
        asyncio.run(save(dashboard, view_tg_id))
        print(f"\n✅ Записано. Смотреть: ?tg_id={view_tg_id}")
    return dashboard


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Использование: uv run python plans_sync.py <inn> [view_tg_id]'); sys.exit(1)
    sync_one(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else None)
