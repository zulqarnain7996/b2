from __future__ import annotations

from pathlib import Path

from app.auth import ensure_admin_seed
from app.db import get_conn_cursor


def _run_sql_file(cursor, sql_path: Path) -> None:
    sql = sql_path.read_text(encoding="utf-8")
    statements = [s.strip() for s in sql.split(";") if s.strip()]
    for stmt in statements:
        cursor.execute(stmt)
        try:
            if getattr(cursor, "with_rows", False):
                cursor.fetchall()
        except Exception:
            pass


def _column_exists(cursor, table_name: str, column_name: str) -> bool:
    cursor.execute(
        """
        SELECT COUNT(*) AS total
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = %s
          AND column_name = %s
        """,
        (table_name, column_name),
    )
    row = cursor.fetchone()
    if isinstance(row, dict):
        return int(row.get("total", 0)) > 0
    return bool(row and row[0])


def _table_exists(cursor, table_name: str) -> bool:
    cursor.execute(
        """
        SELECT COUNT(*) AS total
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = %s
        """,
        (table_name,),
    )
    row = cursor.fetchone()
    if isinstance(row, dict):
        return int(row.get("total", 0)) > 0
    return bool(row and row[0])


def _ensure_legacy_upgrade_columns(cursor) -> None:
    if _table_exists(cursor, "employees"):
        if not _column_exists(cursor, "employees", "late_fine_pkr"):
            cursor.execute("ALTER TABLE employees ADD COLUMN late_fine_pkr DECIMAL(10,2) NOT NULL DEFAULT 0.00")
        if not _column_exists(cursor, "employees", "absent_fine_pkr"):
            cursor.execute("ALTER TABLE employees ADD COLUMN absent_fine_pkr DECIMAL(10,2) NOT NULL DEFAULT 0.00")
        if not _column_exists(cursor, "employees", "not_marked_fine_pkr"):
            cursor.execute("ALTER TABLE employees ADD COLUMN not_marked_fine_pkr DECIMAL(10,2) NOT NULL DEFAULT 0.00")
        if not _column_exists(cursor, "employees", "off_days_json"):
            cursor.execute("ALTER TABLE employees ADD COLUMN off_days_json TEXT NULL")
        if not _column_exists(cursor, "employees", "updated_at"):
            cursor.execute(
                "ALTER TABLE employees ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
            )
        cursor.execute(
            """
            UPDATE employees
            SET
              late_fine_pkr = COALESCE(NULLIF(late_fine_pkr, 0.00), fine_per_minute_pkr, 0.00),
              absent_fine_pkr = COALESCE(absent_fine_pkr, 0.00),
              not_marked_fine_pkr = COALESCE(not_marked_fine_pkr, 0.00)
            """
        )

    if _table_exists(cursor, "app_settings"):
        if not _column_exists(cursor, "app_settings", "late_fine_pkr"):
            cursor.execute("ALTER TABLE app_settings ADD COLUMN late_fine_pkr DECIMAL(10,2) NOT NULL DEFAULT 0.00")
        if not _column_exists(cursor, "app_settings", "absent_fine_pkr"):
            cursor.execute("ALTER TABLE app_settings ADD COLUMN absent_fine_pkr DECIMAL(10,2) NOT NULL DEFAULT 0.00")
        if not _column_exists(cursor, "app_settings", "not_marked_fine_pkr"):
            cursor.execute("ALTER TABLE app_settings ADD COLUMN not_marked_fine_pkr DECIMAL(10,2) NOT NULL DEFAULT 0.00")
        cursor.execute(
            """
            UPDATE app_settings
            SET
              late_fine_pkr = COALESCE(NULLIF(late_fine_pkr, 0.00), fine_per_minute_pkr, 0.00),
              absent_fine_pkr = COALESCE(absent_fine_pkr, 0.00),
              not_marked_fine_pkr = COALESCE(not_marked_fine_pkr, 0.00)
            WHERE id = 1
            """
        )

    if _table_exists(cursor, "users") and not _column_exists(cursor, "users", "force_password_change"):
        cursor.execute("ALTER TABLE users ADD COLUMN force_password_change TINYINT(1) NOT NULL DEFAULT 0")


def run() -> None:
    app_dir = Path(__file__).resolve().parent
    schema_path = app_dir / "schema.sql"
    migrations_dir = app_dir / "migrations"

    with get_conn_cursor() as (_, cursor):
        _run_sql_file(cursor, schema_path)
        _ensure_legacy_upgrade_columns(cursor)
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
