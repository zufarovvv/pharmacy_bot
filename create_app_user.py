"""
Создаёт пользователя для входа в мобильное приложение (логин/пароль).
Привязывает его к одной или нескольким аптекам по списку ИНН.

Примеры:
  uv run python create_app_user.py --login pharma1 --password secret123 --inns 900000001,900000002
  uv run python create_app_user.py --login boss --password adminpass --admin

Флаг --admin делает пользователя админом (видит ВСЕ аптеки, список ИНН не нужен).
Повторный запуск с тем же --login обновит пароль и перепривяжет ИНН.
"""
import argparse
import asyncio

from database import create_app_user, get_pharmacies_by_inns
# Переиспользуем хэширование из API — единый источник правды.
from api import hash_password


async def main():
    parser = argparse.ArgumentParser(description='Создать app-пользователя (логин/пароль)')
    parser.add_argument('--login', required=True, help='Логин (уникальный)')
    parser.add_argument('--password', required=True, help='Пароль')
    parser.add_argument('--inns', default='', help='Список ИНН через запятую (для не-админа)')
    parser.add_argument('--admin', action='store_true', help='Сделать админом (видит все аптеки)')
    args = parser.parse_args()

    inns = [i.strip() for i in args.inns.split(',') if i.strip()]

    if not args.admin and not inns:
        print('❌ Для обычного пользователя нужно указать --inns (хотя бы один ИНН).')
        print('   Либо добавьте --admin, чтобы дать доступ ко всем аптекам.')
        return

    # Проверим, что указанные ИНН реально существуют в pharmacies.
    if inns:
        found = await get_pharmacies_by_inns(inns)
        found_inns = {p['inn'] for p in found}
        missing = [i for i in inns if i not in found_inns]
        if missing:
            print(f'⚠️  Эти ИНН не найдены в pharmacies: {", ".join(missing)}')
            print('   Пользователь всё равно будет создан, но эти аптеки он не увидит.')

    password_hash = hash_password(args.password)
    app_user_id = await create_app_user(
        login=args.login,
        password_hash=password_hash,
        inns=inns,
        is_admin=args.admin,
    )

    print(f'✅ Пользователь создан/обновлён: id={app_user_id}, login={args.login}')
    if args.admin:
        print('   Роль: АДМИН (доступ ко всем аптекам)')
    else:
        print(f'   Привязанные ИНН: {", ".join(inns)}')


if __name__ == '__main__':
    asyncio.run(main())
