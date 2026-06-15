"""
Подключение к ClickHouse DWH (источник цифр по аптекам).

Креды берутся из .env:
  CLICKHOUSE_HOST       хост (например, dwh.example.uz)
  CLICKHOUSE_PORT       порт (8443 для HTTPS, 8123 для HTTP). По умолчанию 8443.
  CLICKHOUSE_USER       пользователь
  CLICKHOUSE_PASSWORD   пароль
  CLICKHOUSE_DB         база (database) по умолчанию
  CLICKHOUSE_SECURE     1 = HTTPS (по умолчанию), 0 = HTTP
"""
import os

import clickhouse_connect
from dotenv import load_dotenv

load_dotenv()


def get_dwh_client():
    """Возвращает синхронный клиент ClickHouse (clickhouse-connect)."""
    secure = os.getenv('CLICKHOUSE_SECURE', '1') == '1'
    default_port = 8443 if secure else 8123
    return clickhouse_connect.get_client(
        host=os.getenv('CLICKHOUSE_HOST'),
        port=int(os.getenv('CLICKHOUSE_PORT', str(default_port))),
        username=os.getenv('CLICKHOUSE_USER', 'default'),
        password=os.getenv('CLICKHOUSE_PASSWORD', ''),
        database=os.getenv('CLICKHOUSE_DB') or None,
        secure=secure,
    )
