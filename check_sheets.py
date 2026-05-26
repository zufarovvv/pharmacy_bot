"""Диагностика подключения к Google Sheets. Запуск: uv run python check_sheets.py"""
import os
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials
import gspread

load_dotenv()

SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
SHEET_ID = os.getenv('SHEET_ID')
CREDS_FILE = os.getenv('GOOGLE_CREDS_FILE', 'creds.json')
REPORT_SHEET_GID = int(os.getenv('REPORT_SHEET_GID', '1272151386'))
DATA_SHEET_GID = int(os.getenv('DATA_SHEET_GID', '899393212'))

print(f"SHEET_ID            = {SHEET_ID}")
print(f"CREDS_FILE          = {CREDS_FILE} (exists: {os.path.exists(CREDS_FILE)})")
print(f"REPORT_SHEET_GID    = {REPORT_SHEET_GID}")
print(f"DATA_SHEET_GID      = {DATA_SHEET_GID}")
print()

if not SHEET_ID:
    raise SystemExit("❌ SHEET_ID не задан в .env")
if not os.path.exists(CREDS_FILE):
    raise SystemExit(f"❌ Файл {CREDS_FILE} не найден")

creds = Credentials.from_service_account_file(CREDS_FILE, scopes=SCOPES)
print(f"✅ Service account: {creds.service_account_email}")
print(f"   (Этот email должен быть расшарен в Google-таблице с правом Editor)\n")

client = gspread.authorize(creds)

try:
    wb = client.open_by_key(SHEET_ID)
    print(f"✅ Таблица открыта: {wb.title}")
except gspread.exceptions.APIError as e:
    raise SystemExit(f"❌ Не могу открыть таблицу: {e}\nПроверь: 1) SHEET_ID правильный, 2) сервис-аккаунт расшарен в таблице")

print("\nЛисты в таблице:")
report_ok = data_ok = False
for ws in wb.worksheets():
    marker = ""
    if ws.id == REPORT_SHEET_GID:
        marker = "  ← REPORT_SHEET_GID"
        report_ok = True
    if ws.id == DATA_SHEET_GID:
        marker = "  ← DATA_SHEET_GID"
        data_ok = True
    print(f"  title={ws.title!r:30}  gid={ws.id}{marker}")

print()
if not report_ok:
    print(f"⚠️  REPORT_SHEET_GID={REPORT_SHEET_GID} не найден. Скопируй gid нужного листа сверху в .env как REPORT_SHEET_GID=...")
if not data_ok:
    print(f"⚠️  DATA_SHEET_GID={DATA_SHEET_GID} не найден. Аналогично — добавь в .env DATA_SHEET_GID=...")
if report_ok and data_ok:
    print("✅ Оба листа найдены. Google Sheets настроены правильно.")
