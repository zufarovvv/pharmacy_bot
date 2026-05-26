import asyncio
import os
import time
import gspread
from google.oauth2.service_account import Credentials
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from dotenv import load_dotenv
from PIL import Image, ImageChops

load_dotenv()

SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
SHEET_ID = os.getenv('SHEET_ID')
REPORT_SHEET_GID = int(os.getenv('REPORT_SHEET_GID', '1272151386'))
CREDS_FILE = os.getenv('GOOGLE_CREDS_FILE', 'creds.json')

CROP_TOP = 200
CROP_LEFT = 50


# --- ВСПОМОГАТЕЛЬНЫЕ БЛОКИРУЮЩИЕ ФУНКЦИИ ---
# Они работают долго, поэтому мы будем вызывать их через executor

def _blocking_update_inn(inn_value):
    try:
        creds = Credentials.from_service_account_file(CREDS_FILE, scopes=SCOPES)
        client = gspread.authorize(creds)
        workbook = client.open_by_key(SHEET_ID)

        worksheet = None
        available_gids = []
        for ws in workbook.worksheets():
            available_gids.append((ws.title, ws.id))
            if ws.id == REPORT_SHEET_GID:
                worksheet = ws
                break

        if not worksheet:
            print(f"❌ REPORT_SHEET_GID={REPORT_SHEET_GID} не найден в таблице.")
            print(f"   Доступные листы (title, gid): {available_gids}")
            return False

        worksheet.update_cell(4, 3, inn_value)
        return True
    except Exception as e:
        import traceback
        print(f"❌ Google Sheets API Error: {type(e).__name__}: {e}")
        traceback.print_exc()
        return False


def _blocking_take_screenshot(output_filename):
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--force-device-scale-factor=1.0")
    chrome_options.add_argument("--window-size=4000,3000")

    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid={REPORT_SHEET_GID}"
    driver = None
    try:
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)
        driver.get(url)
        time.sleep(2)  # Блокирующий сон (в потоке это ок)

        temp_filename = f"temp_{output_filename}"
        driver.save_screenshot(temp_filename)

        # Обрезка
        image = Image.open(temp_filename)
        width, height = image.size
        image = image.crop((CROP_LEFT, CROP_TOP, width, height))

        # Умная обрезка (aggressive)
        bg = Image.new(image.mode, image.size, image.getpixel((0, 0)))
        diff = ImageChops.difference(image, bg)
        gray = diff.convert('L')
        mask = gray.point(lambda x: 255 if x > 40 else 0, '1')
        bbox = mask.getbbox()
        if bbox:
            image = image.crop(bbox)

        image.save(output_filename)
        if os.path.exists(temp_filename):
            os.remove(temp_filename)
        return True
    except Exception as e:
        print(f"Selenium Error: {e}")
        return False
    finally:
        if driver:
            driver.quit()


# --- АСИНХРОННЫЕ ОБЕРТКИ (Чтобы бот не вис) ---

async def update_inn_in_sheet(inn_value):
    loop = asyncio.get_running_loop()
    # Запускаем тяжелую задачу в отдельном потоке
    return await loop.run_in_executor(None, _blocking_update_inn, inn_value)


async def take_screenshot(output_filename="report.png"):
    loop = asyncio.get_running_loop()
    # Запускаем браузер в отдельном потоке
    return await loop.run_in_executor(None, _blocking_take_screenshot, output_filename)