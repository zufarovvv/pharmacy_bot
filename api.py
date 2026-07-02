"""
Мини-API для Web App. Запускается параллельно с bot.py в одном процессе.

Эндпоинты:
  GET /api/me  →  данные текущего пользователя + его аптеки

Авторизация:
  1) Telegram WebApp initData (HMAC-SHA256 с BOT_TOKEN) — основной способ
  2) ?tg_id=... в query — дев-режим (отключается флагом ALLOW_QUERY_TG_ID=0)
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import secrets
from pathlib import Path

from aiohttp import web
import aiohttp_cors
from aiogram.utils.web_app import safe_parse_webapp_init_data

from database import (
    get_user_data, get_pharmacies_by_tg_id, get_all_pharmacies_extended,
    log_event, get_event_stats,
    get_pharmacies_by_inns, get_app_user_by_login, get_app_user_inns,
    create_session, get_app_user_by_token, delete_session,
    get_payment_history_map,
)
from dashboard_sync import get_knowledge_cache

log = logging.getLogger(__name__)

BOT_TOKEN = os.getenv('BOT_TOKEN', '')
ALLOW_QUERY_TG_ID = os.getenv('ALLOW_QUERY_TG_ID', '0') == '1'
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY', '')
ANTHROPIC_MODEL = os.getenv('ANTHROPIC_MODEL', 'claude-haiku-4-5')
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


# === Авторизация по логину/паролю (для мобильного приложения вне Telegram) ===

PBKDF2_ROUNDS = 200_000


def hash_password(password: str, salt: str | None = None) -> str:
    """Хэширует пароль через PBKDF2-HMAC-SHA256. Формат: pbkdf2$<rounds>$<salt_hex>$<hash_hex>."""
    if salt is None:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), PBKDF2_ROUNDS)
    return f'pbkdf2${PBKDF2_ROUNDS}${salt}${dk.hex()}'


def verify_password(password: str, stored: str) -> bool:
    """Проверяет пароль против сохранённого хэша. Защищён от timing-атак."""
    try:
        algo, rounds, salt, hash_hex = stored.split('$')
        if algo != 'pbkdf2':
            return False
        dk = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), int(rounds))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except (ValueError, AttributeError):
        return False


def _extract_token(request: web.Request) -> str | None:
    """Достаёт токен сессии из заголовка Authorization: Bearer <token> или X-App-Token."""
    auth = request.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        return auth[7:].strip() or None
    return request.headers.get('X-App-Token') or None


async def resolve_principal(request: web.Request):
    """
    Единая точка авторизации. Возвращает dict-«принципала» либо tuple ошибки (error, status, extra).

    Принципал:
      {kind, is_admin, role, language, tg_id, app_user_id, inns, source, login}
    Для Telegram-юзера inns=None (аптеки берём по tg_id), для app-юзера-админа inns=None (все аптеки),
    для обычного app-юзера inns=<список ИНН>.
    """
    # 1) Telegram initData (приоритет — старый путь не меняется)
    tg_id, source = await resolve_tg_id(request)
    if tg_id:
        user = await get_user_data(tg_id)
        if not user:
            return ('not_registered', 404, {'tg_id': tg_id})
        if user['role'] == 'ghost':
            return ('access_denied', 403, {'tg_id': tg_id})
        return {
            'kind': 'tg',
            'tg_id': tg_id,
            'app_user_id': None,
            'is_admin': user['role'] in ('admin', 'superadmin'),
            'role': user['role'],
            'language': user['language'],
            'inns': None,
            'source': source,
            'login': None,
        }

    # 2) Токен сессии мобильного приложения
    token = _extract_token(request)
    if token:
        au = await get_app_user_by_token(token)
        if au:
            is_admin = bool(au['is_admin'])
            inns = None if is_admin else await get_app_user_inns(au['id'])
            return {
                'kind': 'app',
                'tg_id': None,
                'app_user_id': au['id'],
                'is_admin': is_admin,
                'role': 'admin' if is_admin else 'user',
                'language': 'ru',
                'inns': inns,
                'source': 'token',
                'login': au['login'],
            }

    return ('unauthorized', 401, {})


async def pharmacies_for(principal):
    """Возвращает список аптек, доступных принципалу."""
    if principal['is_admin']:
        return await get_all_pharmacies_extended()
    if principal['kind'] == 'tg':
        return await get_pharmacies_by_tg_id(principal['tg_id'])
    return await get_pharmacies_by_inns(principal['inns'] or [])


async def handle_login(request: web.Request):
    """POST /api/auth/login {login, password} → {token, is_admin}. Вход вне Telegram."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({'error': 'bad_json'}, status=400)

    login = (body.get('login') or '').strip()
    password = body.get('password') or ''
    if not login or not password:
        return web.json_response({'error': 'missing_credentials'}, status=400)

    au = await get_app_user_by_login(login)
    if not au or not verify_password(password, au['password_hash']):
        return web.json_response({'error': 'invalid_credentials'}, status=401)

    token = secrets.token_urlsafe(32)
    await create_session(token, au['id'])
    return web.json_response({
        'token': token,
        'login': au['login'],
        'is_admin': bool(au['is_admin']),
    })


async def handle_logout(request: web.Request):
    """POST /api/auth/logout → удаляет текущий токен сессии."""
    token = _extract_token(request)
    if token:
        await delete_session(token)
    return web.json_response({'ok': True})


async def handle_me(request: web.Request):
    principal = await resolve_principal(request)
    if isinstance(principal, tuple):
        error, status, extra = principal
        return web.json_response({'error': error, **extra}, status=status)

    is_admin = principal['is_admin']
    pharmacies = await pharmacies_for(principal)

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

    pharm_dicts_full = [
        {
            'id': p['id'],
            'inn': p['inn'],
            'name': p['pharmacy_name'],
            'business': p['business_name'],
            'dashboard': _parse_dashboard(p.get('dashboard_data')),
        }
        for p in pharmacies
    ]

    # Для админов считаем сводку по менеджерам — для контроля их работы.
    managers = _aggregate_managers(pharm_dicts_full) if is_admin else None

    # Для админа в списке тащить ПОЛНЫЕ dashboard_data всех аптек — медленно.
    # Отдаём slim-версию (только то что рисуется в строке списка); полные данные
    # фронт догружает через /api/pharmacy/{inn} когда админ кликнет конкретную.
    if is_admin:
        pharm_payload = [_slim_pharmacy(p) for p in pharm_dicts_full]
    else:
        # История выплат (таблица payments) — фронт рисует блок «История дохода».
        pay_map = await get_payment_history_map([p['inn'] for p in pharm_dicts_full])
        for p in pharm_dicts_full:
            p['dashboard']['payment_history'] = pay_map.get(p['inn']) or {}
        pharm_payload = pharm_dicts_full

    return web.json_response({
        'tg_id': principal['tg_id'],
        'login': principal['login'],
        'auth_source': principal['source'],
        'role': principal['role'],
        'is_admin': is_admin,
        'language': principal['language'],
        'pharmacies': pharm_payload,
        'managers': managers,
    })


def _slim_pharmacy(p):
    """Минимальная версия аптеки для админ-списка — без проектов/месяцев/полного дашборда."""
    d = p.get('dashboard') or {}
    totals = d.get('totals') or {}
    bonuses = d.get('bonuses') or {}
    accrued = bonuses.get('accrued') or {}
    return {
        'id': p['id'],
        'inn': p['inn'],
        'name': p['name'],
        'business': p['business'],
        'dashboard': {
            # Только поля, которые читает renderAdminList / renderAdminMgrList:
            'manager': d.get('manager'),
            'category': d.get('category'),
            'region': d.get('region'),
            'district': d.get('district'),
            'totals': {
                'quarter_percent': totals.get('quarter_percent'),
                'total_bonus': totals.get('total_bonus'),
                'total_bonus_raw': totals.get('total_bonus_raw'),
            },
            'bonuses': {
                'accrued': {'amount': accrued.get('amount')},
            },
            'stats': d.get('stats'),
        },
    }


def _aggregate_managers(pharm_dicts):
    """
    Группирует аптеки по менеджеру, считает агрегаты:
      - кол-во аптек у менеджера
      - средний % квартала
      - суммарный бонус
      - разбивка по статусам (completed/partial/critical) — на уровне аптек
    Сортирует по убыванию числа аптек.
    """
    by_mgr = {}
    for p in pharm_dicts:
        d = p.get('dashboard') or {}
        mgr = (d.get('manager') or '').strip() or '—'
        agg = by_mgr.setdefault(mgr, {
            'name': mgr,
            'pharm_count': 0,
            'pct_sum': 0,
            'pct_count': 0,
            'total_bonus_raw': 0,
            'completed': 0,
            'partial': 0,
            'critical': 0,
        })
        agg['pharm_count'] += 1
        totals = d.get('totals') or {}
        pct = totals.get('quarter_percent')
        if pct is not None:
            try:
                agg['pct_sum'] += float(pct)
                agg['pct_count'] += 1
            except (ValueError, TypeError):
                pass
        try:
            agg['total_bonus_raw'] += float(totals.get('total_bonus_raw') or 0)
        except (ValueError, TypeError):
            pass
        # Статус аптеки в целом — по её квартальному %.
        # Не путать с d['stats'] — там разбивка проектов внутри аптеки.
        if pct is not None:
            n = float(pct)
            if n >= 100: agg['completed'] += 1
            elif n >= 50: agg['partial'] += 1
            else: agg['critical'] += 1

    result = []
    for m in by_mgr.values():
        avg = round(m['pct_sum'] / m['pct_count']) if m['pct_count'] else None
        result.append({
            'name': m['name'],
            'pharm_count': m['pharm_count'],
            'avg_pct': avg,
            'total_bonus_raw': m['total_bonus_raw'],
            'completed': m['completed'],
            'partial': m['partial'],
            'critical': m['critical'],
        })
    result.sort(key=lambda m: m['pharm_count'], reverse=True)
    return result


async def handle_health(request: web.Request):
    return web.json_response({'ok': True})


async def handle_pharmacy_full(request: web.Request):
    """
    Возвращает полные данные одной аптеки по ИНН.
    Доступ:
      - админ/суперадмин — любую аптеку
      - обычный юзер — только свою (по owner_tg_id)
    """
    principal = await resolve_principal(request)
    if isinstance(principal, tuple):
        error, status, extra = principal
        # Для совместимости: 404/403 трактуем как access_denied на этом эндпоинте
        if status == 401:
            return web.json_response({'error': 'unauthorized'}, status=401)
        return web.json_response({'error': 'access_denied'}, status=403)

    inn = request.match_info.get('inn', '').strip()
    if not inn:
        return web.json_response({'error': 'no_inn'}, status=400)

    is_admin = principal['is_admin']

    # Берём всю аптеку с проверкой доступа
    from database import get_connection
    conn = await get_connection()
    try:
        row = await conn.fetchrow('SELECT * FROM pharmacies WHERE inn = $1', inn)
    finally:
        await conn.close()

    if not row:
        return web.json_response({'error': 'not_found'}, status=404)

    # Проверка доступа для не-админа: Telegram — по владельцу, app — по списку ИНН.
    if not is_admin:
        if principal['kind'] == 'tg':
            allowed = row['owner_tg_id'] == principal['tg_id']
        else:
            allowed = inn in (principal['inns'] or [])
        if not allowed:
            return web.json_response({'error': 'forbidden'}, status=403)

    def _parse(value):
        if value is None: return {}
        if isinstance(value, str):
            try: return json.loads(value)
            except json.JSONDecodeError: return {}
        return value

    dashboard = _parse(row['dashboard_data'])
    pay_map = await get_payment_history_map([inn])
    dashboard['payment_history'] = pay_map.get(inn) or {}

    return web.json_response({
        'id': row['id'],
        'inn': row['inn'],
        'name': row['pharmacy_name'],
        'business': row['business_name'],
        'dashboard': dashboard,
    })


# Whitelist допустимых типов событий — чтобы фронт не флудил произвольным мусором
ALLOWED_EVENT_TYPES = {
    'app_open',
    'tab_switch',
    'pharmacy_open',
    'manager_open',
    'manager_filter_clear',
    'project_click',
    'contact_manager',
    'phone_click',
    'tg_click',
    'alert_bar_click',
    'promo_shown',
    'promo_cta',
    'promo_skip',
    'language_switch',
    'tour_started',
    'tour_finished',
    'tour_skipped',
    'faq_open',
    'faq_question_open',
    'faq_tour_start',
    'ai_ask',
    'advice_cta',
    'app_close',
}


async def handle_events(request: web.Request):
    """Принимает событие с фронта и пишет в лог. Тихо игнорирует мусор."""
    principal = await resolve_principal(request)
    if isinstance(principal, tuple):
        return web.json_response({'error': 'unauthorized'}, status=401)
    tg_id = principal['tg_id']

    try:
        body = await request.json()
    except Exception:
        return web.json_response({'error': 'bad_json'}, status=400)

    event_type = body.get('event') or body.get('event_type')
    if not event_type or event_type not in ALLOWED_EVENT_TYPES:
        return web.json_response({'error': 'unknown_event'}, status=400)

    pharmacy_inn = body.get('pharmacy_inn')
    if pharmacy_inn is not None:
        pharmacy_inn = str(pharmacy_inn)[:50]
    payload = body.get('payload') or {}
    if not isinstance(payload, dict):
        payload = {}

    try:
        await log_event(tg_id, event_type, pharmacy_inn=pharmacy_inn, payload=payload)
    except Exception as e:
        log.warning(f"log_event failed: {e}")
        return web.json_response({'ok': False}, status=500)

    return web.json_response({'ok': True})


async def handle_ai_ask(request: web.Request):
    """
    AI-ассистент. Принимает вопрос аптеки, отвечает с учётом её данных + базы знаний.

    Body: {"question": "..."}
    Response: {"answer": "...", "model": "...", "config": false} — если ключ не задан
    """
    principal = await resolve_principal(request)
    if isinstance(principal, tuple):
        error, status, _ = principal
        if status == 401:
            return web.json_response({'error': 'unauthorized'}, status=401)
        return web.json_response({'error': 'access_denied'}, status=403)

    if not ANTHROPIC_API_KEY:
        return web.json_response({
            'error': 'ai_disabled',
            'message': 'AI-ассистент не настроен. Добавьте ANTHROPIC_API_KEY в .env',
        }, status=503)

    try:
        body = await request.json()
    except Exception:
        return web.json_response({'error': 'bad_json'}, status=400)

    question = (body.get('question') or '').strip()
    if not question:
        return web.json_response({'error': 'empty_question'}, status=400)
    if len(question) > 1000:
        return web.json_response({'error': 'too_long'}, status=400)

    # Контекст аптеки (если есть). Для AI берём только «свои» аптеки принципала,
    # для админа — без тяжёлой загрузки всех (его собственные, если есть).
    pharmacy_context = ''
    if principal['kind'] == 'tg':
        pharmacies = await get_pharmacies_by_tg_id(principal['tg_id'])
    else:
        pharmacies = await get_pharmacies_by_inns(principal['inns'] or [])
    if pharmacies:
        p = pharmacies[0]
        d_raw = p.get('dashboard_data') if isinstance(p, dict) else p['dashboard_data']
        if isinstance(d_raw, str):
            try:
                d = json.loads(d_raw)
            except json.JSONDecodeError:
                d = {}
        else:
            d = d_raw or {}
        totals = d.get('totals') or {}
        bonuses = d.get('bonuses') or {}
        pharmacy_context = (
            f"Аптека: {p['pharmacy_name']} (ИНН {p['inn']})\n"
            f"Регион: {d.get('region', '—')} / {d.get('district', '—')}\n"
            f"Категория: {d.get('category', '—')}\n"
            f"Менеджер: {d.get('manager', 'не назначен')}\n"
            f"Квартал: {totals.get('quarter_percent', '?')}% от плана\n"
            f"Заработано бонуса: {totals.get('total_bonus', '?')} сум\n"
            f"Потенциал: {(bonuses.get('potential') or {}).get('amount', '—')}\n"
            f"Активных проектов: {len(d.get('projects', []))}\n"
        )

    # База знаний (из листа «База знаний»)
    kb = get_knowledge_cache()
    if kb:
        kb_text = "\n\n".join([
            f"[{item.get('cat') or 'Общее'}] Вопрос: {item['q']}\nОтвет: {item['a']}"
            for item in kb
        ])
    else:
        kb_text = "(база знаний пуста — отвечай только из своих общих знаний и контекста аптеки)"

    lang = principal['language'] or 'ru'
    response_lang_instruction = 'Отвечай на русском' if lang == 'ru' else "O'zbek tilida javob ber"

    system_prompt = (
        "Ты — AI-ассистент DATFO, платформы для бизнес-аналитики аптек. "
        "Помогаешь владельцам и руководителям аптек разобраться в их данных и принять решение. "
        f"{response_lang_instruction}. Будь кратким, по делу, как бизнес-консультант. "
        "Не используй медицинскую терминологию — твоя аудитория предприниматели.\n\n"
        "Используй данные аптеки и базу знаний ниже. Если на вопрос нет ответа — честно скажи "
        "и предложи связаться с менеджером.\n\n"
        f"=== ДАННЫЕ АПТЕКИ ===\n{pharmacy_context or '(аптека не привязана к этому Telegram)'}\n\n"
        f"=== БАЗА ЗНАНИЙ ===\n{kb_text}"
    )

    # Anthropic SDK работает синхронно — оборачиваем в thread executor
    import anthropic
    loop = asyncio.get_running_loop()

    def _call_claude():
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        return client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=500,
            system=[
                {
                    "type": "text",
                    "text": system_prompt,
                    "cache_control": {"type": "ephemeral"},  # кешируем системный промпт
                }
            ],
            messages=[{"role": "user", "content": question}],
        )

    try:
        resp = await loop.run_in_executor(None, _call_claude)
        answer = resp.content[0].text if resp.content else ''
    except Exception as e:
        log.warning(f"ai_ask failed: {type(e).__name__}: {e}")
        return web.json_response({'error': 'ai_failed', 'message': str(e)}, status=500)

    # Лог события (для аналитики)
    try:
        inn = pharmacies[0]['inn'] if pharmacies else None
        await log_event(principal['tg_id'], 'ai_ask', pharmacy_inn=inn,
                        payload={'q_len': len(question), 'a_len': len(answer)})
    except Exception:
        pass

    return web.json_response({
        'answer': answer,
        'model': ANTHROPIC_MODEL,
    })


async def handle_admin_stats(request: web.Request):
    """Сводка по событиям. Только для admin/superadmin."""
    principal = await resolve_principal(request)
    if isinstance(principal, tuple):
        if principal[1] == 401:
            return web.json_response({'error': 'unauthorized'}, status=401)
        return web.json_response({'error': 'forbidden'}, status=403)
    if not principal['is_admin']:
        return web.json_response({'error': 'forbidden'}, status=403)

    days = 7
    try:
        days = int(request.query.get('days', '7'))
    except (TypeError, ValueError):
        pass
    days = max(1, min(days, 90))  # ограничим разумными пределами

    try:
        stats = await get_event_stats(days=days)
    except Exception as e:
        log.warning(f"get_event_stats failed: {e}")
        return web.json_response({'error': 'db'}, status=500)

    return web.json_response(stats)


async def handle_webapp_root(request: web.Request):
    """Отдаёт webapp/index.html при заходе на корень."""
    index = WEBAPP_DIR / 'index.html'
    if not index.exists():
        return web.Response(
            status=404,
            text='index.html не найден в webapp/. Скопируй фронт из datfo-app репо.',
        )
    return web.FileResponse(index)


@web.middleware
async def no_cache_middleware(request, handler):
    """
    Заставляем Telegram WebApp всегда тянуть свежий index.html / app.js.
    Без этого правки фронта подтягиваются с задержкой (или не подтягиваются вовсе
    пока юзер не сделает «Перезагрузить» в Mini App).
    """
    response = await handler(request)
    path = request.path
    if path == '/' or path.endswith(('.html', '.js', '.css')):
        response.headers['Cache-Control'] = 'no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response


def create_app() -> web.Application:
    app = web.Application(middlewares=[no_cache_middleware])

    # API эндпоинты
    app.router.add_post('/api/auth/login', handle_login)
    app.router.add_post('/api/auth/logout', handle_logout)
    app.router.add_get('/api/me', handle_me)
    app.router.add_get('/api/health', handle_health)
    app.router.add_get('/api/pharmacy/{inn}', handle_pharmacy_full)
    app.router.add_post('/api/events', handle_events)
    app.router.add_post('/api/ai/ask', handle_ai_ask)
    app.router.add_get('/api/admin/stats', handle_admin_stats)

    # Web App — раздаём всю папку webapp/ как статику; корень → index.html
    app.router.add_get('/', handle_webapp_root)
    if WEBAPP_DIR.exists():
        app.router.add_static('/', WEBAPP_DIR, show_index=False, follow_symlinks=False)

    cors = aiohttp_cors.setup(app, defaults={
        '*': aiohttp_cors.ResourceOptions(
            allow_credentials=False,
            expose_headers='*',
            allow_headers='*',
            allow_methods=['GET', 'POST', 'OPTIONS'],
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
