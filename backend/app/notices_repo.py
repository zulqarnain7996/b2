from __future__ import annotations

from datetime import datetime
from typing import Any


PRIORITY_ORDER_SQL = (
    "CASE priority "
    "WHEN 'urgent' THEN 3 "
    "WHEN 'important' THEN 2 "
    "ELSE 1 END"
)


def serialize_notice_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "title": row["title"],
        "body": row["body"],
        "priority": row["priority"],
        "is_active": bool(row["is_active"]),
        "starts_at": row["starts_at"].isoformat() if row.get("starts_at") else None,
        "ends_at": row["ends_at"].isoformat() if row.get("ends_at") else None,
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
        "updated_at": row["updated_at"].isoformat() if row.get("updated_at") else None,
    }


def list_public_notices(cursor, now: datetime) -> list[dict[str, Any]]:
    cursor.execute(
        f"""
        SELECT id, title, body, priority, created_at, starts_at, ends_at
        FROM notices
        WHERE is_active=1
          AND (starts_at IS NULL OR starts_at <= %s)
          AND (ends_at IS NULL OR ends_at >= %s)
        ORDER BY {PRIORITY_ORDER_SQL} DESC, created_at DESC
        """,
        (now, now),
    )
    rows = cursor.fetchall()
    return [
        {
            "id": int(row["id"]),
            "title": row["title"],
            "body": row["body"],
            "priority": row["priority"],
            "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
            "starts_at": row["starts_at"].isoformat() if row.get("starts_at") else None,
            "ends_at": row["ends_at"].isoformat() if row.get("ends_at") else None,
        }
        for row in rows
    ]


def list_admin_notices(cursor) -> list[dict[str, Any]]:
    cursor.execute(
        f"""
        SELECT id, title, body, priority, is_active, starts_at, ends_at, created_by_user_id, created_at, updated_at
        FROM notices
        ORDER BY {PRIORITY_ORDER_SQL} DESC, created_at DESC
        """
    )
    rows = cursor.fetchall()
    return [
        {
            **serialize_notice_row(row),
            "created_by_user_id": int(row["created_by_user_id"]) if row.get("created_by_user_id") is not None else None,
        }
        for row in rows
    ]


def get_notice_by_id(cursor, notice_id: int) -> dict[str, Any] | None:
    cursor.execute(
        """
        SELECT id, title, body, priority, is_active, starts_at, ends_at, created_by_user_id, created_at, updated_at
        FROM notices
        WHERE id=%s
        LIMIT 1
        """,
        (notice_id,),
    )
    return cursor.fetchone()


def insert_notice(
    cursor,
    *,
    title: str,
    body: str,
    priority: str,
    is_active: bool,
    starts_at: datetime | None,
    ends_at: datetime | None,
    created_by_user_id: int,
) -> int:
    cursor.execute(
        """
        INSERT INTO notices (title, body, priority, is_active, starts_at, ends_at, created_by_user_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (title, body, priority, 1 if is_active else 0, starts_at, ends_at, created_by_user_id),
    )
    return int(cursor.lastrowid)


def update_notice(
    cursor,
    notice_id: int,
    *,
    title: str,
    body: str,
    priority: str,
    is_active: bool,
    starts_at: datetime | None,
    ends_at: datetime | None,
) -> None:
    cursor.execute(
        """
        UPDATE notices
        SET title=%s, body=%s, priority=%s, is_active=%s, starts_at=%s, ends_at=%s
        WHERE id=%s
        """,
        (title, body, priority, 1 if is_active else 0, starts_at, ends_at, notice_id),
    )


def delete_notice(cursor, notice_id: int) -> None:
    cursor.execute("DELETE FROM notices WHERE id=%s", (notice_id,))
