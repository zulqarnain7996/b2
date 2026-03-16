from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db import get_conn_cursor

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-env")
JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", "480"))

security = HTTPBearer(auto_error=False)


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


def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> dict[str, Any]:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = decode_access_token(credentials.credentials)
    raw_user_id = payload.get("user_id") or payload.get("sub")
    try:
        user_id = int(raw_user_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute(
            "SELECT id, name, email, role, employee_id, created_at FROM users WHERE id=%s LIMIT 1",
            (user_id,),
        )
        user = cursor.fetchone()

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_admin(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


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
