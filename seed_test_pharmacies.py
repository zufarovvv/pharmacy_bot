"""
Создаёт 2-3 ТЕСТОВЫЕ аптеки для проверки входа по логину/паролю.

ИНН с префиксом 9000000XX — заведомо фейковые, не пересекаются с реальными.
owner_tg_id = NULL: тестовые аптеки не привязаны к Telegram-владельцу,
доступ к ним будет только через app-логин (app_user_inns).

Запуск:   uv run python seed_test_pharmacies.py
Удалить:  uv run python seed_test_pharmacies.py --delete
"""
import asyncio
import json
import os
import sys

import asyncpg
from dotenv import load_dotenv

load_dotenv()

# ИНН тестовых аптек (легко найти и удалить по этому префиксу).
TEST_INNS = ['900000001', '900000002', '900000003']


def _make_dashboard(inn, name, manager, quarter_percent, total_bonus):
    """Минимальный, но реалистичный dashboard_data в формате, который рисует Web App."""
    total_bonus_raw = float(total_bonus)
    return {
        'inn': inn,
        'name': name,
        'city': 'Ташкент',
        'region': 'Toshkent',
        'district': 'Yunusobod',
        'category': 'A',
        'manager': manager,
        'manager_phone': '',
        'manager_username': '',
        'legal_name': f'"{name}" MChJ',
        'stats': {'completed': 1, 'partial': 1, 'critical': 0},
        'months': {
            'january': {'fact': '480 000', 'plan': '450 000', 'percent': 107},
            'february': {'fact': '500 000', 'plan': '520 000', 'percent': 96},
            'march': {'fact': '610 000', 'plan': '600 000', 'percent': 102},
        },
        'totals': {
            'quarter_plan': '1 570 000',
            'quarter_plan_raw': 1570000.0,
            'quarter_percent': quarter_percent,
            'total_bonus': f'{total_bonus:,}'.replace(',', ' '),
            'total_bonus_raw': total_bonus_raw,
            'remaining': '',
        },
        'bonuses': {
            'accrued': {'amount': f'{total_bonus:,}'.replace(',', ' '), 'desc': '1 проектов на 100%+'},
            'completed': {'amount': f'{total_bonus:,}'.replace(',', ' '), 'desc': 'sentiss'},
            'potential': {'amount': '+ 0', 'desc': 'До цели по 0 проектам'},
        },
        'projects': [
            {
                'name': 'sentiss',
                'status': 'completed',
                'percent': quarter_percent,
                'fact': '1 590 000',
                'plan': '1 570 000',
                'quarter_plan': '1 570 000',
                'quarter_plan_raw': 1570000.0,
                'bonus_amount': f'{total_bonus:,}'.replace(',', ' '),
                'bonus_amount_raw': total_bonus_raw,
                'bonus_percent': 7,
                'condition': '1500000',
                'remaining': '+ 0',
            }
        ],
        'income_quarter': f'{total_bonus:,}'.replace(',', ' '),
    }


# (inn, business_name, pharmacy_name, manager, quarter_percent, total_bonus)
TEST_PHARMACIES = [
    ('900000001', 'TEST ALPHA PHARM MChJ', 'TEST Аптека Альфа', 'Тест Менеджер 1', 104, 35000),
    ('900000002', 'TEST BETA PHARM MChJ', 'TEST Аптека Бета', 'Тест Менеджер 1', 88, 20000),
    ('900000003', 'TEST GAMMA PHARM MChJ', 'TEST Аптека Гамма', 'Тест Менеджер 2', 117, 50000),
]


async def get_conn():
    return await asyncpg.connect(
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASS'),
        database=os.getenv('DB_NAME'),
        host=os.getenv('DB_HOST'),
    )


async def delete_test():
    conn = await get_conn()
    try:
        res = await conn.execute(
            'DELETE FROM pharmacies WHERE inn = ANY($1::varchar[])', TEST_INNS
        )
        print(f'🗑  Удалены тестовые аптеки: {res}')
    finally:
        await conn.close()


async def seed():
    conn = await get_conn()
    try:
        for inn, biz, name, manager, qp, bonus in TEST_PHARMACIES:
            dd = _make_dashboard(inn, name, manager, qp, bonus)
            await conn.execute('''
                INSERT INTO pharmacies (inn, owner_tg_id, business_name, pharmacy_name, dashboard_data)
                VALUES ($1, NULL, $2, $3, $4::jsonb)
                ON CONFLICT (inn) DO UPDATE
                SET business_name = EXCLUDED.business_name,
                    pharmacy_name = EXCLUDED.pharmacy_name,
                    dashboard_data = EXCLUDED.dashboard_data;
            ''', inn, biz, name, json.dumps(dd, ensure_ascii=False))
            print(f'✅ {inn}  {name}  (квартал {qp}%, бонус {bonus})')
        print(f'\nГотово: {len(TEST_PHARMACIES)} тестовых аптек.')
        print('Привязка к логинам — через create_app_user.py (Этап 1).')
    finally:
        await conn.close()


if __name__ == '__main__':
    if '--delete' in sys.argv:
        asyncio.run(delete_test())
    else:
        asyncio.run(seed())
