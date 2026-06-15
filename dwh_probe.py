"""
Исследователь схемы DWH: подключается к ClickHouse и показывает базы, таблицы,
их структуру и образцы строк. Нужен, чтобы понять, откуда брать цифры по аптекам.

Запуск:
  uv run python dwh_probe.py                 # список баз и таблиц
  uv run python dwh_probe.py <table>         # структура + 5 строк конкретной таблицы
  uv run python dwh_probe.py <table> 20      # 20 строк
"""
import sys

from dwh import get_dwh_client


def main():
    client = get_dwh_client()
    print(f"✅ Подключение к ClickHouse успешно ({client.server_version})\n")

    if len(sys.argv) < 2:
        # Список баз
        dbs = client.query("SHOW DATABASES").result_rows
        print("=== БАЗЫ ===")
        for (db,) in dbs:
            print(f"  {db}")
        # Список таблиц в текущей базе
        print("\n=== ТАБЛИЦЫ (текущая база) ===")
        try:
            tables = client.query("SHOW TABLES").result_rows
            for (t,) in tables:
                print(f"  {t}")
        except Exception as e:
            print(f"  (не удалось получить список таблиц: {e})")
        print("\nДальше: uv run python dwh_probe.py <table>  — структура и образец строк.")
        return

    table = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 5

    print(f"=== СТРУКТУРА {table} ===")
    desc = client.query(f"DESCRIBE TABLE {table}").result_rows
    for row in desc:
        # name, type, default_type, default_expr, comment, ...
        name = row[0]
        typ = row[1]
        comment = row[4] if len(row) > 4 else ''
        print(f"  {name:35s} {typ:25s} {comment}")

    print(f"\n=== {limit} СТРОК {table} ===")
    res = client.query(f"SELECT * FROM {table} LIMIT {limit}")
    cols = res.column_names
    print("  " + " | ".join(cols))
    for r in res.result_rows:
        print("  " + " | ".join(str(x) for x in r))


if __name__ == "__main__":
    main()
