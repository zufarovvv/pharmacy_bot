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

        print("✅ База данных готова (включая таблицы опросов и событий).")
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


if __name__ == "__main__":
    import asyncio
    asyncio.run(create_tables())