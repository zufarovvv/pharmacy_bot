"""
Одноразовый bulk-импорт клиентов из мастер-Data листа в Google-таблице.

Читает SHEET_ID + DATA_SHEET_GID (из .env), парсит строки как:
  B=ИНН, C=TG_ID, D=Business name, E=Pharmacy name

Для каждой валидной строки:
- INSERT/UPDATE в users (роль 'user', не трогает existing admin/superadmin)
- INSERT/UPDATE в pharmacies (не трогает dashboard_data)

dashboard_data заполняется отдельно через dashboard_sync.py из Excel-листов.
Запуск:  uv run python seed_clients.py
"""
import asyncio
import os

import asyncpg
import gspread
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials

load_dotenv()

SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
]
SHEET_ID = os.getenv('SHEET_ID')
DATA_SHEET_GID = int(os.getenv('DATA_SHEET_GID', '0'))
CREDS_FILE = os.getenv('GOOGLE_CREDS_FILE', 'creds.json')


def read_master_sheet():
    """Возвращает список dict с ключами: inn, tg_id, business, pharmacy."""
    creds = Credentials.from_service_account_file(CREDS_FILE, scopes=SCOPES)
    client = gspread.authorize(creds)
    wb = client.open_by_key(SHEET_ID)
    ws = next((w for w in wb.worksheets() if w.id == DATA_SHEET_GID), None)
    if not ws:
        print(f"❌ Лист с gid={DATA_SHEET_GID} не найден")
        return []

    rows = ws.get_all_values()
    result = []
    for r in rows:
        if len(r) < 5:
            continue
        inn = r[1].strip() if len(r) > 1 else ''
        tg_raw = r[2].strip() if len(r) > 2 else ''
        biz = r[3].strip() if len(r) > 3 else ''
        name = r[4].strip() if len(r) > 4 else ''

        if not inn.isdigit() or len(inn) < 5:
            continue
        if not tg_raw or not tg_raw.lstrip('-').isdigit():
            continue
        result.append({
            'inn': inn,
            'tg_id': int(tg_raw),
            'business': biz,
            'pharmacy': name,
        })
    return result


async def get_conn():
    return await asyncpg.connect(
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASS'),
        database=os.getenv('DB_NAME'),
        host=os.getenv('DB_HOST'),
    )


async def main():
    print("📥 Читаю мастер-лист...")
    clients = read_master_sheet()
    if not clients:
        print("⚠️ Ничего не нашёл — выход")
        return
    print(f"   Найдено валидных записей: {len(clients)}")

    conn = await get_conn()
    try:
        users_added = 0
        pharms_added = 0
        for c in clients:
            # Юзер: если ghost — апгрейдим до user. Если уже admin/superadmin — не трогаем.
            await conn.execute('''
                INSERT INTO users (telegram_id, role, language)
                VALUES ($1, 'user', 'ru')
                ON CONFLICT (telegram_id) DO UPDATE
                SET role = CASE WHEN users.role = 'ghost' THEN 'user' ELSE users.role END;
            ''', c['tg_id'])
            users_added += 1

            # Аптека: создаём или обновляем meta (НЕ ТРОГАЕМ dashboard_data)
            await conn.execute('''
                INSERT INTO pharmacies (inn, owner_tg_id, business_name, pharmacy_name)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (inn) DO UPDATE
                SET owner_tg_id = EXCLUDED.owner_tg_id,
                    business_name = EXCLUDED.business_name,
                    pharmacy_name = EXCLUDED.pharmacy_name;
            ''', c['inn'], c['tg_id'], c['business'], c['pharmacy'])
            pharms_added += 1
    finally:
        await conn.close()

    print(f"✅ Готово.")
    print(f"   Юзеров обработано:  {users_added}")
    print(f"   Аптек обработано:   {pharms_added}")
    print()
    print("Все юзеры получили роль 'user' (если были ghost). Аптеки привязаны.")
    print("dashboard_data пустой — заполнится когда менеджер сделает Excel-лист на эту аптеку.")


if __name__ == "__main__":
    asyncio.run(main())
