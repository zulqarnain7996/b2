from __future__ import annotations

from datetime import datetime
from typing import Any


PRIORITY_ORDER_SQL = (
    "CASE n.priority "
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
        "is_sticky": bool(row.get("is_sticky")),
        "show_on_login": bool(row.get("show_on_login")),
        "show_on_refresh": bool(row.get("show_on_refresh")),
        "repeat_every_login": bool(row.get("repeat_every_login")),
        "is_dismissible": bool(row.get("is_dismissible")),
        "requires_acknowledgement": bool(row.get("requires_acknowledgement")),
        "target_audience": row.get("target_audience") or "all",
        "target_department": row.get("target_department"),
        "target_role": row.get("target_role"),
        "starts_at": row["starts_at"].isoformat() if row.get("starts_at") else None,
        "ends_at": row["ends_at"].isoformat() if row.get("ends_at") else None,
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
        "updated_at": row["updated_at"].isoformat() if row.get("updated_at") else None,
        "created_by_user_id": int(row["created_by_user_id"]) if row.get("created_by_user_id") is not None else None,
        "created_by_name": row.get("created_by_name"),
        "closed_at": row["closed_at"].isoformat() if row.get("closed_at") else None,
        "closed_by_user_id": int(row["closed_by_user_id"]) if row.get("closed_by_user_id") is not None else None,
    }


def list_public_notices(cursor, now: datetime) -> list[dict[str, Any]]:
    cursor.execute(
        f"""
        SELECT
          n.id, n.title, n.body, n.priority, n.is_active, n.is_sticky, n.show_on_login, n.show_on_refresh, n.repeat_every_login,
          n.is_dismissible, n.requires_acknowledgement, n.target_audience, n.target_department, n.target_role,
          n.starts_at, n.ends_at, n.created_by_user_id, n.created_at, n.updated_at, n.closed_at, n.closed_by_user_id,
          u.name AS created_by_name
        FROM notices n
        LEFT JOIN users u ON u.id = n.created_by_user_id
        WHERE n.is_active=1
          AND n.closed_at IS NULL
        ORDER BY {PRIORITY_ORDER_SQL} DESC, n.created_at DESC
        """
    )
    rows = cursor.fetchall()
    return [serialize_notice_row(row) for row in rows]


def list_admin_notices(cursor) -> list[dict[str, Any]]:
    cursor.execute(
        f"""
        SELECT
          n.id, n.title, n.body, n.priority, n.is_active, n.is_sticky, n.show_on_login, n.show_on_refresh, n.repeat_every_login,
          n.is_dismissible, n.requires_acknowledgement, n.target_audience, n.target_department, n.target_role,
          n.starts_at, n.ends_at, n.created_by_user_id, n.created_at, n.updated_at, n.closed_at, n.closed_by_user_id,
          u.name AS created_by_name
        FROM notices n
        LEFT JOIN users u ON u.id = n.created_by_user_id
        ORDER BY {PRIORITY_ORDER_SQL} DESC, n.is_sticky DESC, n.created_at DESC
        """
    )
    rows = cursor.fetchall()
    return [serialize_notice_row(row) for row in rows]


def get_notice_by_id(cursor, notice_id: int) -> dict[str, Any] | None:
    cursor.execute(
        """
        SELECT
          n.id, n.title, n.body, n.priority, n.is_active, n.is_sticky, n.show_on_login, n.show_on_refresh, n.repeat_every_login,
          n.is_dismissible, n.requires_acknowledgement, n.target_audience, n.target_department, n.target_role,
          n.starts_at, n.ends_at, n.created_by_user_id, n.created_at, n.updated_at, n.closed_at, n.closed_by_user_id,
          u.name AS created_by_name
        FROM notices n
        LEFT JOIN users u ON u.id = n.created_by_user_id
        WHERE n.id=%s
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
    is_sticky: bool,
    show_on_login: bool,
    show_on_refresh: bool,
    repeat_every_login: bool,
    is_dismissible: bool,
    requires_acknowledgement: bool,
    target_audience: str,
    target_department: str | None,
    target_role: str | None,
    starts_at: datetime | None,
    ends_at: datetime | None,
    created_by_user_id: int,
    closed_at: datetime | None,
    closed_by_user_id: int | None,
) -> int:
    cursor.execute(
        """
        INSERT INTO notices (
          title, body, priority, is_active, is_sticky, show_on_login, show_on_refresh, repeat_every_login,
          is_dismissible, requires_acknowledgement, target_audience, target_department, target_role,
          starts_at, ends_at, created_by_user_id, closed_at, closed_by_user_id
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            title,
            body,
            priority,
            1 if is_active else 0,
            1 if is_sticky else 0,
            1 if show_on_login else 0,
            1 if show_on_refresh else 0,
            1 if repeat_every_login else 0,
            1 if is_dismissible else 0,
            1 if requires_acknowledgement else 0,
            target_audience,
            target_department,
            target_role,
            starts_at,
            ends_at,
            created_by_user_id,
            closed_at,
            closed_by_user_id,
        ),
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
    is_sticky: bool,
    show_on_login: bool,
    show_on_refresh: bool,
    repeat_every_login: bool,
    is_dismissible: bool,
    requires_acknowledgement: bool,
    target_audience: str,
    target_department: str | None,
    target_role: str | None,
    starts_at: datetime | None,
    ends_at: datetime | None,
    closed_at: datetime | None,
    closed_by_user_id: int | None,
) -> None:
    cursor.execute(
        """
        UPDATE notices
        SET
          title=%s,
          body=%s,
          priority=%s,
          is_active=%s,
          is_sticky=%s,
          show_on_login=%s,
          show_on_refresh=%s,
          repeat_every_login=%s,
          is_dismissible=%s,
          requires_acknowledgement=%s,
          target_audience=%s,
          target_department=%s,
          target_role=%s,
          starts_at=%s,
          ends_at=%s,
          closed_at=%s,
          closed_by_user_id=%s
        WHERE notices.id=%s
        """,
        (
            title,
            body,
            priority,
            1 if is_active else 0,
            1 if is_sticky else 0,
            1 if show_on_login else 0,
            1 if show_on_refresh else 0,
            1 if repeat_every_login else 0,
            1 if is_dismissible else 0,
            1 if requires_acknowledgement else 0,
            target_audience,
            target_department,
            target_role,
            starts_at,
            ends_at,
            closed_at,
            closed_by_user_id,
            notice_id,
        ),
    )


def delete_notice(cursor, notice_id: int) -> None:
    cursor.execute("DELETE FROM notice_user_states WHERE notice_id=%s", (notice_id,))
    cursor.execute("DELETE FROM notices WHERE notices.id=%s", (notice_id,))
