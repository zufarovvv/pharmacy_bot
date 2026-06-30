"""
Привязка менеджера к аптеке по РЕГИОНУ / РАЙОНУ.

Источник — отдельная Google-таблица «Info managers» (один лист), где у каждого
менеджера перечислены регионы и/или районы его территории. Названия там короткие
и разноязычные (узб./рус.: «алмазор», «Чилонзор», «Фаргона»), а в базе аптек —
полные русские формы («Алмазарский район», «Чиланзарский район», «Ферганская
область»). Поэтому матчинг идёт через таблицу синонимов SYN → канонический slug.

Правило территории:
  - аптеки г. Ташкента и Ташкентской области матчим по РАЙОНУ;
  - все остальные регионы — по РЕГИОНУ (вся область → один менеджер).

Модуль содержит только чистую логику (без сети и БД), чтобы его было легко
тестировать. Чтение Google-таблицы и запись в БД живут в dashboard_sync.py.
"""
import re

# Регионы, для которых матчим по району (а не по региону целиком).
TASHKENT_CITY_KEYS = {"ташкент"}
TASHKENT_REGION_KEYS = {"ташкентская"}

# Гео-слова, которые выкидываем при нормализации (чтобы «Алмазарский район» и
# «алмазор» сводились к общему корню через SYN).
_STOP_WORDS = ("район", "р-н", "области", "область", "обл", "город", "гор",
               "тумани", "туман", "республика", "г.")


def norm(s):
    """Нормализует гео-название: lower, ё→е, убрать гео-слова и не-буквы."""
    if not s:
        return ""
    s = str(s).lower().replace("ё", "е").strip()
    for w in _STOP_WORDS:
        s = s.replace(w, " ")
    return re.sub(r"[^а-я]", "", s)


# ── Таблица синонимов: любая нормализованная форма (из БД или из таблицы) → slug.
#    Перечисляем все известные написания одной территории; identity-fallback в
#    canon() покрывает совпадающие формы автоматически.
SYN = {}


def _syn(slug, *forms):
    for f in forms:
        SYN[norm(f)] = slug


# г. Ташкент — районы
_syn("almazar", "Алмазарский район", "алмазор")
_syn("yakkasaray", "Яккасарайский район", "яккасарой")
_syn("shaykhantahur", "Шайхантахурский район", "Шайхонтохурский", "шайхонтохур")
_syn("chilanzar", "Чиланзарский район", "Чилонзор")
_syn("uchtepa", "Учтепинский район", "Учтепа")
_syn("mirzo", "Мирзо-Улугбекский район", "Мирзо ул")
_syn("yunusabad", "Юнусабадский район", "Юнусабад")
_syn("mirabad", "Мирабадский район", "Миробод")
_syn("yashnabad", "Яшнабадский район", "Яшнобод")
_syn("bektemir", "Бектемирский район", "Бектемир")
_syn("sergeli", "Сергелийский район", "Сергели")
_syn("yangihayot", "Янгихаётский р-н", "Янгихаёт")

# Ташкентская обл. — районы/города
_syn("yangiyul", "Янгиюльский район", "Янги йул")
_syn("bekabad", "Бекабадский район", "Город Бекабад", "Бекобод")
_syn("akkurgan", "Аккурганский район", "Аккурган")
_syn("parkent", "Паркентский район", "Паркентский р-н", "Паркент")
_syn("buka", "Букинский район", "Бука")
_syn("chinaz", "Чиназский район", "Чиноз")
_syn("nurafshan", "г. Нурафшан", "Нурафшон")
_syn("pskent", "Пскентский район", "Пискент")
_syn("yukorichirchik", "Юкоричирчикский район", "Юкори чирчик")
_syn("urtachirchik", "Уртачирчикский район", "Урта чирчик")
_syn("kuyichirchik", "Куйичирчикский район", "Куюи чирчик")
_syn("angren", "Город Ангрен", "Ангрен")
_syn("almalyk", "Город Алмалык", "Олмалик")
_syn("ahangaran", "Ахангаранский район", "Ахангарон")
_syn("chirchik", "Город Чирчик", "Чирчик")
_syn("bostanlyk", "Бостанлыкский район", "Газалкент")
_syn("kibray", "Кибрайский район", "Кибрай")
_syn("tashkentskiy", "Ташкентский район", "Тош.тумани", "Тош тумани")
_syn("zangiata", "Зангиатинский район", "Зангиота")

# Области (вне Ташкента)
_syn("samarkand", "Самаркандская область", "Самарканд")
_syn("khorezm", "Хорезмская область", "Хорезм")
_syn("kashkadarya", "Кашкадарьинская область", "Кашкадарья")
_syn("karakalpak", "Республика Каракалпакстан", "Каракалпакстан")
_syn("surkhandarya", "Сурхандарьинская область", "Сурхандарья")
_syn("syrdarya", "Сырдарьинская область", "Сырдарья")
_syn("andijan", "Андижанская область", "Андижан")
_syn("namangan", "Наманганская область", "Наманган")
_syn("bukhara", "Бухарская область", "Бухоро")
_syn("fergana", "Ферганская область", "Фаргона")
_syn("jizzakh", "Джизакская область", "Джиззах")
_syn("navoi", "Навоийская область", "Навоий")


def canon(s):
    """Канонический slug для гео-названия (identity-fallback если нет в SYN)."""
    n = norm(s)
    return SYN.get(n, n)


# ── Русские отображаемые имена менеджеров (как в мастер-файле III-Q).
#    Ключ — Telegram username из таблицы (lower, без @). Если менеджера здесь нет,
#    берём имя как в таблице. Это только для красивого показа в Mini App.
DISPLAY_NAMES = {
    "doston_fom": "Достон Турдиалиев",
    "datfo_01": "Азиз Жораев",
    "pjasur": "Жасур Пармонов",
    "zohid707": "Зохид Рихсибоев",
    "abduazimfom": "Абдуазим Хакимов",
    "erkinovsb": "Сардор Эркинов",
    "islamov0979": "Иброхим Тургунбоев",
    "abduazim_baxodirov": "Абдуазим Боходиров",
}


def _split_multi(s):
    """Делит ячейку на список: разделители — перенос строки, ';' и ','."""
    if not s:
        return []
    out = []
    for chunk in str(s).replace(";", "\n").replace(",", "\n").split("\n"):
        c = chunk.strip()
        if c:
            out.append(c)
    return out


def _hnorm(c):
    """Нормализация для распознавания заголовков колонок."""
    return str(c or "").strip().lower().replace("ё", "е").replace(".", "").replace(" ", "")


def _detect_columns(rows):
    """Ищет строку-заголовок и возвращает (header_idx, {field: col}).

    Заголовок — первая строка, где есть колонка имени И (телефон или telegram).
    """
    for i, row in enumerate(rows[:10]):
        col = {}
        for j, c in enumerate(row):
            h = _hnorm(c)
            if not h:
                continue
            if "телеграм" in h or "telegram" in h or "username" in h:
                col.setdefault("username", j)
            elif "телефон" in h or "phone" in h:
                col.setdefault("phone", j)
            elif "фио" in h or "менеджер" in h or h == "имя" or "name" in h:
                col.setdefault("name", j)
            elif "регион" in h or "region" in h or "область" in h:
                col.setdefault("region", j)
            elif "район" in h or "district" in h or "туман" in h:
                col.setdefault("district", j)
        if "name" in col and ("phone" in col or "username" in col):
            return i, col
    return None, {}


def parse_managers(rows):
    """Парсит лист 'Info managers'. Возвращает список территориальных менеджеров.

    Каждый: {name, display_name, phone, username, regions[], districts[], role}.
    Менеджеры без региона и без района (аналитик, тимлид, «по производителям»)
    пропускаются — они не территориальные.
    """
    header_idx, col = _detect_columns(rows)
    if header_idx is None:
        return []

    def cell(row, key):
        j = col.get(key)
        if j is None or j >= len(row):
            return ""
        return str(row[j] or "").strip()

    managers = []
    for row in rows[header_idx + 1:]:
        if not row:
            continue
        name = cell(row, "name")
        if not name:
            continue
        regions = _split_multi(cell(row, "region"))
        districts = _split_multi(cell(row, "district"))
        if not regions and not districts:
            continue  # не территориальный менеджер

        username = (_split_multi(cell(row, "username")) or [""])[0].lstrip("@")
        phone = (_split_multi(cell(row, "phone")) or [""])[0]
        display = DISPLAY_NAMES.get(username.lower(), name)
        managers.append({
            "name": name,
            "display_name": display,
            "phone": phone,
            "username": username,
            "regions": regions,
            "districts": districts,
            "role": cell(row, "role"),
        })
    return managers


def build_geo_index(managers):
    """Строит индексы (region_idx, district_idx): slug → manager.

    Менеджеры с районами индексируются по районам (Ташкент / Таш. обл.),
    остальные — по регионам (области).
    """
    region_idx, district_idx = {}, {}
    for m in managers:
        if m["districts"]:
            for d in m["districts"]:
                district_idx[canon(d)] = m
        else:
            for r in m["regions"]:
                region_idx[canon(r)] = m
    return region_idx, district_idx


def match_manager(region, district, region_idx, district_idx):
    """Возвращает менеджера для аптеки по её региону/району или None."""
    rk = norm(region)
    if rk in TASHKENT_CITY_KEYS or rk in TASHKENT_REGION_KEYS:
        return district_idx.get(canon(district))
    return region_idx.get(canon(region))
