"""
Мини-API для Web App. Запускается параллельно с bot.py в одном процессе.

Эндпоинты:
  GET /api/me  →  данные текущего пользователя + его аптеки

Авторизация:
  1) Telegram WebApp initData (HMAC-SHA256 с BOT_TOKEN) — основной способ
  2) ?tg_id=... в query — дев-режим (отключается флагом ALLOW_QUERY_TG_ID=0)
"""
import json
import logging
import os
from pathlib import Path

from aiohttp import web
import aiohttp_cors
from aiogram.utils.web_app import safe_parse_webapp_init_data

from database import get_user_data, get_pharmacies_by_tg_id, get_all_pharmacies_extended

log = logging.getLogger(__name__)

BOT_TOKEN = os.getenv('BOT_TOKEN', '')
ALLOW_QUERY_TG_ID = os.getenv('ALLOW_QUERY_TG_ID', '0') == '1'
WEBAPP_DIR = Path(__file__).parent / 'webapp'


def validate_init_data(init_data: str, bot_token: str):
    """Проверяет подпись Telegram WebApp initData через aiogram. Возвращает dict с user или None."""
    if not init_data or not bot_token:
        return None
    try:
        data = safe_parse_webapp_init_data(token=bot_token, init_data=init_data)
        if data.user:
            return {'id': data.user.id, 'username': data.user.username}
        return None
    except Exception as e:
        log.warning(f"❌ initData validation failed: {type(e).__name__}: {e}")
        log.warning(f"   initData preview: {init_data[:200]}...")
        return None


async def resolve_tg_id(request: web.Request):
    """Достаёт tg_id из initData (приоритет) или из ?tg_id= (только в дев-режиме)."""
    init_data = (
        request.headers.get('X-Telegram-Init-Data')
        or request.query.get('init_data')
    )
    if init_data:
        user = validate_init_data(init_data, BOT_TOKEN)
        if user and user.get('id'):
            return int(user['id']), 'initData'

    if ALLOW_QUERY_TG_ID:
        raw = request.query.get('tg_id')
        if raw and raw.lstrip('-').isdigit():
            return int(raw), 'query'

    return None, None


async def handle_me(request: web.Request):
    tg_id, source = await resolve_tg_id(request)
    if not tg_id:
        return web.json_response({'error': 'unauthorized'}, status=401)

    user = await get_user_data(tg_id)
    if not user:
        return web.json_response({
            'error': 'not_registered',
            'tg_id': tg_id,
        }, status=404)

    if user['role'] == 'ghost':
        return web.json_response({'error': 'access_denied', 'tg_id': tg_id}, status=403)

    is_admin = user['role'] in ('admin', 'superadmin')
    if is_admin:
        pharmacies = await get_all_pharmacies_extended()
    else:
        pharmacies = await get_pharmacies_by_tg_id(tg_id)

    def _parse_dashboard(value):
        # asyncpg может вернуть JSONB как dict, так и как str (зависит от типа кодека)
        if value is None:
            return {}
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return {}
        return value

    return web.json_response({
        'tg_id': tg_id,
        'auth_source': source,
        'role': user['role'],
        'is_admin': is_admin,
        'language': user['language'],
        'pharmacies': [
            {
                'id': p['id'],
                'inn': p['inn'],
                'name': p['pharmacy_name'],
                'business': p['business_name'],
                'dashboard': _parse_dashboard(p.get('dashboard_data')),
            }
            for p in pharmacies
        ],
    })


async def handle_health(request: web.Request):
    return web.json_response({'ok': True})


async def handle_webapp_root(request: web.Request):
    """Отдаёт webapp/index.html при заходе на корень."""
    index = WEBAPP_DIR / 'index.html'
    if not index.exists():
        return web.Response(
            status=404,
            text='index.html не найден в webapp/. Скопируй фронт из datfo-app репо.',
        )
    return web.FileResponse(index)


def create_app() -> web.Application:
    app = web.Application()

    # API эндпоинты
    app.router.add_get('/api/me', handle_me)
    app.router.add_get('/api/health', handle_health)

    # Web App — раздаём всю папку webapp/ как статику; корень → index.html
    app.router.add_get('/', handle_webapp_root)
    if WEBAPP_DIR.exists():
        app.router.add_static('/', WEBAPP_DIR, show_index=False, follow_symlinks=False)

    cors = aiohttp_cors.setup(app, defaults={
        '*': aiohttp_cors.ResourceOptions(
            allow_credentials=False,
            expose_headers='*',
            allow_headers='*',
            allow_methods=['GET', 'OPTIONS'],
        )
    })
    # CORS — только для API роутов (статике он не нужен и aiohttp_cors не умеет static)
    for route in list(app.router.routes()):
        try:
            if route.resource and str(route.resource.canonical).startswith('/api/'):
                cors.add(route)
        except Exception:
            pass
    return app


async def start_api(port: int = 8080, host: str = '0.0.0.0'):
    """Стартует aiohttp-сервер в текущем event loop. Вызывается из bot.py."""
    # access_log=None отключает шумные строки на каждый запрос
    app = create_app()
    runner = web.AppRunner(app, access_log=None)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    if ALLOW_QUERY_TG_ID:
        print(f"🌐 API запущен на http://{host}:{port}")
        print("⚠️  ALLOW_QUERY_TG_ID=1 — любой может читать /api/me?tg_id=<id>. Только для dev!")
    else:
        print(f"🌐 API запущен на http://{host}:{port}  (auth: Telegram initData only)")
