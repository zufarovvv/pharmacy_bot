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
from plans_loader import load_plans, SHEET as PLANS_SHEET

load_dotenv()

MONTHS = [('plan_apr', 'fact_apr', 'april', 'апрель'),
          ('plan_may', 'fact_may', 'may', 'май'),
          ('plan_jun', 'fact_jun', 'june', 'июнь')]


def fmt(n):
    return f'{int(round(n)):,}'.replace(',', ' ')


def _plan_key(name):
    """Имя проекта из матрицы II-Q -> ключ PLAN_TO_CATALOG (без пробелов/дефисов/регистра).
    Разные выгрузки пишут 'ASTRA ZENECA' / 'COMPLETE-PHARMA' / 'GETZ PHARMA' — сводим к ключу."""
    return str(name).upper().replace(' ', '').replace('-', '').replace('\n', '').strip()


def build_dashboard(inn, plan_rec, catalog):
    cat_projects = catalog['projects']
    projects_out = []
    q_plan = q_fact = q_bonus = 0.0
    completed = partial = critical = 0

    for plan_name, prec in plan_rec['projects'].items():
        plan_q = prec.get('plan_iiq', 0) or 0
        fact_q = sum(prec.get(fk, 0) or 0 for _, fk, _, _ in MONTHS)
        if plan_q <= 0 and fact_q <= 0:
            continue
        cat_name = PLAN_TO_CATALOG.get(_plan_key(plan_name))
        cinfo = cat_projects.get(cat_name) if cat_name else None
        condition = cinfo['condition'] if cinfo else ''
        manager = cinfo['manager'] if cinfo else ''
        # Бонус проекта = факт × ставка бонуса аптеки (из Проекты.xlsx, по условию).
        bonus_rate = 0.0
        if cinfo:
            bonus_rate = cinfo['bonus_rate_prodaja'] if condition == 'Продажа' else cinfo['bonus_rate_zakup']

        # Реальные товары проекта из каталога (Проекты.xlsx): название, закуп(CIP), бонус.
        by_fom = catalog['by_fom_id']
        products = []
        if cinfo:
            for fid in sorted(cinfo['fom_ids']):
                pr = by_fom.get(fid)
                if not pr:
                    continue
                products.append({
                    'fom_id': fid,
                    'name': pr['name'],
                    'cip': pr['cip'],
                    'cip_fmt': fmt(pr['cip']),
                    'bonus_zakup': pr['bonus_apt_zakup'],
                    'bonus_prodaja': pr['bonus_apt_prodaja'],
                })

        months_out = {}
        for pk, fk, mkey, mlabel in MONTHS:
            mp = prec.get(pk, 0) or 0
            mf = prec.get(fk, 0) or 0
            months_out[mkey] = {'plan': fmt(mp), 'fact': fmt(mf),
                                'percent': round(mf / mp * 100) if mp else 0, 'label': mlabel}

        pct = round(fact_q / plan_q * 100) if plan_q else 0
        bonus_q = fact_q * bonus_rate
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
            'fact': fmt(fact_q), 'condition': condition, 'manager': manager,
            'bonus_amount': fmt(bonus_q) if bonus_q > 0 else '', 'bonus_amount_raw': bonus_q,
            'has_bonus': bonus_q > 0,
            'remaining': fmt(max(0, plan_q - fact_q)), 'months': months_out,
            'products': products, 'product_count': len(products),
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
                   'quarter_percent': q_pct, 'total_bonus': fmt(q_bonus), 'total_bonus_raw': q_bonus,
                   'remaining': fmt(max(0, q_plan - q_fact))},
        'bonuses': {'accrued': {'amount': fmt(q_bonus), 'desc': 'бонус по факту закупа'},
                    'completed': {'amount': fmt(q_bonus), 'desc': ''},
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


async def save_many(dashboards):
    """Массовый upsert дашбордов в pharmacies (по ИНН). owner_tg_id не трогаем."""
    conn = await asyncpg.connect(user=os.getenv('DB_USER'), password=os.getenv('DB_PASS'),
                                 database=os.getenv('DB_NAME'), host=os.getenv('DB_HOST'))
    try:
        rows = [(d['inn'], d['legal_name'], d['name'],
                 json.dumps(d, ensure_ascii=False)) for d in dashboards]
        await conn.executemany('''
            INSERT INTO pharmacies (inn, business_name, pharmacy_name, dashboard_data)
            VALUES ($1,$2,$3,$4::jsonb)
            ON CONFLICT (inn) DO UPDATE
            SET business_name=EXCLUDED.business_name,
                pharmacy_name=EXCLUDED.pharmacy_name,
                dashboard_data=EXCLUDED.dashboard_data;
        ''', rows)
    finally:
        await conn.close()


def build_all(catalog, plans):
    """Строит дашборды для всех аптек из планов. Возвращает (dashboards, skipped).
    Пропускаем аптеки без единого проекта с планом/фактом."""
    dashboards, skipped = [], 0
    for inn, rec in plans.items():
        d = build_dashboard(inn, rec, catalog)
        if not d['projects']:
            skipped += 1
            continue
        dashboards.append(d)
    return dashboards, skipped


def has_plans_sheet(path):
    """True, если книга содержит лист матрицы планов «II-Q» (формат СВОД-total)."""
    import openpyxl
    try:
        wb = openpyxl.load_workbook(path, read_only=True)
        try:
            return PLANS_SHEET in wb.sheetnames
        finally:
            wb.close()
    except Exception:
        return False


async def sync_plans_from_excel(file_path):
    """Импорт недельного файла СВОД (лист «II-Q») -> dashboard_data всех аптек.

    План/факт по проектам берём из загруженного файла; справочник товаров, бонусных
    ставок и условий — из бандла data/projects.xlsx (его загрузка не требует файла).
    owner_tg_id не трогаем (привязка аптек к Telegram живёт отдельно).

    Возвращает {pharmacies, updated, with_fact, skipped}.
    """
    catalog = load_projects_catalog()
    plans = load_plans(file_path)['pharmacies']
    dashboards, skipped = build_all(catalog, plans)
    if dashboards:
        await save_many(dashboards)
    with_fact = sum(1 for d in dashboards if d['totals']['quarter_percent'] > 0)
    return {'pharmacies': len(plans), 'updated': len(dashboards),
            'with_fact': with_fact, 'skipped': skipped}


def sync_all():
    """Прогон ВСЕХ аптек из планов: строит дашборд из Excel и пишет в pharmacies."""
    catalog = load_projects_catalog()
    plans = load_plans()['pharmacies']
    dashboards, skipped = build_all(catalog, plans)
    print(f"Построено дашбордов: {len(dashboards)} | пропущено (без проектов): {skipped}")
    asyncio.run(save_many(dashboards))
    with_fact = sum(1 for d in dashboards if d['totals']['quarter_percent'] > 0)
    print(f"✅ Записано в pharmacies: {len(dashboards)} аптек (из них с фактом: {with_fact})")


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
        print('Использование: uv run python plans_sync.py <inn> [view_tg_id]  |  --all'); sys.exit(1)
    if sys.argv[1] == '--all':
        sync_all()
    else:
        sync_one(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else None)
