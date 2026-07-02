# Деплой на прод (Ubuntu/Debian + Cloudflare named tunnel + systemd)

Стек: Python 3.12 (uv) · aiogram/aiohttp · PostgreSQL · Mini App (webapp/).
HTTPS для Telegram — через постоянный Cloudflare named tunnel (без открытых портов).

## 0. Что нужно заранее
- SSH-доступ: `<SERVER_IP>`, пользователь `<USER>` (лучше не-root с sudo), ключ/пароль.
- Аккаунт Cloudflare (free) **+ домен, добавленный в Cloudflare**. Named tunnel даёт
  стабильный URL только через ваш домен (напр. `bot.example.com`). Домена нет — можно
  зарегистрировать (Cloudflare Registrar) или временно оставить quick-туннель.
- Файлы, которых НЕТ в git (в `.gitignore`) — заливаются только через `scp`:
  `.env`, `creds.json`, `data/projects.xlsx` (фолбэк каталога товаров), опц. `data/plans.xlsx`.

## 1. Подключиться к серверу
```bash
ssh <USER>@<SERVER_IP>
# по ключу:
ssh -i ~/.ssh/<key> <USER>@<SERVER_IP>
```

## 2. Система и зависимости
```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install git curl postgresql postgresql-contrib
# uv — сам поставит нужный Python 3.12
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.local/bin/env
```

## 3. PostgreSQL: база и пользователь
```bash
sudo -u postgres psql <<'SQL'
CREATE USER pharmacy WITH PASSWORD 'СМЕНИ_ПАРОЛЬ';
CREATE DATABASE telegram_pharmacy_app OWNER pharmacy;
SQL
```
Эти значения пойдут в `.env` (DB_USER=pharmacy, DB_PASS=…, DB_NAME=telegram_pharmacy_app, DB_HOST=localhost).

## 4. Код (git clone — репозиторий публичный)
```bash
sudo mkdir -p /opt && sudo chown "$USER":"$USER" /opt
cd /opt
git clone https://github.com/zufarovvv/pharmacy_bot.git
cd pharmacy_bot
uv sync          # Python 3.12 + все зависимости
```

## 5. Секреты и данные (scp с ЛОКАЛЬНОЙ машины)
В новом терминале на своём Mac, из папки проекта:
```bash
scp .env creds.json data/projects.xlsx <USER>@<SERVER_IP>:/opt/pharmacy_bot/
# если хотите первый импорт из CLI — добавьте недельный файл:
scp data/plans.xlsx <USER>@<SERVER_IP>:/opt/pharmacy_bot/data/
```

## 6. Прод-настройки `.env` (на сервере)
Откройте `/opt/pharmacy_bot/.env` и выставьте:
- `ALLOW_QUERY_TG_ID=0`  ← ОБЯЗАТЕЛЬНО (иначе любой прочитает `/api/me?tg_id=<чужой>`)
- `DB_USER` / `DB_PASS` / `DB_NAME=telegram_pharmacy_app` / `DB_HOST=localhost`
- `MANAGERS_GEO_SHEET_ID=1bfpeUpjv2XVK9b1ecPbrQDVEzJfhlowogGr30-i-9gg`  ← без него не проставятся менеджеры
- `WEB_APP_URL=` — заполним после п.7
- `BOT_TOKEN`, `DASHBOARD_SHEET_ID`, `ANTHROPIC_API_KEY`, `FEEDBACK_CHANNEL_ID` — как локально
- `API_PORT=8080`

## 7. Cloudflare named tunnel (постоянный HTTPS)
```bash
# установить cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cf.deb
sudo dpkg -i /tmp/cf.deb

# авторизация (выведет ссылку — открыть в браузере, выбрать свой домен)
cloudflared tunnel login

# создать туннель (запомнить Tunnel ID и путь ~/.cloudflared/<ID>.json)
cloudflared tunnel create datfo-bot

# привязать поддомен -> туннель (DNS-запись создастся автоматически)
cloudflared tunnel route dns datfo-bot bot.<ваш-домен>
```
Создать `~/.cloudflared/config.yml`:
```yaml
tunnel: datfo-bot
credentials-file: /home/<USER>/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: bot.<ваш-домен>
    service: http://localhost:8080
  - service: http_status:404
```
В `.env`: `WEB_APP_URL=https://bot.<ваш-домен>`.
Бот сам подставляет этот URL в кнопки Web App — BotFather трогать не обязательно.

## 8. Инициализация БД и первые данные
```bash
cd /opt/pharmacy_bot
uv run python database.py            # создаст таблицы
uv run python plans_sync.py --all    # первый импорт СВОД (если залили data/plans.xlsx)
# или позже — через бота: кнопка «📥 Загрузить Excel» (роль superadmin)
```
Доступы аптек (ИНН→telegram_id) ведутся в листе «Доступы» (Google) — синк подтянет сам.
Первого суперадмина назначить вручную:
```bash
sudo -u postgres psql -d telegram_pharmacy_app \
  -c "UPDATE users SET role='superadmin' WHERE telegram_id=<ВАШ_TG_ID>;"
```
(Сначала нажмите `/start` в боте, чтобы строка `users` появилась. Свой id — команда `/myid`.)

## 9. Автозапуск через systemd
`/etc/systemd/system/datfo-bot.service`:
```ini
[Unit]
Description=DATFO pharmacy bot + API
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
User=<USER>
WorkingDirectory=/opt/pharmacy_bot
ExecStart=/home/<USER>/.local/bin/uv run python bot.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
`/etc/systemd/system/cloudflared.service`:
```ini
[Unit]
Description=cloudflared tunnel
After=network-online.target
Wants=network-online.target

[Service]
User=<USER>
ExecStart=/usr/bin/cloudflared tunnel run datfo-bot
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
Запуск:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now datfo-bot cloudflared
```

## 10. Проверка
```bash
systemctl status datfo-bot cloudflared --no-pager
curl -s localhost:8080/api/health            # {"ok": true}
curl -s https://bot.<ваш-домен>/api/health   # {"ok": true}
journalctl -u datfo-bot -f                    # логи бота
```
Затем в Telegram: `/start` → кнопка Web App → дашборд.

## 11. Обновления (redeploy)
```bash
cd /opt/pharmacy_bot
git pull
uv sync
sudo systemctl restart datfo-bot
```

## Опционально: Chrome для кнопок-скриншотов
«📊 Получить данные» и «📊 Рассылка с данными» используют Selenium + Chrome:
```bash
sudo apt -y install chromium-browser chromium-chromedriver
```
Без них бот стартует и Mini App работает — падают только эти две кнопки.

## Если что-то не так
- Бот не стартует → `journalctl -u datfo-bot -n 50`.
- БД «password authentication failed» → проверьте `.env` и `pg_hba.conf` (для `127.0.0.1` должен быть `scram-sha-256`/`md5`).
- Туннель не поднимается → `journalctl -u cloudflared -n 50`; проверьте `config.yml` и что домен в Cloudflare.
- Web App пустой → `curl .../api/health`; проверьте `WEB_APP_URL` и что бот перезапущен после правки `.env`.
