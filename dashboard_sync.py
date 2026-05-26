"""
Синхронизация dashboard_data из Google-таблицы формата "Свод таб new".

Структура одного листа (= одна аптека):
  R3-4: meta (ИНН в C4, Аптека D4, Регион F4, Район H4, Категория J4, Менеджер L4)
  R5-6: двухуровневые заголовки колонок
  R7+ : строки проектов (№ в B, название в C, дальше план/факт по месяцам/кварталу)
  R??:  строка ОБЩЕЕ (B = "ОБЩЕЕ") — итоги по аптеке

Колонки:
   1: пусто
   2: №
   3: Pharmacy/Project name
   4: ПЛАН I-Q (квартальный план)
   5/6/7:   План/Факт/% за Январь
   8/9/10:  План/Факт/% за Февраль
   11/12/13: План/Факт/% за Март
   14: Условия (Закуп/Продажа)
   15: ВП Квартал (%)
   16: визуальный бар (пропускаем)
   17: Сумма до выполнения плана (или "+ ..." если перевыполнено)
   18: Статус (NEW / Активен)
   19: % бонуса (0.07 = 7%)
   20: Сумма бонуса (заработано)
"""
import asyncio
import os
from collections import defaultdict

import gspread
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials

from database import upsert_pharmacy_full

load_dotenv()

SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
]
CREDS_FILE = os.getenv('GOOGLE_CREDS_FILE', 'creds.json')
DASHBOARD_SHEET_ID = os.getenv('DASHBOARD_SHEET_ID')

# Имена месяцев в этом же порядке как в листе (jan/feb/mar)
MONTHS_RU = ['january', 'february', 'march']

# Координаты meta-полей (1-based: row, col)
META_FIELDS = {
    'inn':              (4, 3),
    'name':             (4, 4),
    'region':           (4, 6),
    'district':         (4, 8),
    'category':         (4, 10),
    'manager':          (4, 12),
    'manager_phone':    (4, 13),  # M4 — телефон менеджера (например, +998901234567)
    'manager_username': (4, 14),  # N4 — Telegram-юзернейм менеджера (например, @datfo_manager)
}

# Где может лежать TG_ID — пробуем по очереди. Первое найденное число берём.
# Менеджер может вписать в любую из этих ячеек:
TG_ID_CANDIDATE_CELLS = [
    (4, 1),   # A4 — оптимально
    (3, 1),   # A3
    (2, 1),   # A2
    (1, 1),   # A1
    (4, 2),   # B4
    (2, 2),   # B2
    (1, 14),  # N1
    (2, 14),  # N2
]

# Колонки данных проекта (1-based)
COL_NUMBER = 2
COL_NAME = 3
COL_QUARTER_PLAN = 4
COL_MONTHS = [
    # (plan, fact, percent) для январь/февраль/март
    (5, 6, 7),
    (8, 9, 10),
    (11, 12, 13),
]
COL_CONDITION = 14
COL_QUARTER_PERCENT = 15
COL_REMAINING = 17
COL_STATUS = 18
COL_BONUS_PCT = 19
COL_BONUS_AMOUNT = 20

PROJECTS_START_ROW = 7  # с какой строки идут проекты


def _open_workbook():
    creds = Credentials.from_service_account_file(CREDS_FILE, scopes=SCOPES)
    client = gspread.authorize(creds)
    return client.open_by_key(DASHBOARD_SHEET_ID)


def _to_float(val, default=0.0):
    if val is None or val == '':
        return default
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).replace(' ', '').replace(',', '.').replace('+', '').strip()
    try:
        return float(s)
    except ValueError:
        return default


def _to_int_pct(val):
    """Десятичная доля (0.135 = 13.5%, 2.2 = 220%) → целый процент. Excel ВСЕГДА хранит как долю."""
    return int(round(_to_float(val) * 100))


def _fmt_money(val):
    """Число → '10 000 000' (полные цифры с разделителем-пробелом)."""
    f = _to_float(val)
    if f == 0:
        return '0'
    return f'{int(round(f)):,}'.replace(',', ' ')


def _status_for(percent):
    if percent >= 100:
        return 'completed'
    if percent >= 50:
        return 'partial'
    return 'critical'


def _cell(rows, row_idx, col_idx):
    """Безопасный доступ. rows — список списков (0-based). row_idx/col_idx — 1-based."""
    r = row_idx - 1
    c = col_idx - 1
    if r < 0 or r >= len(rows):
        return None
    if c < 0 or c >= len(rows[r]):
        return None
    return rows[r][c]


def _parse_pharmacy_sheet(rows):
    """Парсит одну вкладку. Возвращает dict с данными аптеки или None если лист не подходит."""
    # Проверка: есть ли ИНН в C4?
    inn_raw = _cell(rows, *META_FIELDS['inn'])
    inn_num = _to_float(inn_raw)
    if inn_num <= 0:
        return None
    inn = str(int(inn_num))

    # TG_ID ищем по нескольким возможным ячейкам, берём первое валидное число (≥6 цифр, ≠ ИНН)
    tg_id = None
    for (r, c) in TG_ID_CANDIDATE_CELLS:
        val = _cell(rows, r, c)
        n = _to_float(val)
        n_int = int(n) if n > 0 else 0
        if n_int >= 100000 and str(n_int) != inn:
            tg_id = n_int
            break

    meta = {
        'inn': inn,
        'tg_id': tg_id,
        'name': str(_cell(rows, *META_FIELDS['name']) or '').strip(),
        'region': str(_cell(rows, *META_FIELDS['region']) or '').strip(),
        'district': str(_cell(rows, *META_FIELDS['district']) or '').strip(),
        'category': str(_cell(rows, *META_FIELDS['category']) or '').strip(),
        'manager': str(_cell(rows, *META_FIELDS['manager']) or '').strip(),
        'manager_phone': str(_cell(rows, *META_FIELDS['manager_phone']) or '').strip(),
        'manager_username': str(_cell(rows, *META_FIELDS['manager_username']) or '').strip().lstrip('@'),
    }

    # Парсим строки проектов до ОБЩЕЕ
    projects = []
    totals_row = None
    r = PROJECTS_START_ROW
    while r <= len(rows):
        num_cell = _cell(rows, r, COL_NUMBER)
        name_cell = _cell(rows, r, COL_NAME)

        # Конец секции проектов: ОБЩЕЕ
        if (isinstance(num_cell, str) and 'ОБЩЕЕ' in num_cell.upper()) or \
           (isinstance(name_cell, str) and 'ОБЩЕЕ' in name_cell.upper()):
            totals_row = r
            break

        # Пустая строка — считаем что проекты закончились
        if not name_cell or str(name_cell).strip() == '':
            r += 1
            continue

        # Собираем проект
        proj_months = {}
        for i, month_key in enumerate(MONTHS_RU):
            plan_col, fact_col, pct_col = COL_MONTHS[i]
            plan = _to_float(_cell(rows, r, plan_col))
            fact = _to_float(_cell(rows, r, fact_col))
            pct = _to_int_pct(_cell(rows, r, pct_col))
            proj_months[month_key] = {
                'plan': _fmt_money(plan),
                'fact': _fmt_money(fact),
                'plan_raw': plan,
                'fact_raw': fact,
                'percent': pct,
            }

        quarter_percent = _to_int_pct(_cell(rows, r, COL_QUARTER_PERCENT))
        quarter_plan = _to_float(_cell(rows, r, COL_QUARTER_PLAN))
        bonus_pct = _to_int_pct(_cell(rows, r, COL_BONUS_PCT))
        bonus_amount = _to_float(_cell(rows, r, COL_BONUS_AMOUNT))

        projects.append({
            'number': int(_to_float(num_cell)) if num_cell else None,
            'name': str(name_cell).strip(),
            'quarter_plan': _fmt_money(quarter_plan),
            'quarter_plan_raw': quarter_plan,
            'months': proj_months,
            'condition': str(_cell(rows, r, COL_CONDITION) or '').strip(),
            'percent': quarter_percent,
            'status': _status_for(quarter_percent),
            'remaining': str(_cell(rows, r, COL_REMAINING) or '').strip(),
            'bonus_percent': bonus_pct,
            'bonus_amount': _fmt_money(bonus_amount),
            'bonus_amount_raw': bonus_amount,
            # для совместимости со старым фронтом
            'fact': _fmt_money(sum(m['fact_raw'] for m in proj_months.values())),
            'plan': _fmt_money(quarter_plan),
        })
        r += 1

    # Итоги (ОБЩЕЕ)
    totals = {}
    if totals_row:
        total_quarter_plan = _to_float(_cell(rows, totals_row, COL_QUARTER_PLAN))
        total_months = {}
        for i, m in enumerate(MONTHS_RU):
            plan_col, fact_col, pct_col = COL_MONTHS[i]
            t_plan = _to_float(_cell(rows, totals_row, plan_col))
            t_fact = _to_float(_cell(rows, totals_row, fact_col))
            t_pct = _to_int_pct(_cell(rows, totals_row, pct_col))
            total_months[m] = {
                'plan': _fmt_money(t_plan),
                'fact': _fmt_money(t_fact),
                'percent': t_pct,
            }
        total_bonus = _to_float(_cell(rows, totals_row, COL_BONUS_AMOUNT))
        totals = {
            'quarter_plan': _fmt_money(total_quarter_plan),
            'quarter_plan_raw': total_quarter_plan,
            'months': total_months,
            'quarter_percent': _to_int_pct(_cell(rows, totals_row, COL_QUARTER_PERCENT)),
            'remaining': str(_cell(rows, totals_row, COL_REMAINING) or '').strip(),
            'total_bonus': _fmt_money(total_bonus),
            'total_bonus_raw': total_bonus,
        }

    # Агрегаты под существующий фронт
    stats = {'completed': 0, 'partial': 0, 'critical': 0}
    for p in projects:
        stats[p['status']] += 1

    bonus_earned = sum(p['bonus_amount_raw'] for p in projects)
    bonus_pending = sum(
        p['quarter_plan_raw'] - sum(m['fact_raw'] for m in p['months'].values())
        for p in projects
        if p['percent'] < 100
    )
    bonus_pending = max(0, bonus_pending)

    completed_names = ', '.join(p['name'] for p in projects if p['status'] == 'completed') or '—'

    return {
        # Богатые данные (новый формат)
        **meta,
        'city': meta['district'] or meta['region'],
        'projects': projects,
        'totals': totals,
        # Совместимость со старым фронтом
        'income_quarter': totals.get('total_bonus', '0'),
        'stats': stats,
        'months': totals.get('months', {}),
        'bonuses': {
            'accrued': {
                'amount': _fmt_money(bonus_earned),
                'desc': f"{stats['completed']} проектов на 100%+",
            },
            'potential': {
                'amount': '+ ' + _fmt_money(bonus_pending),
                'desc': f"До цели по {stats['partial'] + stats['critical']} проектам",
            },
            'completed': {
                'amount': _fmt_money(bonus_earned),
                'desc': completed_names,
            },
        },
    }


def _read_all_sheets():
    """Читает ВСЕ листы из DASHBOARD_SHEET_ID, парсит подходящие."""
    wb = _open_workbook()
    results = {}
    for ws in wb.worksheets():
        try:
            # raw значения (UNFORMATTED) — числа возвращаются как float, не строки с пробелами
            raw = ws.get('A1:U50', value_render_option='UNFORMATTED_VALUE')
        except Exception as e:
            print(f"⚠️ [DASH] лист {ws.title!r}: ошибка чтения {e}")
            continue

        data = _parse_pharmacy_sheet(raw)
        if data:
            results[data['inn']] = data
            print(f"  ✓ {ws.title!r}: ИНН={data['inn']} ({len(data['projects'])} проектов)")
        # листы без ИНН в C4 молча пропускаются

    return results


async def _apply_dashboard_updates(by_inn, source_label='DASH'):
    """Общий upsert для всех аптек. Возвращает summary, пригодный для отчёта в боте."""
    ok = 0
    skipped_no_tg = []
    errors = []
    per_pharm = {}  # inn -> {'name', 'tg_id'} для успешно обновлённых
    for inn, data in by_inn.items():
        if not data.get('tg_id'):
            skipped_no_tg.append({'inn': inn, 'name': data.get('name') or ''})
            print(f"⚠️ [{source_label}] inn={inn}: TG_ID не найден — пропущена")
            continue
        try:
            await upsert_pharmacy_full(
                inn=inn,
                owner_tg_id=data['tg_id'],
                business_name=data.get('name') or inn,
                pharmacy_name=data.get('name') or inn,
                dashboard_data=data,
            )
            ok += 1
            per_pharm[inn] = {'name': data.get('name') or inn, 'tg_id': data['tg_id']}
        except Exception as e:
            errors.append({'inn': inn, 'error': str(e)})
            print(f"❌ [{source_label}] inn={inn}: {e}")
    msg = f"✅ [{source_label}] Обновлено аптек: {ok}/{len(by_inn)}"
    if skipped_no_tg:
        msg += f"  (пропущено без TG_ID: {len(skipped_no_tg)})"
    print(msg)
    return {
        'total_sheets': len(by_inn),
        'updated': ok,
        'skipped_no_tg': skipped_no_tg,
        'errors': errors,
        'per_pharm': per_pharm,
    }


async def sync_dashboard():
    if not DASHBOARD_SHEET_ID:
        print("⚠️ [DASH] DASHBOARD_SHEET_ID не задан в .env — синк пропущен")
        return

    print("🔄 [DASH] Чтение Google-таблицы...")
    loop = asyncio.get_running_loop()
    try:
        by_inn = await loop.run_in_executor(None, _read_all_sheets)
    except Exception as e:
        print(f"❌ [DASH] Ошибка чтения Google: {type(e).__name__}: {e}")
        return

    if not by_inn:
        print("⚠️ [DASH] Ни одного листа с ИНН не найдено.")
        return

    await _apply_dashboard_updates(by_inn, source_label='DASH')


# ============================================================
# Импорт из локального Excel-файла (.xlsx).
# Менеджер шлёт файл в бот → bot.py качает → вызывает эту функцию.
# Формат листов — тот же что в Google Sheets («Свод таб»).
# ============================================================
# Имя листа, который менеджер обновляет вручную (меняя ИНН в C4).
# Только он считается источником истины при загрузке xlsx.
PRIMARY_SHEET_NAME = 'Свод таб new'


def _read_sheet_rows(ws):
    """Читает первые 50×21 ячеек листа в 2D-список значений."""
    raw = []
    for row in ws.iter_rows(min_row=1, max_row=50, min_col=1, max_col=21, values_only=True):
        raw.append(list(row))
    return raw


def _read_all_sheets_from_excel(file_path):
    """
    Парсит .xlsx. Стратегия:
      1) Если есть лист с именем PRIMARY_SHEET_NAME ("Свод таб new") — берём ТОЛЬКО его.
         Это рабочий лист менеджера: он вписывает ИНН в C4, формулы подтягивают
         данные конкретной аптеки. Один upload = одна аптека.
      2) Иначе fallback: пробуем все листы (старое поведение).
    """
    from openpyxl import load_workbook

    # data_only=True — берём вычисленные значения формул, а не сами формулы
    wb = load_workbook(file_path, data_only=True, read_only=True)
    results = {}

    primary_ws = next((ws for ws in wb.worksheets if ws.title == PRIMARY_SHEET_NAME), None)
    targets = [primary_ws] if primary_ws else list(wb.worksheets)

    for ws in targets:
        try:
            raw = _read_sheet_rows(ws)
        except Exception as e:
            print(f"⚠️ [XLSX] лист {ws.title!r}: ошибка чтения {e}")
            continue

        data = _parse_pharmacy_sheet(raw)
        if data:
            results[data['inn']] = data
            print(f"  ✓ {ws.title!r}: ИНН={data['inn']} ({len(data['projects'])} проектов)")

    wb.close()
    return results


async def sync_dashboard_from_excel(file_path):
    """Импортирует все аптеки из локального .xlsx-файла. Возвращает summary."""
    print(f"🔄 [XLSX] Чтение {file_path}...")
    loop = asyncio.get_running_loop()
    try:
        by_inn = await loop.run_in_executor(None, _read_all_sheets_from_excel, file_path)
    except Exception as e:
        print(f"❌ [XLSX] Ошибка чтения файла: {type(e).__name__}: {e}")
        return {'error': f'{type(e).__name__}: {e}', 'updated': 0}

    if not by_inn:
        return {'error': 'Ни одного листа с ИНН не найдено', 'updated': 0}

    return await _apply_dashboard_updates(by_inn, source_label='XLSX')


if __name__ == "__main__":
    asyncio.run(sync_dashboard())
