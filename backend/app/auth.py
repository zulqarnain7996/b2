from __future__ import annotations

import ast
import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db import get_conn_cursor
from app.models import PERMISSION_KEYS, SCOPED_PERMISSION_KEYS

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-env")
JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", "480"))

security = HTTPBearer(auto_error=False)
_PERMISSION_KEY_PATTERN = re.compile(r"key='([^']+)'")
_ALLOWED_DEPARTMENTS_PATTERN = re.compile(r"allowed_departments=(\[.*\])$")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(*, user_id: int, role: str) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": str(user_id),
        "user_id": user_id,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=JWT_EXPIRES_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
    return payload


def _load_permissions(cursor, user_id: int) -> list[dict[str, Any]]:
    cursor.execute(
        """
        SELECT permission_key, allowed_departments_json
        FROM user_permissions
        WHERE user_id=%s
        ORDER BY permission_key ASC
        """,
        (user_id,),
    )
    rows = cursor.fetchall() or []
    permissions: list[dict[str, Any]] = []

    def _parse_permission_repr(text: object) -> tuple[str, list[str]]:
        raw_text = str(text or "").strip()
        if not raw_text:
            return "", []
        if raw_text in PERMISSION_KEYS:
            return raw_text, []

        key_match = _PERMISSION_KEY_PATTERN.search(raw_text)
        parsed_key = key_match.group(1).strip() if key_match else raw_text

        parsed_allowed: list[str] = []
        allowed_match = _ALLOWED_DEPARTMENTS_PATTERN.search(raw_text)
        if allowed_match:
            try:
                maybe_list = ast.literal_eval(allowed_match.group(1))
                if isinstance(maybe_list, list):
                    parsed_allowed = [str(item).strip() for item in maybe_list if str(item).strip()]
            except Exception:
                parsed_allowed = []
        return parsed_key, parsed_allowed

    for row in rows:
        value = row.get("permission_key") if isinstance(row, dict) else row[0]
        key, parsed_allowed = _parse_permission_repr(value)
        if key and key not in PERMISSION_KEYS:
            print(f"[permissions] skipping unknown permission entry in auth.py: {key!r}")
            continue
        if key in PERMISSION_KEYS:
            raw_allowed = row.get("allowed_departments_json") if isinstance(row, dict) else None
            allowed_departments: list[str] = []
            if raw_allowed:
                try:
                    parsed = json.loads(raw_allowed)
                    if isinstance(parsed, list):
                        allowed_departments = [str(item).strip() for item in parsed if str(item).strip()]
                except Exception:
                    allowed_departments = []
            elif parsed_allowed:
                allowed_departments = parsed_allowed
            permissions.append({
                "key": key,
                "allowed_departments": allowed_departments if key in SCOPED_PERMISSION_KEYS else [],
            })
    return permissions


def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> dict[str, Any]:
    print(
        {
            "auth_stage": "get_current_user:start",
            "has_credentials": credentials is not None,
            "scheme": (credentials.scheme if credentials is not None else None),
            "token_present": bool(credentials and credentials.credentials),
        }
    )
    if credentials is None or credentials.scheme.lower() != "bearer":
        print(
            {
                "auth_stage": "get_current_user:raise",
                "reason": "missing_or_invalid_auth_scheme",
                "status_code": status.HTTP_401_UNAUTHORIZED,
            }
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = decode_access_token(credentials.credentials)
        print(
            {
                "auth_stage": "get_current_user:token_decoded",
                "payload_sub": payload.get("sub"),
                "payload_user_id": payload.get("user_id"),
                "payload_role": payload.get("role"),
            }
        )
    except HTTPException as exc:
        print(
            {
                "auth_stage": "get_current_user:raise",
                "reason": "decode_access_token_failed",
                "status_code": exc.status_code,
                "detail": exc.detail,
            }
        )
        raise

    raw_user_id = payload.get("user_id") or payload.get("sub")
    try:
        user_id = int(raw_user_id)
        print(
            {
                "auth_stage": "get_current_user:user_id_parsed",
                "raw_user_id": raw_user_id,
                "user_id": user_id,
            }
        )
    except Exception:
        print(
            {
                "auth_stage": "get_current_user:raise",
                "reason": "invalid_token_payload_user_id",
                "raw_user_id": raw_user_id,
                "status_code": status.HTTP_401_UNAUTHORIZED,
            }
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute(
            """
            SELECT
              u.id,
              u.name,
              u.email,
              u.role,
              u.employee_id,
              u.force_password_change,
              u.created_at,
              e.photo_url,
              e.department
            FROM users u
            LEFT JOIN employees e ON e.id = u.employee_id
            WHERE u.id=%s
            LIMIT 1
            """,
            (user_id,),
        )
        user = cursor.fetchone()
        print(
            {
                "auth_stage": "get_current_user:user_lookup",
                "user_id": user_id,
                "user_found": bool(user),
                "linked_employee_id": (user.get("employee_id") if user else None),
                "department": (user.get("department") if user else None),
            }
        )
        if user:
            user["permissions"] = _load_permissions(cursor, user_id)
            print(
                {
                    "auth_stage": "get_current_user:permissions_loaded",
                    "user_id": user_id,
                    "permission_keys": [
                        item.get("key")
                        for item in (user.get("permissions") or [])
                        if isinstance(item, dict)
                    ],
                }
            )

    if not user:
        print(
            {
                "auth_stage": "get_current_user:raise",
                "reason": "user_not_found",
                "user_id": user_id,
                "status_code": status.HTTP_401_UNAUTHORIZED,
            }
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    print(
        {
            "auth_stage": "get_current_user:success",
            "user_id": user.get("id"),
            "role": user.get("role"),
            "linked_employee_id": user.get("employee_id"),
            "department": user.get("department"),
        }
    )
    return user


def require_admin(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def _normalized_permission_key(value: object) -> str:
    return str(value or "").strip()


def has_permission(current_user: dict[str, Any], permission_key: str) -> bool:
    normalized_permission_key = _normalized_permission_key(permission_key)
    if not normalized_permission_key:
        return False
    if current_user.get("role") == "admin":
        return True
    permissions = current_user.get("permissions") or []
    return any(
        _normalized_permission_key(item.get("key") if isinstance(item, dict) else "")
        == normalized_permission_key
        for item in permissions
    )


def resolve_effective_permission_key(current_user: dict[str, Any], permission_key: str) -> str | None:
    normalized_permission_key = _normalized_permission_key(permission_key)
    if not normalized_permission_key:
        return None
    if current_user.get("role") == "admin":
        return normalized_permission_key
    if has_permission(current_user, normalized_permission_key):
        return normalized_permission_key
    if normalized_permission_key == "can_view_monthly_attendance" and has_permission(current_user, "can_view_all_attendance"):
        return "can_view_all_attendance"
    return None


def has_effective_permission(current_user: dict[str, Any], permission_key: str) -> bool:
    return resolve_effective_permission_key(current_user, permission_key) is not None


def get_allowed_departments(current_user: dict[str, Any], permission_key: str) -> list[str] | None:
    if current_user.get("role") == "admin":
        return None
    permissions = current_user.get("permissions") or []
    effective_permission_key = resolve_effective_permission_key(current_user, permission_key)
    if not effective_permission_key:
        return []
    assignment = next(
        (
            item
            for item in permissions
            if isinstance(item, dict)
            and _normalized_permission_key(item.get("key")) == effective_permission_key
        ),
        None,
    )
    if not assignment:
        return []
    allowed_departments = [str(item).strip() for item in (assignment.get("allowed_departments") or []) if str(item).strip()]
    if allowed_departments:
        return list(dict.fromkeys(allowed_departments))
    fallback_department = str(current_user.get("department") or "").strip()
    return [fallback_department] if fallback_department else []


def require_permission(permission_key: str):
    def checker(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        if not has_permission(current_user, permission_key):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
        return current_user

    return checker


def ensure_admin_seed() -> None:
    admin_name = os.getenv("ADMIN_NAME", "Initial Admin")
    admin_email = os.getenv("ADMIN_EMAIL", "admin@example.com")
    admin_password = os.getenv("ADMIN_PASSWORD", "ChangeMe123!")

    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute("SELECT COUNT(*) AS total FROM users WHERE role='admin'")
        row = cursor.fetchone()
        total = int((row or {}).get("total", 0))
        if total > 0:
            return

        password_hash = hash_password(admin_password)
        cursor.execute(
            """
            INSERT INTO users (name, email, password_hash, role)
            VALUES (%s, %s, %s, 'admin')
            """,
            (admin_name, admin_email, password_hash),
        )

    used_default = (
        admin_name == "Initial Admin"
        and admin_email == "admin@example.com"
        and admin_password == "ChangeMe123!"
    )
    print(
        (
            f"[auth-seed] Created initial admin user: {admin_email}"
            if not used_default
            else "[auth-seed] Created default admin user: admin@example.com / ChangeMe123! "
            "(set ADMIN_EMAIL and ADMIN_PASSWORD in backend/.env)"
        )
    )
