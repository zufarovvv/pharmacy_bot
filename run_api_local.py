"""Локальный запуск API+webapp для разработки и превью (без bot.py).
Запуск: uv run python run_api_local.py   (порт 8099)
"""
import asyncio

import api


async def main():
    await api.start_api(port=8099, host='127.0.0.1')
    print('Preview ready at http://127.0.0.1:8099')
    await asyncio.Event().wait()


if __name__ == '__main__':
    asyncio.run(main())
