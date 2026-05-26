import asyncio
import gspread
from google.oauth2.service_account import Credentials
import os
from dotenv import load_dotenv
from database import sync_update_pharmacies, cleanup_old_pharmacies

load_dotenv()

SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
DATA_SHEET_GID = int(os.getenv('DATA_SHEET_GID', '899393212'))
CREDS_FILE = os.getenv('GOOGLE_CREDS_FILE', 'creds.json')


def get_google_data():
    try:
        creds = Credentials.from_service_account_file(CREDS_FILE, scopes=SCOPES)
        client = gspread.authorize(creds)

        sheet_id = os.getenv('SHEET_ID')
        if not sheet_id:
            print("❌ SHEET_ID не задан в .env")
            return []

        workbook = client.open_by_key(sheet_id)

        ws = None
        available_gids = []
        for w in workbook.worksheets():
            available_gids.append((w.title, w.id))
            if w.id == DATA_SHEET_GID:
                ws = w
                break

        if not ws:
            print(f"❌ DATA_SHEET_GID={DATA_SHEET_GID} не найден в таблице.")
            print(f"   Доступные листы (title, gid): {available_gids}")
            return []

        return ws.get_all_values()
    except Exception as e:
        import traceback
        print(f"❌ Google Sheets read error: {type(e).__name__}: {e}")
        traceback.print_exc()
        return []


async def sync_pharmacies():
    print("🔄 [SYNC] Начало синхронизации с Google...")

    # 1. Читаем данные (в отдельном потоке, чтобы не блочить бота)
    loop = asyncio.get_running_loop()
    raw_rows = await loop.run_in_executor(None, get_google_data)

    if not raw_rows:
        return

    pharmacies_to_upsert = []
    active_inns = []

    # 2. Парсим (пропускаем заголовки)
    # Предполагаем, что данные с 4-5 строки, но лучше пройтись по всем и фильтровать
    for row in raw_rows:
        if len(row) < 5: continue

        # Столбцы: B(1)=INN, C(2)=TG, D(3)=Biz, E(4)=Name
        inn = row[1].strip()
        tg_id_raw = row[2].strip()
        biz = row[3].strip()
        name = row[4].strip()

        if not inn.isdigit() or len(inn) < 5: continue
        if not tg_id_raw: continue

        try:
            tg_id = int(tg_id_raw)
            pharmacies_to_upsert.append((inn, tg_id, biz, name))
            active_inns.append(inn)
        except ValueError:
            continue

    # 3. Обновляем базу
    if pharmacies_to_upsert:
        try:
            # Обновляем/Вставляем
            await sync_update_pharmacies(pharmacies_to_upsert)

            # Удаляем те, что исчезли из файла
            await cleanup_old_pharmacies(active_inns)

            print(f"✅ [SYNC] Успешно! Активных аптек: {len(active_inns)}")
        except Exception as e:
            print(f"❌ [SYNC] Ошибка записи в БД: {e}")
    else:
        print("⚠️ [SYNC] Файл пуст или не удалось прочитать данные.")


if __name__ == "__main__":
    asyncio.run(sync_pharmacies())