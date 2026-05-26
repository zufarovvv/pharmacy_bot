# pharmacy_bot

Telegram-бот и Mini App для аналитики аптек DATFO. Пользователь открывает бот, жмёт кнопку Web App, видит дашборд по своей аптеке: план/факт по проектам, бонусы, динамику по месяцам. Админ-функции (рассылки, опросы, скриншоты дашбордов) живут в самом боте.

## Стек

- Python 3.12+ через [uv](https://docs.astral.sh/uv/)
- aiogram 3 — Telegram-бот
- aiohttp — API + раздача статики Mini App
- PostgreSQL через asyncpg
- Google Sheets через gspread (источник данных по аптекам)
- Selenium + headless Chrome — скриншоты дашбордов (legacy-флоу через `update_inn_in_sheet`)
- ngrok — для проброса локального API в Telegram при разработке

## Быстрый старт

### 1. Зависимости

```bash
# uv поставит Python 3.12 если нет, создаст .venv и поставит всё из pyproject.toml
uv sync
```

### 2. PostgreSQL локально

```bash
# macOS
brew install postgresql@16
brew services start postgresql@16
createdb telegram_pharmacy_app
```

### 3. Google service account

1. https://console.cloud.google.com/ → IAM & Admin → Service Accounts → Create
2. Создай ключ JSON, сохрани как `creds.json` в корне проекта.
3. В Google Sheet с дашбордами нажми Share, добавь email сервис-аккаунта с правом Editor.

### 4. Telegram бот

1. У @BotFather: `/newbot` → получи `BOT_TOKEN`.
2. У @BotFather: `/mybots` → выбери бота → `Bot Settings` → `Menu Button` → `Configure Menu Button` → вставь публичный URL Mini App (см. шаг 6).

### 5. `.env`

```bash
cp .env.example .env
# открой .env и заполни все ключи
```

Минимальный набор для запуска: `BOT_TOKEN`, `DB_USER`, `DB_PASS`, `DB_NAME`, `DB_HOST`, `DASHBOARD_SHEET_ID`, `WEB_APP_URL`.

### 6. Публичный URL для Mini App

Telegram открывает Web App только по HTTPS. В разработке самый простой путь — ngrok:

```bash
brew install ngrok
ngrok http 8080
# скопируй https://...ngrok-free.dev URL в WEB_APP_URL в .env
```

### 7. Создать таблицы в БД и запустить бот

```bash
uv run python database.py    # создаст таблицы users / pharmacies / polls / poll_answers
uv run python bot.py         # запустит бот + API + синк Google Sheets
```

При первом запуске бот в фоне читает `DASHBOARD_SHEET_ID`, парсит все листы, делает upsert аптек в Postgres (`scheduled_tasks` в [bot.py](bot.py)).

### 8. Первый юзер

1. Открой бот в Telegram, нажми `/start`. Создастся запись `users` с ролью `ghost` — доступа нет.
2. Вписать свой `telegram_id` в Google Sheet (в одну из ячеек-кандидатов: A4/B2/N1 — см. `TG_ID_CANDIDATE_CELLS` в [dashboard_sync.py](dashboard_sync.py)).
3. Дождаться следующего цикла синка (раз в 5 минут) или перезапустить бот — роль автоматически станет `user`, появится привязка к аптеке.
4. Для админа: в Postgres выставить роль вручную:
   ```sql
   UPDATE users SET role = 'superadmin' WHERE telegram_id = <твой id>;
   ```

## Переменные окружения

| Переменная | Назначение |
|---|---|
| `BOT_TOKEN` | Токен Telegram-бота от @BotFather |
| `DB_USER` / `DB_PASS` / `DB_NAME` / `DB_HOST` | Подключение к Postgres |
| `DASHBOARD_SHEET_ID` | ID Google-таблицы с листами аптек |
| `GOOGLE_CREDS_FILE` | Путь к JSON service account (по умолчанию `creds.json`) |
| `WEB_APP_URL` | Публичный HTTPS-URL Mini App (ngrok в dev) |
| `API_PORT` | Порт aiohttp (по умолчанию `8080`) |
| `ALLOW_QUERY_TG_ID` | **DEV ONLY.** `1` — разрешает `?tg_id=` без подписи Telegram. В проде ставить `0`. |
| `FEEDBACK_CHANNEL_ID` | Chat ID канала, куда бот пересылает отзывы |
| `SHEET_ID`, `DATA_SHEET_GID`, `REPORT_SHEET_GID` | Старая Google-таблица для Selenium-скриншотов |

## Структура проекта

| Файл / папка | Что делает |
|---|---|
| [bot.py](bot.py) | Главный модуль: aiogram dispatcher, FSM, рассылки, опросы, админка. Запускает API и фоновый синк. |
| [api.py](api.py) | aiohttp-сервер: `/api/me` (данные текущего пользователя), раздача `webapp/` как статики. |
| [database.py](database.py) | Слой PostgreSQL через asyncpg. Запуск как скрипт — создаёт таблицы. |
| [dashboard_sync.py](dashboard_sync.py) | Парсит Google Sheets формата «Свод таб new», пишет в `pharmacies.dashboard_data` (JSONB). |
| [screenshot.py](screenshot.py) | Selenium-скриншоты старого дашборда (legacy-флоу «📊 Получить данные»). |
| [sync.py](sync.py), [check_sheets.py](check_sheets.py) | Старый синк (отключён, оставлены до миграции). |
| [seed_clients.py](seed_clients.py) | Утилита для тестового наполнения БД. |
| [inspect_excel.py](inspect_excel.py), [test_parse_excel.py](test_parse_excel.py) | Локальный разбор Excel-выгрузок. |
| [webapp/](webapp/) | Telegram Mini App — `index.html` + `app.js`. Чистый JS, без сборки. |

## Схема БД

- `users(telegram_id PK, role, language)` — роли: `ghost` / `user` / `admin` / `superadmin`
- `pharmacies(id PK, inn UNIQUE, owner_tg_id, business_name, pharmacy_name, dashboard_data JSONB)`
- `polls(id PK, title, created_at)` + `poll_answers(poll_id, user_id, answer, answered_at)`

## Безопасность

- `.env` и `creds.json` исключены через `.gitignore`. Никогда не коммить.
- `ALLOW_QUERY_TG_ID=1` означает, что любой может прочитать `/api/me?tg_id=<чужой_id>` и увидеть данные чужой аптеки. В проде **обязательно** ставить `0` — тогда работает только `initData` с валидной HMAC-подписью Telegram.
- Авторизация Web App — `aiogram.utils.web_app.safe_parse_webapp_init_data`, проверяет HMAC-SHA256 с `BOT_TOKEN`.

## Полезные команды

```bash
# пересоздать таблицы (idempotent, не удаляет данные)
uv run python database.py

# принудительно перечитать Google Sheets и обновить БД
uv run python dashboard_sync.py

# посмотреть структуру Excel-файла
uv run python inspect_excel.py
```
