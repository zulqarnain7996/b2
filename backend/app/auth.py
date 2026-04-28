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
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db import get_conn_cursor
from app.models import PERMISSION_KEYS, SCOPED_PERMISSION_KEYS

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.getenv("JWT_SECRET", "").strip()
JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", "480"))
AUTH_COOKIE_NAME = os.getenv("AUTH_COOKIE_NAME", "ivs_access_token").strip() or "ivs_access_token"
AUTH_COOKIE_SECURE = os.getenv("AUTH_COOKIE_SECURE", "").strip().lower() in {"1", "true", "yes"}
AUTH_DEBUG = os.getenv("AUTH_DEBUG", "0").strip().lower() in {"1", "true", "yes"}

security = HTTPBearer(auto_error=False)
_PERMISSION_KEY_PATTERN = re.compile(r"key='([^']+)'")
_ALLOWED_DEPARTMENTS_PATTERN = re.compile(r"allowed_departments=(\[.*\])$")


def _runtime_environment() -> str:
    return (
        os.getenv("APP_ENV")
        or os.getenv("ENVIRONMENT")
        or os.getenv("FASTAPI_ENV")
        or os.getenv("ENV")
        or "development"
    ).strip().lower()


def _is_non_development_environment() -> bool:
    return _runtime_environment() not in {"", "dev", "development", "local", "test", "testing"}


def _auth_debug(event: object) -> None:
    if AUTH_DEBUG:
        print(event)


def validate_auth_configuration() -> None:
    if not JWT_SECRET:
        raise RuntimeError("JWT_SECRET must be configured.")
    if JWT_SECRET.lower() in {"change-me-in-env", "change-me-please"}:
        raise RuntimeError("JWT_SECRET must not use a placeholder value.")
    if _is_non_development_environment():
        admin_name = os.getenv("ADMIN_NAME", "").strip()
        admin_email = os.getenv("ADMIN_EMAIL", "").strip()
        admin_password = os.getenv("ADMIN_PASSWORD", "").strip()
        missing = [
            name
            for name, value in (
                ("ADMIN_NAME", admin_name),
                ("ADMIN_EMAIL", admin_email),
                ("ADMIN_PASSWORD", admin_password),
            )
            if not value
        ]
        if missing:
            raise RuntimeError(f"Missing required auth env vars for non-development environment: {', '.join(missing)}")


validate_auth_configuration()


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
            _auth_debug(f"[permissions] skipping unknown permission entry in auth.py: {key!r}")
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


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict[str, Any]:
    token = ""
    if credentials is not None and credentials.scheme.lower() == "bearer" and credentials.credentials:
        token = credentials.credentials
    elif request.cookies.get(AUTH_COOKIE_NAME):
        token = str(request.cookies.get(AUTH_COOKIE_NAME) or "").strip()
    _auth_debug(
        {
            "auth_stage": "get_current_user:start",
            "has_bearer": credentials is not None and credentials.scheme.lower() == "bearer",
            "has_cookie": bool(request.cookies.get(AUTH_COOKIE_NAME)),
        }
    )
    if not token:
        _auth_debug({"auth_stage": "get_current_user:raise", "reason": "missing_token"})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = decode_access_token(token)
        _auth_debug({"auth_stage": "get_current_user:token_decoded", "payload_user_id": payload.get("user_id")})
    except HTTPException as exc:
        _auth_debug({"auth_stage": "get_current_user:raise", "reason": "decode_access_token_failed"})
        raise

    raw_user_id = payload.get("user_id") or payload.get("sub")
    try:
        user_id = int(raw_user_id)
        _auth_debug({"auth_stage": "get_current_user:user_id_parsed", "user_id": user_id})
    except Exception:
        _auth_debug({"auth_stage": "get_current_user:raise", "reason": "invalid_token_payload_user_id"})
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
        _auth_debug({"auth_stage": "get_current_user:user_lookup", "user_id": user_id, "user_found": bool(user)})
        if user:
            user["permissions"] = _load_permissions(cursor, user_id)
            _auth_debug({"auth_stage": "get_current_user:permissions_loaded", "user_id": user_id})

    if not user:
        _auth_debug({"auth_stage": "get_current_user:raise", "reason": "user_not_found", "user_id": user_id})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    _auth_debug({"auth_stage": "get_current_user:success", "user_id": user.get("id"), "role": user.get("role")})
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
    admin_name = os.getenv("ADMIN_NAME", "").strip()
    admin_email = os.getenv("ADMIN_EMAIL", "").strip()
    admin_password = os.getenv("ADMIN_PASSWORD", "").strip()

    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute("SELECT COUNT(*) AS total FROM users WHERE role='admin'")
        row = cursor.fetchone()
        total = int((row or {}).get("total", 0))
        if total > 0:
            return
        if not admin_name or not admin_email or not admin_password:
            raise RuntimeError(
                "No admin user exists and ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD must be configured to seed the first admin."
            )

        password_hash = hash_password(admin_password)
        cursor.execute(
            """
            INSERT INTO users (name, email, password_hash, role)
            VALUES (%s, %s, %s, 'admin')
            """,
            (admin_name, admin_email, password_hash),
        )

    print(f"[auth-seed] Created initial admin user: {admin_email}")
