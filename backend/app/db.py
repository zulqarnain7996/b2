from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path

import mysql.connector
from dotenv import load_dotenv
from mysql.connector import pooling

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

_pool: pooling.MySQLConnectionPool | None = None


def get_pool() -> pooling.MySQLConnectionPool:
    global _pool
    if _pool is None:
        _pool = pooling.MySQLConnectionPool(
            pool_name="face_attendance_pool",
            pool_size=8,
            host=os.getenv("DB_HOST", "localhost"),
            port=int(os.getenv("DB_PORT", "3306")),
            user=os.getenv("DB_USER", "root"),
            password=os.getenv("DB_PASSWORD", ""),
            database=os.getenv("DB_NAME", "face_attendance"),
            autocommit=False,
        )
    return _pool


def reset_pool() -> None:
    global _pool
    _pool = None


@contextmanager
def get_conn_cursor(dictionary: bool = False):
    conn = get_pool().get_connection()
    cursor = conn.cursor(dictionary=dictionary)
    try:
        yield conn, cursor
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()
