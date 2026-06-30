"""
Лоадер справочника проектов/товаров (ЛС).

Источник истины — Google-лист каталога (xlsx в Drive), который ведёт менеджер.
Читаем его публичный CSV-экспорт по сети; если недоступен — фолбэк на локальный
data/projects.xlsx (последний снимок).

Раскладка колонок (одинакова в листе и в xlsx; есть пустая колонка A):
  B=№, C=FOM ID, D=Наименование ЛС, E=Проект, F=CIP цена,
  G=Бонус закуп Общее, H=Бонус продажа Общее, I=Менеджер, J=Комментарии,
  K=Бонус Аптека закуп, L=Бонус Аптека продажа

Возвращает:
  products: список {fom_id, name, project, cip, bonus_apt_zakup, bonus_apt_prodaja, manager, comment}
  by_fom_id: dict fom_id -> товар
  projects: dict проект -> {manager, condition('Закуп'/'Продажа'/'—'), fom_ids:set, n_products,
            bonus_rate_zakup, bonus_rate_prodaja}
"""
import os
import csv
import io
import urllib.request
from collections import defaultdict

import openpyxl

DEFAULT_PATH = os.path.join(os.path.dirname(__file__), 'data', 'projects.xlsx')

# Google-лист каталога (публичный CSV-экспорт нужной вкладки). Переопределяется через .env.
CATALOG_SHEET_ID = os.getenv('CATALOG_SHEET_ID', '1YIFhRCgwSXNKdtnsNeElzo-pXhmkAx-h')
CATALOG_SHEET_GID = os.getenv('CATALOG_SHEET_GID', '1476945929')
CATALOG_CSV_URL = (f'https://docs.google.com/spreadsheets/d/{CATALOG_SHEET_ID}'
                   f'/export?format=csv&gid={CATALOG_SHEET_GID}')

# Соответствие имён проектов: матрица планов (II-Q) -> каталог.
# None = проект есть в планах, но товаров в каталоге нет.
PLAN_TO_CATALOG = {
    'BAYER': 'Байер',
    'MEDEXPORT': 'Medexport',
    'ASTRAZENECA': 'Astra Zeneca',
    'COMPLETEPHARMA': 'СOMPLETE-PHARMA',
    'ZOMMER': 'Zommer',
    'SYENERGY': 'Synergy',
    'GETZPHARMA': 'Getz',
    'WELPHARM': 'Welfar VST',
    'FERON': None,
    'PHARMSTANDART': None,
    'KUSUM': 'Kusum',
    'MULINSEN': 'Му-Лин-Сен',
    'XURSHIDAINTERDELUX': 'Hurshida Delux',
    'KRKA': 'KRKA',
    'NOBEL': 'Nobel',
    'SERVIER': 'Servier',
    'BIOMIND': 'Biomind',
    'SAFE': 'Safe',
}

# Колонки (1-based индексы).
COL = {'fom_id': 3, 'name': 4, 'project': 5, 'cip': 6,
       'bonus_zakup_total': 7, 'bonus_prodaja_total': 8, 'manager': 9,
       'comment': 10, 'bonus_apt_zakup': 11, 'bonus_apt_prodaja': 12}


def _num(v):
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace('\xa0', '').replace(' ', '').replace(',', '.')
    try:
        return float(s)
    except ValueError:
        return 0.0


def _product_from_cells(cells):
    """cells — значения строки (0-based). Возвращает товар или None (если нет FOM ID/проекта)."""
    def cell(key):
        i = COL[key] - 1
        return cells[i] if i < len(cells) else None
    fom_raw = cell('fom_id')
    project = cell('project')
    if fom_raw is None or not str(project or '').strip():
        return None
    try:
        fom_id = int(str(fom_raw).strip())
    except (ValueError, TypeError):
        return None
    comment = str(cell('comment') or '').strip()
    if comment == '-':
        comment = ''
    return {
        'fom_id': fom_id,
        'name': str(cell('name') or '').strip(),
        'project': str(project).strip(),
        'cip': _num(cell('cip')),
        'bonus_apt_zakup': _num(cell('bonus_apt_zakup')),
        'bonus_apt_prodaja': _num(cell('bonus_apt_prodaja')),
        'manager': str(cell('manager') or '').strip(),
        'comment': comment,
    }


def _products_from_csv(text):
    rows = list(csv.reader(io.StringIO(text)))
    start = 0
    for i, r in enumerate(rows[:6]):          # ищем строку-заголовок (с 'FOM ID')
        if any('fom id' in str(c).lower() for c in r):
            start = i + 1
            break
    out = []
    for r in rows[start:]:
        p = _product_from_cells(r)
        if p:
            out.append(p)
    return out


def _products_from_xlsx(path):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    try:
        ws = wb['Лист1']
        out = []
        for row in ws.iter_rows(min_row=3, values_only=True):
            p = _product_from_cells(list(row))
            if p:
                out.append(p)
        return out
    finally:
        wb.close()


def _fetch_catalog_csv():
    req = urllib.request.Request(CATALOG_CSV_URL, headers={'User-Agent': 'Mozilla/5.0'})
    return urllib.request.urlopen(req, timeout=20).read().decode('utf-8', 'replace')


def _aggregate(products):
    by_fom_id = {p['fom_id']: p for p in products}
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
        if pr['n_zakup'] >= pr['n_prodaja'] and pr['n_zakup'] > 0:
            condition = 'Закуп'
        elif pr['n_prodaja'] > 0:
            condition = 'Продажа'
        else:
            condition = '—'
        projects[name] = {
            'manager': pr['manager'],
            'condition': condition,
            'fom_ids': pr['fom_ids'],
            'n_products': pr['n_products'],
            'bonus_rate_zakup': _avg(pr['rate_zakup']),
            'bonus_rate_prodaja': _avg(pr['rate_prodaja']),
        }
    return {'products': products, 'by_fom_id': by_fom_id, 'projects': projects}


def load_projects_catalog(path=DEFAULT_PATH):
    """Источник истины — Google-лист каталога; при недоступности — локальный xlsx."""
    products = None
    try:
        products = _products_from_csv(_fetch_catalog_csv())
        if not products:
            raise ValueError('пустой каталог из листа')
    except Exception as e:
        print(f"⚠️ [catalog] Google-лист недоступен ({type(e).__name__}: {e}); читаю {path}")
        try:
            products = _products_from_xlsx(path)
        except Exception as e2:
            print(f"⚠️ [catalog] и локальный xlsx недоступен ({type(e2).__name__}: {e2}); каталог пуст")
            products = []
    return _aggregate(products)


if __name__ == '__main__':
    cat = load_projects_catalog()
    print(f"Товаров: {len(cat['products'])}")
    print(f"Проектов: {len(cat['projects'])}\n")
    print(f"{'ПРОЕКТ':<28} {'ТОВАРОВ':>8} {'УСЛОВИЕ':<10}")
    for name, p in sorted(cat['projects'].items(), key=lambda x: -x[1]['n_products']):
        print(f"{name:<28} {p['n_products']:>8} {p['condition']:<10}")
    print("\nПримеры товаров:")
    for p in cat['products'][:3]:
        print(f"  FOM {p['fom_id']:>6} | {p['project']:<10} | CIP {p['cip']:>10,.0f} | "
              f"бонусЗ {p['bonus_apt_zakup']:.0f} | {p['name']} | {p['comment']}")
