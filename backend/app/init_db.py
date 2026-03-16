from __future__ import annotations

from pathlib import Path

from app.auth import ensure_admin_seed
from app.db import get_conn_cursor


def _run_sql_file(cursor, sql_path: Path) -> None:
    sql = sql_path.read_text(encoding="utf-8")
    statements = [s.strip() for s in sql.split(";") if s.strip()]
    for stmt in statements:
        cursor.execute(stmt)

        # ✅ VERY IMPORTANT: clear any returned rows to avoid "Unread result found"
        try:
            if getattr(cursor, "with_rows", False):
                cursor.fetchall()
        except Exception:
            pass



def run() -> None:
    app_dir = Path(__file__).resolve().parent
    schema_path = app_dir / "schema.sql"
    migrations_dir = app_dir / "migrations"

    with get_conn_cursor() as (_, cursor):
        _run_sql_file(cursor, schema_path)
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
              id INT AUTO_INCREMENT PRIMARY KEY,
              filename VARCHAR(255) NOT NULL UNIQUE,
              applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        if migrations_dir.exists():
            for migration in sorted(migrations_dir.glob("*.sql")):
                cursor.execute(
                    "SELECT filename FROM schema_migrations WHERE filename=%s LIMIT 1",
                    (migration.name,),
                )
                if cursor.fetchone():
                    continue
                _run_sql_file(cursor, migration)
                cursor.execute(
                    "INSERT INTO schema_migrations (filename) VALUES (%s)",
                    (migration.name,),
                )

    ensure_admin_seed()


if __name__ == "__main__":
    run()
    print("Schema initialized successfully.")
