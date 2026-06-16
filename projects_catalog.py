"""
Лоадер справочника проектов/товаров из Проекты.xlsx (лист «Лист1»).

Колонки: B=№, C=FOM ID, D=Наименование, E=Проект, F=CIP цена,
         G=Бонус закуп Общее, H=Бонус продажа Общее, I=Менеджер,
         K=Бонус Аптека закуп, L=Бонус Аптека продажа

Возвращает:
  products: список товаров {fom_id, name, project, cip, bonus_apt_zakup, bonus_apt_prodaja, manager}
  by_fom_id: dict fom_id -> товар (быстрый матч с DWH good.fom_good)
  projects: dict проект -> {manager, condition('Закуп'/'Продажа'), fom_ids:set, n_products}

Условие проекта определяем по бонусу аптеки: если бонус закуп>0 — 'Закуп', иначе если
продажа>0 — 'Продажа' (по большинству товаров проекта).
"""
import os
from collections import defaultdict

import openpyxl

DEFAULT_PATH = os.path.join(os.path.dirname(__file__), 'data', 'projects.xlsx')

# Соответствие имён проектов: матрица планов (II-Q) -> каталог (Проекты.xlsx).
# None = проект есть в планах, но товаров в каталоге нет (факт посчитать нельзя).
PLAN_TO_CATALOG = {
    'BAYER': 'Байер',
    'MEDEXPORT': 'Medexport',
    'ASTRAZENECA': 'Astra Zeneca',
    'COMPLETEPHARMA': 'СOMPLETE-PHARMA',
    'ZOMMER': 'Zommer',
    'SYENERGY': 'Synergy',
    'GETZPHARMA': 'Getz',
    'WELPHARM': 'Welfar VST',
    'FERON': None,            # нет в каталоге товаров
    'PHARMSTANDART': None,    # нет в каталоге товаров
    'KUSUM': 'Kusum',
    'MULINSEN': 'Му-Лин-Сен',
    'XURSHIDAINTERDELUX': 'Hurshida Delux',
    'KRKA': 'KRKA',
    'NOBEL': 'Nobel',
    'SERVIER': 'Servier',
    'BIOMIND': 'Biomind',
    'SAFE': 'Safe',
}

# Колонки (1-based индексы)
COL = {'fom_id': 3, 'name': 4, 'project': 5, 'cip': 6,
       'bonus_zakup_total': 7, 'bonus_prodaja_total': 8, 'manager': 9,
       'bonus_apt_zakup': 11, 'bonus_apt_prodaja': 12}


def _num(v):
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(' ', '').replace(',', '.'))
    except ValueError:
        return 0.0


def load_projects_catalog(path=DEFAULT_PATH):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb['Лист1']

    products = []
    for row in ws.iter_rows(min_row=3, values_only=True):
        fom_raw = row[COL['fom_id'] - 1]
        project = row[COL['project'] - 1]
        if fom_raw is None or not project:
            continue
        try:
            fom_id = int(fom_raw)
        except (ValueError, TypeError):
            continue
        products.append({
            'fom_id': fom_id,
            'name': (row[COL['name'] - 1] or '').strip(),
            'project': str(project).strip(),
            'cip': _num(row[COL['cip'] - 1]),
            'bonus_apt_zakup': _num(row[COL['bonus_apt_zakup'] - 1]),
            'bonus_apt_prodaja': _num(row[COL['bonus_apt_prodaja'] - 1]),
            'manager': (row[COL['manager'] - 1] or '').strip(),
        })
    wb.close()

    by_fom_id = {p['fom_id']: p for p in products}

    # Агрегаты по проектам
    proj = defaultdict(lambda: {'manager': '', 'fom_ids': set(),
                                'n_zakup': 0, 'n_prodaja': 0, 'n_products': 0,
                                'rate_zakup': [], 'rate_prodaja': []})
    for p in products:
        pr = proj[p['project']]
        pr['fom_ids'].add(p['fom_id'])
        pr['n_products'] += 1
        if not pr['manager'] and p['manager']:
            pr['manager'] = p['manager']
        if p['bonus_apt_zakup'] > 0:
            pr['n_zakup'] += 1
            if p['cip'] > 0:
                pr['rate_zakup'].append(p['bonus_apt_zakup'] / p['cip'])
        if p['bonus_apt_prodaja'] > 0:
            pr['n_prodaja'] += 1
            if p['cip'] > 0:
                pr['rate_prodaja'].append(p['bonus_apt_prodaja'] / p['cip'])

    def _avg(xs):
        return sum(xs) / len(xs) if xs else 0.0

    projects = {}
    for name, pr in proj.items():
        # Условие — по преобладанию ненулевого бонуса
        if pr['n_zakup'] >= pr['n_prodaja'] and pr['n_zakup'] > 0:
            condition = 'Закуп'
        elif pr['n_prodaja'] > 0:
            condition = 'Продажа'
        else:
            condition = '—'  # бонусы нулевые — условие не задано
        projects[name] = {
            'manager': pr['manager'],
            'condition': condition,
            'fom_ids': pr['fom_ids'],
            'n_products': pr['n_products'],
            # Ставка бонуса аптеки = средняя доля бонуса от CIP по товарам проекта.
            # Бонус проекта ≈ факт × ставка (для проектов с единой ставкой — точно).
            'bonus_rate_zakup': _avg(pr['rate_zakup']),
            'bonus_rate_prodaja': _avg(pr['rate_prodaja']),
        }

    return {'products': products, 'by_fom_id': by_fom_id, 'projects': projects}


if __name__ == '__main__':
    cat = load_projects_catalog()
    print(f"Товаров: {len(cat['products'])}")
    print(f"Проектов: {len(cat['projects'])}\n")
    print(f"{'ПРОЕКТ':<28} {'ТОВАРОВ':>8} {'УСЛОВИЕ':<10} МЕНЕДЖЕР")
    for name, p in sorted(cat['projects'].items(), key=lambda x: -x[1]['n_products']):
        print(f"{name:<28} {p['n_products']:>8} {p['condition']:<10} {p['manager']}")
    print("\nПримеры товаров:")
    for p in cat['products'][:3]:
        print(f"  FOM {p['fom_id']:>6} | {p['project']:<10} | CIP {p['cip']:>10,.0f} | "
              f"бонус З/П {p['bonus_apt_zakup']:.0f}/{p['bonus_apt_prodaja']:.0f} | {p['name']}")
