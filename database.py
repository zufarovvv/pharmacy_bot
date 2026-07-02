import asyncpg
import json
import os
from dotenv import load_dotenv

load_dotenv()

async def get_connection():
    return await asyncpg.connect(
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASS'),
        database=os.getenv('DB_NAME'),
        host=os.getenv('DB_HOST')
    )

async def create_tables():
    conn = await get_connection()
    try:
        # --- СУЩЕСТВУЮЩИЕ ТАБЛИЦЫ ---
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                telegram_id BIGINT PRIMARY KEY,
                role VARCHAR(20) DEFAULT 'ghost',
                language VARCHAR(5) DEFAULT 'ru'
            );
        ''')

        await conn.execute('''
            CREATE TABLE IF NOT EXISTS pharmacies (
                id SERIAL PRIMARY KEY,
                inn VARCHAR(50) UNIQUE,
                owner_tg_id BIGINT,
                business_name TEXT,
                pharmacy_name TEXT
            );
        ''')

        # JSONB-колонка с данными дашборда (проекты, бонусы, месячная статистика).
        # Шейп см. в Web App. Если пусто — UI покажет шаблон по умолчанию.
        await conn.execute('''
            ALTER TABLE pharmacies
            ADD COLUMN IF NOT EXISTS dashboard_data JSONB DEFAULT '{}'::jsonb;
        ''')

        # --- НОВЫЕ ТАБЛИЦЫ ДЛЯ ОПРОСОВ ---
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS polls (
                id SERIAL PRIMARY KEY,
                title TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );
        ''')

        await conn.execute('''
            CREATE TABLE IF NOT EXISTS poll_answers (
                poll_id INTEGER REFERENCES polls(id),
                user_id BIGINT REFERENCES users(telegram_id),
                answer VARCHAR(10),
                answered_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (poll_id, user_id)
            );
        ''')

        await conn.execute('CREATE INDEX IF NOT EXISTS idx_owner_tg ON pharmacies(owner_tg_id);')

        # --- ЛОГ СОБЫТИЙ (клики и действия в Mini App) ---
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS events (
                id BIGSERIAL PRIMARY KEY,
                tg_id BIGINT,
                pharmacy_inn VARCHAR(50),
                event_type VARCHAR(64) NOT NULL,
                payload JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP DEFAULT NOW()
            );
        ''')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_events_tg ON events(tg_id);')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);')

        # --- АВТОРИЗАЦИЯ ПО ЛОГИНУ/ПАРОЛЮ (для мобильного приложения, вне Telegram) ---
        # app_users: учётка с логином и паролем. Не пересекается с Telegram-входом.
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS app_users (
                id SERIAL PRIMARY KEY,
                login VARCHAR(64) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                is_admin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            );
        ''')

        # app_user_inns: какие аптеки (по ИНН) видит данный логин.
        # Не трогает pharmacies.owner_tg_id — Telegram-владельцы остаются нетронутыми.
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS app_user_inns (
                app_user_id INTEGER REFERENCES app_users(id) ON DELETE CASCADE,
                inn VARCHAR(50) NOT NULL,
                PRIMARY KEY (app_user_id, inn)
            );
        ''')

        # sessions: токены сессий мобильного приложения.
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                app_user_id INTEGER REFERENCES app_users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW()
            );
        ''')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(app_user_id);')

        # --- ВЫПЛАТЫ (карточка счёта 5110: оплата за услуги трейд-маркетинга) ---
        # Отдельная таблица, а не dashboard_data: недельный импорт СВОД полностью
        # перезаписывает dashboard_data и затёр бы историю. Источник — статичный xlsx,
        # матчинг к аптеке по названию фирмы (см. payments_import.py).
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS payments (
                id BIGSERIAL PRIMARY KEY,
                inn VARCHAR(50) NOT NULL,
                company TEXT,
                pay_date DATE NOT NULL,
                amount NUMERIC NOT NULL,
                doc TEXT
            );
        ''')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_payments_inn ON payments(inn);')

        print("✅ База данных готова (включая таблицы опросов, событий и авторизации).")
    finally:
        await conn.close()

# --- ЮЗЕРЫ ---

async def register_user(tg_id):
    conn = await get_connection()
    try:
        await conn.execute('''
            INSERT INTO users (telegram_id, role, language)
            VALUES ($1, 'ghost', 'ru')
            ON CONFLICT (telegram_id) DO NOTHING;
        ''', tg_id)
    finally:
        await conn.close()

async def get_user_data(tg_id):
    conn = await get_connection()
    try:
        return await conn.fetchrow('SELECT * FROM users WHERE telegram_id = $1', tg_id)
    finally:
        await conn.close()

async def update_user_role(tg_id, new_role):
    conn = await get_connection()
    try:
        await conn.execute('UPDATE users SET role = $1 WHERE telegram_id = $2', new_role, tg_id)
    finally:
        await conn.close()

async def upsert_user(tg_id, role, language):
    conn = await get_connection()
    try:
        await conn.execute('''
            INSERT INTO users (telegram_id, role, language)
            VALUES ($1, $2, $3)
            ON CONFLICT (telegram_id) DO UPDATE 
            SET language = $3, role = $2;
        ''', tg_id, role, language)
    finally:
        await conn.close()

async def get_all_active_users():
    conn = await get_connection()
    try:
        return await conn.fetch("SELECT telegram_id, language, role FROM users WHERE role != 'ghost'")
    finally:
        await conn.close()

# --- АПТЕКИ ---

async def get_pharmacies_by_tg_id(tg_id):
    conn = await get_connection()
    try:
        return await conn.fetch('SELECT * FROM pharmacies WHERE owner_tg_id = $1', tg_id)
    finally:
        await conn.close()

async def sync_update_pharmacies(pharmacy_list):
    conn = await get_connection()
    try:
        await conn.executemany('''
            INSERT INTO pharmacies (inn, owner_tg_id, business_name, pharmacy_name)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (inn) DO UPDATE 
            SET owner_tg_id = $2, 
                business_name = $3, 
                pharmacy_name = $4;
        ''', pharmacy_list)
    finally:
        await conn.close()

async def cleanup_old_pharmacies(active_inns):
    conn = await get_connection()
    try:
        await conn.execute('''
            DELETE FROM pharmacies 
            WHERE inn != ALL($1::varchar[])
        ''', active_inns)
    finally:
        await conn.close()

async def get_all_pharmacies_extended():
    conn = await get_connection()
    try:
        return await conn.fetch('''
            SELECT p.*, u.role
            FROM pharmacies p
            LEFT JOIN users u ON p.owner_tg_id = u.telegram_id
            ORDER BY p.id
        ''')
    finally:
        await conn.close()


async def update_pharmacy_dashboard(inn, data):
    """Обновляет dashboard_data одной аптеки по ИНН. data — dict (сериализуется в JSONB)."""
    conn = await get_connection()
    try:
        await conn.execute(
            'UPDATE pharmacies SET dashboard_data = $1::jsonb WHERE inn = $2',
            json.dumps(data, ensure_ascii=False),
            inn,
        )
    finally:
        await conn.close()


async def upsert_pharmacy_dashboard_only(inn, business_name, pharmacy_name, dashboard_data):
    """
    Создаёт или обновляет аптеку БЕЗ привязки tg_id (используется при импорте III-Q —
    там ИНН есть, а владельца Telegram пока не знаем).

    Если запись с таким ИНН уже была — owner_tg_id не трогаем.
    Если нет — вставляем с owner_tg_id=NULL (его потом проставит admin / отдельный маппер).
    """
    import json
    conn = await get_connection()
    try:
        await conn.execute('''
            INSERT INTO pharmacies (inn, business_name, pharmacy_name, dashboard_data)
            VALUES ($1, $2, $3, $4::jsonb)
            ON CONFLICT (inn) DO UPDATE
            SET business_name = EXCLUDED.business_name,
                pharmacy_name = EXCLUDED.pharmacy_name,
                dashboard_data = EXCLUDED.dashboard_data;
        ''',
            inn, business_name, pharmacy_name,
            json.dumps(dashboard_data, ensure_ascii=False),
        )
    finally:
        await conn.close()


async def upsert_pharmacy_full(inn, owner_tg_id, business_name, pharmacy_name, dashboard_data):
    """Создаёт или обновляет аптеку целиком (вместе с owner и dashboard_data)."""
    conn = await get_connection()
    try:
        # Сначала убедимся что юзер существует (FK на users нет, но на всякий)
        await conn.execute('''
            INSERT INTO users (telegram_id, role, language)
            VALUES ($1, 'user', 'ru')
            ON CONFLICT (telegram_id) DO UPDATE
            SET role = CASE WHEN users.role = 'ghost' THEN 'user' ELSE users.role END;
        ''', owner_tg_id)

        await conn.execute('''
            INSERT INTO pharmacies (inn, owner_tg_id, business_name, pharmacy_name, dashboard_data)
            VALUES ($1, $2, $3, $4, $5::jsonb)
            ON CONFLICT (inn) DO UPDATE
            SET owner_tg_id = EXCLUDED.owner_tg_id,
                business_name = EXCLUDED.business_name,
                pharmacy_name = EXCLUDED.pharmacy_name,
                dashboard_data = EXCLUDED.dashboard_data;
        ''',
            inn, owner_tg_id, business_name, pharmacy_name,
            json.dumps(dashboard_data, ensure_ascii=False),
        )
    finally:
        await conn.close()


async def patch_pharmacy_meta(inn, owner_tg_id, meta):
    """Режим «Google владеет только доступами/менеджерами».

    Обновляет привязку владельца (owner_tg_id) и СЛИВАЕТ мета-поля (контакты менеджера,
    категория) внутрь существующего dashboard_data через JSONB `||`, НЕ затрагивая цифры
    (totals/projects/months/bonuses/stats) — ими владеет xlsx-импорт.
    Обновляет только уже существующие строки (xlsx-импорт создаёт их раньше).
    """
    conn = await get_connection()
    try:
        if owner_tg_id:
            await conn.execute('''
                INSERT INTO users (telegram_id, role, language)
                VALUES ($1, 'user', 'ru')
                ON CONFLICT (telegram_id) DO UPDATE
                SET role = CASE WHEN users.role = 'ghost' THEN 'user' ELSE users.role END;
            ''', owner_tg_id)
        await conn.execute('''
            UPDATE pharmacies
            SET owner_tg_id = COALESCE($2, owner_tg_id),
                dashboard_data = COALESCE(dashboard_data, '{}'::jsonb) || $3::jsonb
            WHERE inn = $1;
        ''', inn, owner_tg_id, json.dumps(meta or {}, ensure_ascii=False))
    finally:
        await conn.close()

# --- ВЫПЛАТЫ (история оплат за трейд-маркетинг) ---

async def replace_all_payments(rows):
    """Полная перезагрузка истории выплат (источник — статичный xlsx за год).

    rows: список кортежей (inn, company, pay_date: date, amount: float, doc).
    """
    conn = await get_connection()
    try:
        async with conn.transaction():
            await conn.execute('TRUNCATE payments;')
            await conn.copy_records_to_table(
                'payments', records=rows,
                columns=['inn', 'company', 'pay_date', 'amount', 'doc'])
    finally:
        await conn.close()


async def get_payment_history_map(inns):
    """История выплат для набора аптек: {inn: {year: {...}}}.

    Формат года: {'total': float, 'count': int, 'months': [12 сумм],
                  'payments': [{'d': 'DD.MM.YYYY', 'a': float}, ...] (по убыванию даты)}.
    """
    if not inns:
        return {}
    conn = await get_connection()
    try:
        rows = await conn.fetch(
            'SELECT inn, pay_date, amount::float8 AS amount FROM payments '
            'WHERE inn = ANY($1) ORDER BY pay_date DESC', list(inns))
    finally:
        await conn.close()

    result = {}
    for r in rows:
        d = r['pay_date']
        year = result.setdefault(r['inn'], {}).setdefault(str(d.year), {
            'total': 0.0, 'count': 0, 'months': [0.0] * 12, 'payments': []})
        year['total'] += r['amount']
        year['count'] += 1
        year['months'][d.month - 1] += r['amount']
        year['payments'].append({'d': d.strftime('%d.%m.%Y'), 'a': r['amount']})
    return result


# --- ОПРОСЫ (НОВОЕ) ---

async def create_poll(title):
    conn = await get_connection()
    try:
        # Возвращаем ID созданного опроса
        row = await conn.fetchrow('INSERT INTO polls (title) VALUES ($1) RETURNING id', title)
        return row['id']
    finally:
        await conn.close()

async def save_poll_answer(poll_id, user_id, answer):
    conn = await get_connection()
    try:
        # Upsert: если передумал и нажал другую кнопку - обновим
        await conn.execute('''
            INSERT INTO poll_answers (poll_id, user_id, answer, answered_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (poll_id, user_id) DO UPDATE 
            SET answer = $3, answered_at = NOW();
        ''', poll_id, user_id, answer)
    finally:
        await conn.close()

async def get_poll_list(limit=20):
    conn = await get_connection()
    try:
        return await conn.fetch('SELECT * FROM polls ORDER BY created_at DESC LIMIT $1', limit)
    finally:
        await conn.close()

async def get_poll_stats_full(poll_id):
    """
    Возвращает список ВСЕХ активных юзеров и их ответы (если есть).
    Нужно для формирования полного Excel отчета.
    """
    conn = await get_connection()
    try:
        # Берем всех активных юзеров + их ответы на конкретный poll_id
        # Также подтягиваем данные по аптекам, чтобы отчет был информативным (берем первую попавшуюся аптеку юзера)
        return await conn.fetch('''
            SELECT 
                u.telegram_id, 
                u.role,
                pa.answer,
                (SELECT inn FROM pharmacies WHERE owner_tg_id = u.telegram_id LIMIT 1) as inn,
                (SELECT pharmacy_name FROM pharmacies WHERE owner_tg_id = u.telegram_id LIMIT 1) as pharmacy_name
            FROM users u
            LEFT JOIN poll_answers pa ON u.telegram_id = pa.user_id AND pa.poll_id = $1
            WHERE u.role != 'ghost'
        ''', poll_id)
    finally:
        await conn.close()

# --- СОБЫТИЯ / АНАЛИТИКА ---

async def log_event(tg_id, event_type, pharmacy_inn=None, payload=None):
    """Сохраняет событие в таблицу events. Не падает при любых ошибках."""
    conn = await get_connection()
    try:
        await conn.execute('''
            INSERT INTO events (tg_id, pharmacy_inn, event_type, payload)
            VALUES ($1, $2, $3, $4::jsonb);
        ''', tg_id, pharmacy_inn, event_type, json.dumps(payload or {}, ensure_ascii=False))
    finally:
        await conn.close()


async def get_event_stats(days=7):
    """
    Возвращает агрегаты по событиям за последние N дней:
      - total: всего событий
      - active_users: уникальных tg_id
      - by_type: [{event_type, count}] по убыванию count
      - top_pharmacies: топ-5 аптек по числу действий (по ИНН → имя)
      - top_users: топ-5 юзеров (tg_id → кол-во)
      - per_day: события по дням (для графика)
    """
    conn = await get_connection()
    try:
        total_row = await conn.fetchrow('''
            SELECT COUNT(*) as total,
                   COUNT(DISTINCT tg_id) as active_users
            FROM events
            WHERE created_at >= NOW() - ($1::int || ' days')::interval
        ''', days)

        by_type = await conn.fetch('''
            SELECT event_type, COUNT(*) as n
            FROM events
            WHERE created_at >= NOW() - ($1::int || ' days')::interval
            GROUP BY event_type
            ORDER BY n DESC
            LIMIT 30
        ''', days)

        top_pharmacies = await conn.fetch('''
            SELECT e.pharmacy_inn, COUNT(*) as n,
                   COALESCE(p.pharmacy_name, p.business_name, e.pharmacy_inn) as name
            FROM events e
            LEFT JOIN pharmacies p ON e.pharmacy_inn = p.inn
            WHERE e.created_at >= NOW() - ($1::int || ' days')::interval
              AND e.pharmacy_inn IS NOT NULL
            GROUP BY e.pharmacy_inn, p.pharmacy_name, p.business_name
            ORDER BY n DESC
            LIMIT 5
        ''', days)

        top_users = await conn.fetch('''
            SELECT tg_id, COUNT(*) as n
            FROM events
            WHERE created_at >= NOW() - ($1::int || ' days')::interval
              AND tg_id IS NOT NULL
            GROUP BY tg_id
            ORDER BY n DESC
            LIMIT 5
        ''', days)

        per_day = await conn.fetch('''
            SELECT DATE(created_at) as day, COUNT(*) as n
            FROM events
            WHERE created_at >= NOW() - ($1::int || ' days')::interval
            GROUP BY day
            ORDER BY day ASC
        ''', days)

        return {
            'days': days,
            'total': total_row['total'] if total_row else 0,
            'active_users': total_row['active_users'] if total_row else 0,
            'by_type': [{'event_type': r['event_type'], 'count': r['n']} for r in by_type],
            'top_pharmacies': [{'inn': r['pharmacy_inn'], 'name': r['name'], 'count': r['n']} for r in top_pharmacies],
            'top_users': [{'tg_id': r['tg_id'], 'count': r['n']} for r in top_users],
            'per_day': [{'day': r['day'].isoformat(), 'count': r['n']} for r in per_day],
        }
    finally:
        await conn.close()


# --- АВТОРИЗАЦИЯ ПО ЛОГИНУ/ПАРОЛЮ ---

async def get_pharmacies_by_inns(inns):
    """Возвращает аптеки по списку ИНН (для app-логина, который привязан к нескольким ИНН)."""
    if not inns:
        return []
    conn = await get_connection()
    try:
        return await conn.fetch(
            'SELECT * FROM pharmacies WHERE inn = ANY($1::varchar[]) ORDER BY id',
            list(inns),
        )
    finally:
        await conn.close()


async def create_app_user(login, password_hash, inns, is_admin=False):
    """Создаёт app_user с логином/паролем и привязывает к списку ИНН. Возвращает id."""
    conn = await get_connection()
    try:
        async with conn.transaction():
            row = await conn.fetchrow('''
                INSERT INTO app_users (login, password_hash, is_admin)
                VALUES ($1, $2, $3)
                ON CONFLICT (login) DO UPDATE
                SET password_hash = EXCLUDED.password_hash,
                    is_admin = EXCLUDED.is_admin
                RETURNING id;
            ''', login, password_hash, is_admin)
            app_user_id = row['id']
            # Перепривязываем ИНН заново (на случай повторного запуска).
            await conn.execute('DELETE FROM app_user_inns WHERE app_user_id = $1', app_user_id)
            for inn in inns:
                await conn.execute('''
                    INSERT INTO app_user_inns (app_user_id, inn)
                    VALUES ($1, $2)
                    ON CONFLICT DO NOTHING;
                ''', app_user_id, str(inn))
            return app_user_id
    finally:
        await conn.close()


async def get_app_user_by_login(login):
    """Возвращает строку app_users по логину (или None)."""
    conn = await get_connection()
    try:
        return await conn.fetchrow('SELECT * FROM app_users WHERE login = $1', login)
    finally:
        await conn.close()


async def get_app_user_inns(app_user_id):
    """Список ИНН, привязанных к app_user."""
    conn = await get_connection()
    try:
        rows = await conn.fetch(
            'SELECT inn FROM app_user_inns WHERE app_user_id = $1', app_user_id
        )
        return [r['inn'] for r in rows]
    finally:
        await conn.close()


async def create_session(token, app_user_id):
    """Сохраняет токен сессии."""
    conn = await get_connection()
    try:
        await conn.execute(
            'INSERT INTO sessions (token, app_user_id) VALUES ($1, $2)',
            token, app_user_id,
        )
    finally:
        await conn.close()


async def get_app_user_by_token(token):
    """По токену сессии возвращает app_user (id, login, is_admin) или None."""
    conn = await get_connection()
    try:
        return await conn.fetchrow('''
            SELECT u.id, u.login, u.is_admin
            FROM sessions s
            JOIN app_users u ON u.id = s.app_user_id
            WHERE s.token = $1
        ''', token)
    finally:
        await conn.close()


async def delete_session(token):
    """Удаляет токен сессии (выход)."""
    conn = await get_connection()
    try:
        await conn.execute('DELETE FROM sessions WHERE token = $1', token)
    finally:
        await conn.close()


if __name__ == "__main__":
    import asyncio
    asyncio.run(create_tables())