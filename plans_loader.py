"""
Лоадер планов из СВОД ...xlsx, лист «II-Q» (матрица аптеки × проекты).

Структура:
  стр.2 — имена проектов в начале каждого блока (S=BAYER, GF=KRKA, ...)
  стр.3 — заголовки: базовые (B=ИНН, F=юр.название, J=менеджер, K=регион, L=район,
          N=Датфо, O=Plan(IIQ), P=Fact(IIQ)) + повторяющиеся блоки по проекту:
          'проект','ПЛАНIIQ2026','ПЛАНАПРЕЛЬ','ФАКТАПРЕЛЬ',... ['условия']
  стр.4 — строка ИТОГО (ИНН 7777), пропускаем
  стр.5+ — по одной аптеке

Парсим блоки ДИНАМИЧЕСКИ: колонка со значением 'проект' в стр.3 = старт блока,
имя проекта берём из стр.2. Колонки до следующего 'проект' — метрики блока.

Возвращает: dict inn(str) -> {
    meta: {name, network, n_apt, manager, region, district},
    total: {plan_iiq, fact_iiq},
    projects: { '<II-Q имя>': {plan_iiq, plan_apr, plan_may, plan_jun, condition} }
}
"""
import os

import openpyxl

DEFAULT_PATH = os.path.join(os.path.dirname(__file__), 'data', 'plans.xlsx')
SHEET = 'II-Q'

# Метки внутри блока проекта (стр.3) -> наш ключ
LABEL_MAP = {
    'ПЛАНIIQ2026': 'plan_iiq',
    'ПЛАНАПРЕЛЬ': 'plan_apr',
    'ПЛАНМАЙ': 'plan_may',
    'ПЛАНИЮНЬ': 'plan_jun',
    'условия': 'condition',
}


def _num(v):
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(' ', '').replace(',', '.'))
    except ValueError:
        return 0.0


def _norm(s):
    """Нормализует заголовок: убирает пробелы/регистр для сравнения."""
    return (str(s) if s is not None else '').replace(' ', '').replace('\n', '').strip()


def _detect_blocks(ws):
    """Находит блоки проектов: [(project_name_iiq, {our_key: col_idx})]."""
    row2 = [ws.cell(row=2, column=j + 1).value for j in range(ws.max_column)]
    row3 = [ws.cell(row=3, column=j + 1).value for j in range(ws.max_column)]

    # Индексы колонок, где стр.3 == 'проект'
    starts = [j for j, v in enumerate(row3) if _norm(v) == _norm('проект')]
    blocks = []
    for bi, start in enumerate(starts):
        end = starts[bi + 1] if bi + 1 < len(starts) else len(row3)
        name = row2[start] or f'BLOCK_{start}'
        cols = {}
        for j in range(start + 1, end):
            label = _norm(row3[j])
            for raw, key in LABEL_MAP.items():
                if label == _norm(raw):
                    cols[key] = j
        blocks.append((str(name).strip(), cols))
    return blocks


def load_plans(path=DEFAULT_PATH):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb[SHEET]
    blocks = _detect_blocks(ws)

    # Базовые колонки (0-based): B=1 ИНН, F=5 юр, G=6 аптеки, H=7 сеть, I=8 кол-во,
    # J=9 менеджер, K=10 регион, L=11 район, O=14 Plan(IIQ), P=15 Fact(IIQ)
    BC = {'inn': 1, 'legal': 5, 'pharmacy': 6, 'network': 7, 'n_apt': 8,
          'manager': 9, 'region': 10, 'district': 11, 'plan_iiq': 14, 'fact_iiq': 15}

    result = {}
    for r in range(5, ws.max_row + 1):
        inn_v = ws.cell(row=r, column=BC['inn'] + 1).value
        if inn_v is None:
            continue
        try:
            inn = str(int(inn_v))
        except (ValueError, TypeError):
            continue
        if inn in ('7777',):  # строка ИТОГО
            continue

        projects = {}
        for pname, cols in blocks:
            if pname.upper() == 'DATFOIIQ':  # это общий итог, не проект
                continue
            rec = {}
            for key, cidx in cols.items():
                val = ws.cell(row=r, column=cidx + 1).value
                rec[key] = (str(val).strip() if key == 'condition' else _num(val))
            # берём проект, только если есть хоть какой-то план
            if rec.get('plan_iiq', 0) or rec.get('plan_apr', 0) or rec.get('plan_may', 0) or rec.get('plan_jun', 0):
                projects[pname] = rec

        result[inn] = {
            'meta': {
                'name': ws.cell(row=r, column=BC['legal'] + 1).value or '',
                'network': ws.cell(row=r, column=BC['network'] + 1).value or '',
                'n_apt': _num(ws.cell(row=r, column=BC['n_apt'] + 1).value),
                'manager': ws.cell(row=r, column=BC['manager'] + 1).value or '',
                'region': ws.cell(row=r, column=BC['region'] + 1).value or '',
                'district': ws.cell(row=r, column=BC['district'] + 1).value or '',
            },
            'total': {
                'plan_iiq': _num(ws.cell(row=r, column=BC['plan_iiq'] + 1).value),
                'fact_iiq': _num(ws.cell(row=r, column=BC['fact_iiq'] + 1).value),
            },
            'projects': projects,
        }
    wb.close()
    return {'blocks': [b[0] for b in blocks], 'pharmacies': result}


if __name__ == '__main__':
    data = load_plans()
    ph = data['pharmacies']
    print(f"Блоки проектов в матрице ({len(data['blocks'])}): {data['blocks']}")
    print(f"\nАптек в планах: {len(ph)}")
    # Пример: первая аптека с планами по проектам
    sample = next((inn for inn, d in ph.items() if d['projects']), None)
    if sample:
        d = ph[sample]
        print(f"\nПример ИНН {sample}: {d['meta']['name']} | менеджер {d['meta']['manager']} | {d['meta']['region']}")
        print(f"  Итог: план IIQ {d['total']['plan_iiq']:,.0f}, факт IIQ {d['total']['fact_iiq']:,.0f}")
        print("  Проекты с планом:")
        for pn, rec in list(d['projects'].items())[:8]:
            print(f"    {pn:<20} планIIQ={rec.get('plan_iiq',0):>14,.0f}  условие={rec.get('condition','')}")
