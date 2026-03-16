from __future__ import annotations


import json
import os
import base64
import hashlib
import cv2
import random
import shutil
import subprocess
import tempfile
import threading
import uuid
import zipfile
from datetime import date, datetime, timedelta, time
from io import BytesIO
from pathlib import Path

import numpy as np
from dotenv import load_dotenv
from fastapi import APIRouter, Body, Depends, FastAPI, HTTPException, Query, Request, UploadFile, File, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
import mysql.connector
from mysql.connector.errors import IntegrityError
from PIL import Image, UnidentifiedImageError
from starlette.background import BackgroundTask

from app.auth import create_access_token, get_current_user, hash_password, require_admin, verify_password
from app.cache import get as cache_get
from app.cache import invalidate as cache_invalidate
from app.cache import set_value as cache_set
from app.db import get_conn_cursor, reset_pool
from app.face import face_engine
from app.images import UPLOAD_DIR, create_thumbnail
from app.init_db import run as init_db
from app.models import (
    BulkDeleteEmployeesRequest,
    BulkDeleteUsersRequest,
    CheckInRequest,
    CheckInMeRequest,
    CheckinStartRequest,
    CheckinFrameRequest,
    CheckinCompleteRequest,
    ChangePasswordRequest,
    EnrollEmployeeRequest,
    LinkEmployeeRequest,
    LoginRequest,
    MarkMonthlyAttendanceRequest,
    NoticeCreateRequest,
    NoticeUpdateRequest,
    AppSettingsUpdateRequest,
    UpdateUserRequest,
    UpdateEmployeeRequest,
)
from app.notices_repo import (
    delete_notice,
    get_notice_by_id,
    insert_notice,
    list_admin_notices,
    list_public_notices,
    serialize_notice_row,
    update_notice,
)

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

app = FastAPI(title="Face Attendance API")
api = APIRouter(prefix="/api")

cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR.resolve())), name="uploads")

_inflight_lock = threading.Lock()
_inflight: set[str] = set()
_challenge_lock = threading.Lock()
_challenge_store: dict[str, dict] = {}
_scan_lock = threading.Lock()
_scan_sessions: dict[str, dict] = {}
_checkin_session_lock = threading.Lock()
_checkin_runtime: dict[str, dict] = {}
MAX_MANUAL_SELFIE_BYTES = 5 * 1024 * 1024
ALLOWED_MANUAL_SELFIE_TYPES = {"image/jpeg", "image/jpg", "image/png"}
ALLOWED_DEPARTMENTS = {"IT", "Call center", "Accounts", "School", "Quran"}
LIVENESS_CHALLENGES = ("blink", "turn_left", "turn_right", "smile")
LIVENESS_EXPIRES_SECONDS = 120
SCAN_FLOW_DIRECTIONS = ("center", "left", "right", "up", "down")
SCAN_FLOW_EXPIRES_SECONDS = 180
CHECKIN_CHALLENGES = ("blink", "turn_head_left", "turn_head_right")
CHECKIN_SESSION_TTL_SECONDS = int(os.getenv("CHECKIN_SESSION_TTL_SECONDS", "180"))
CHECKIN_MAX_RETRIES = int(os.getenv("CHECKIN_MAX_RETRIES", "2"))
CHECKIN_CENTER_HOLD_MS = int(os.getenv("CHECKIN_CENTER_HOLD_MS", "700"))
LIVENESS_FALLBACK_ALLOW_SINGLE = os.getenv("LIVENESS_ALLOW_SINGLE_FRAME_FALLBACK", "1") == "1"
ENROLL_DUPLICATE_FACE_THRESHOLD = float(os.getenv("FACE_ENROLL_DUPLICATE_THRESHOLD", "0.56"))
BACKUP_MAX_UPLOAD_BYTES = int(os.getenv("BACKUP_MAX_UPLOAD_BYTES", str(200 * 1024 * 1024)))
BACKUP_ALLOWED_MIME_TYPES = {"application/zip", "application/x-zip-compressed", "multipart/x-zip"}
_maintenance_lock = threading.Lock()
_maintenance_mode = False


def _acquire_employee_lock(employee_id: str) -> bool:
    with _inflight_lock:
        if employee_id in _inflight:
            return False
        _inflight.add(employee_id)
        return True


def _release_employee_lock(employee_id: str) -> None:
    with _inflight_lock:
        _inflight.discard(employee_id)


def _audit(actor: str, action: str, details: dict) -> None:
    with get_conn_cursor() as (_, cursor):
        cursor.execute(
            "INSERT INTO audit_logs (actor, action, details) VALUES (%s, %s, %s)",
            (actor, action, json.dumps(details)),
        )
    cache_invalidate("audit_logs:")


def _audit_safe(actor: str, action: str, details: dict) -> None:
    try:
        _audit(actor, action, details)
    except Exception:
        return


def _set_maintenance_mode(enabled: bool) -> None:
    global _maintenance_mode
    with _maintenance_lock:
        _maintenance_mode = enabled


def _is_maintenance_mode() -> bool:
    with _maintenance_lock:
        return _maintenance_mode


def _db_env() -> dict[str, str]:
    return {
        "host": os.getenv("DB_HOST", "localhost"),
        "port": str(os.getenv("DB_PORT", "3306")),
        "user": os.getenv("DB_USER", "root"),
        "password": os.getenv("DB_PASSWORD", ""),
        "database": os.getenv("DB_NAME", "face_attendance"),
    }


def _backup_filename(prefix: str = "backup") -> str:
    return f"{prefix}_{datetime.now().strftime('%Y-%m-%d_%H-%M')}.zip"


def _dump_database_sql(out_sql_path: Path) -> None:
    db = _db_env()
    dump_cmd = shutil.which("mysqldump")
    if dump_cmd:
        env = os.environ.copy()
        env["MYSQL_PWD"] = db["password"]
        with out_sql_path.open("wb") as f:
            subprocess.run(
                [
                    dump_cmd,
                    "-h",
                    db["host"],
                    "-P",
                    db["port"],
                    "-u",
                    db["user"],
                    "--single-transaction",
                    "--quick",
                    "--routines",
                    "--events",
                    "--triggers",
                    "--databases",
                    db["database"],
                ],
                check=True,
                stdout=f,
                stderr=subprocess.PIPE,
                env=env,
            )
        return

    with get_conn_cursor() as (_, cursor):
        cursor.execute("SET SESSION group_concat_max_len = 1000000")
        cursor.execute("SHOW TABLES")
        rows = cursor.fetchall() or []
        tables = [next(iter(row.values())) if isinstance(row, dict) else row[0] for row in rows]

        with out_sql_path.open("w", encoding="utf-8") as w:
            w.write(f"CREATE DATABASE IF NOT EXISTS `{db['database']}`;\nUSE `{db['database']}`;\n")
            w.write("SET FOREIGN_KEY_CHECKS=0;\n")
            for table in tables:
                cursor.execute(f"SHOW CREATE TABLE `{table}`")
                create_row = cursor.fetchone()
                create_sql = create_row[1] if isinstance(create_row, (tuple, list)) else create_row["Create Table"]
                w.write(f"DROP TABLE IF EXISTS `{table}`;\n{create_sql};\n")

                cursor.execute(f"SELECT * FROM `{table}`")
                data_rows = cursor.fetchall() or []
                if not data_rows:
                    continue
                col_names = [d[0] for d in cursor.description]
                cols = ", ".join([f"`{c}`" for c in col_names])
                for data_row in data_rows:
                    if isinstance(data_row, dict):
                        values = [data_row.get(c) for c in col_names]
                    else:
                        values = list(data_row)
                    escaped = []
                    for v in values:
                        if v is None:
                            escaped.append("NULL")
                        elif isinstance(v, (int, float)):
                            escaped.append(str(v))
                        elif isinstance(v, (bytes, bytearray)):
                            escaped.append("0x" + bytes(v).hex())
                        else:
                            text = str(v).replace("\\", "\\\\").replace("'", "\\'")
                            escaped.append(f"'{text}'")
                    w.write(f"INSERT INTO `{table}` ({cols}) VALUES ({', '.join(escaped)});\n")
            w.write("SET FOREIGN_KEY_CHECKS=1;\n")


def _zip_backup(archive_path: Path, sql_path: Path, uploads_path: Path) -> None:
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(sql_path, arcname="db.sql")
        if uploads_path.exists():
            for p in uploads_path.rglob("*"):
                if p.is_file():
                    rel = p.relative_to(uploads_path)
                    zf.write(p, arcname=(Path("uploads") / rel).as_posix())


def _create_backup_zip(dest_zip_path: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="ivs_backup_") as td:
        sql_path = Path(td) / "db.sql"
        _dump_database_sql(sql_path)
        _zip_backup(dest_zip_path, sql_path, UPLOAD_DIR)


def _safe_extract_backup_zip(zip_path: Path, dest_dir: Path) -> tuple[Path, Path]:
    with zipfile.ZipFile(zip_path, "r") as zf:
        names = zf.namelist()
        if "db.sql" not in names:
            raise HTTPException(status_code=400, detail="Invalid backup zip: missing db.sql")
        if not any(name.startswith("uploads/") for name in names):
            raise HTTPException(status_code=400, detail="Invalid backup zip: missing uploads/ folder")

        for name in names:
            target = (dest_dir / name).resolve()
            if not str(target).startswith(str(dest_dir.resolve())):
                raise HTTPException(status_code=400, detail="Invalid backup zip: unsafe path detected")
        zf.extractall(dest_dir)

    sql_path = dest_dir / "db.sql"
    uploads_path = dest_dir / "uploads"
    return sql_path, uploads_path


def _split_sql_statements(raw_sql: str) -> list[str]:
    statements: list[str] = []
    buff: list[str] = []
    in_single = False
    in_double = False
    in_line_comment = False
    in_block_comment = False
    prev = ""
    for ch in raw_sql:
        if in_line_comment:
            if ch == "\n":
                in_line_comment = False
            prev = ch
            continue
        if in_block_comment:
            if prev == "*" and ch == "/":
                in_block_comment = False
            prev = ch
            continue
        if not in_single and not in_double:
            if prev == "-" and ch == "-":
                if buff and buff[-1] == "-":
                    buff.pop()
                in_line_comment = True
                prev = ch
                continue
            if prev == "/" and ch == "*":
                if buff and buff[-1] == "/":
                    buff.pop()
                in_block_comment = True
                prev = ch
                continue
        if ch == "'" and not in_double and prev != "\\":
            in_single = not in_single
        elif ch == '"' and not in_single and prev != "\\":
            in_double = not in_double
        if ch == ";" and not in_single and not in_double:
            statement = "".join(buff).strip()
            if statement:
                statements.append(statement)
            buff = []
        else:
            buff.append(ch)
        prev = ch
    tail = "".join(buff).strip()
    if tail:
        statements.append(tail)
    return statements


def _import_sql_file(sql_path: Path) -> None:
    db = _db_env()
    mysql_cmd = shutil.which("mysql")
    if mysql_cmd:
        env = os.environ.copy()
        env["MYSQL_PWD"] = db["password"]
        with sql_path.open("rb") as f:
            subprocess.run(
                [
                    mysql_cmd,
                    "-h",
                    db["host"],
                    "-P",
                    db["port"],
                    "-u",
                    db["user"],
                    db["database"],
                ],
                check=True,
                stdin=f,
                stderr=subprocess.PIPE,
                env=env,
            )
        return

    raw_sql = sql_path.read_text(encoding="utf-8", errors="ignore")
    statements = _split_sql_statements(raw_sql)
    with get_conn_cursor() as (_, cursor):
        for stmt in statements:
            cursor.execute(stmt)


def _reset_database_schema() -> None:
    db = _db_env()
    reset_pool()
    conn = mysql.connector.connect(
        host=db["host"],
        port=int(db["port"]),
        user=db["user"],
        password=db["password"],
        autocommit=True,
    )
    try:
        cursor = conn.cursor()
        cursor.execute(f"DROP DATABASE IF EXISTS `{db['database']}`")
        cursor.execute(f"CREATE DATABASE `{db['database']}`")
        cursor.close()
    finally:
        conn.close()
    reset_pool()


def _replace_uploads(new_uploads_path: Path, backup_root: Path) -> None:
    old_backup = backup_root / "old_uploads"
    if old_backup.exists():
        shutil.rmtree(old_backup, ignore_errors=True)

    if UPLOAD_DIR.exists():
        shutil.copytree(UPLOAD_DIR, old_backup, dirs_exist_ok=True)
        shutil.rmtree(UPLOAD_DIR, ignore_errors=True)
    UPLOAD_DIR.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(new_uploads_path, UPLOAD_DIR, dirs_exist_ok=True)


def _serialize_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "employeeId": _employee_id_text(user.get("employee_id")) or None,
        "createdAt": user["created_at"].isoformat() if user.get("created_at") else None,
    }


def _employee_id_text(value: object) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if not text:
        return ""
    try:
        return str(int(text))
    except Exception:
        return text


def _assert_employee_link_available(cursor, *, employee_id: int | None, current_user_id: int | None = None) -> None:
    if employee_id is None:
        return
    cursor.execute(
        "SELECT id FROM users WHERE employee_id=%s AND (%s IS NULL OR id<>%s) LIMIT 1",
        (employee_id, current_user_id, current_user_id),
    )
    collision = cursor.fetchone()
    if collision:
        raise HTTPException(status_code=409, detail="This employee is already linked to another user.")


def _resolve_employee_id_for_current_user(current_user: dict) -> str:
    employee_id = str(current_user.get("employee_id") or "").strip()
    if employee_id:
        return employee_id

    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute(
            "SELECT id FROM employees WHERE LOWER(email)=LOWER(%s) LIMIT 1",
            (current_user["email"],),
        )
        row = cursor.fetchone()
        if not row:
            return ""
        linked_employee_id = str(row["id"])
        cursor.execute(
            "UPDATE users SET employee_id=%s WHERE id=%s",
            (linked_employee_id, current_user["id"]),
        )
        return linked_employee_id


def _delete_upload_file(photo_url: str | None) -> None:
    if not photo_url:
        return
    normalized = str(photo_url).strip()
    if not normalized:
        return
    relative = normalized.replace("\\", "/")
    if relative.startswith("/uploads/"):
        relative = relative[len("/uploads/"):]
    elif relative.startswith("uploads/"):
        relative = relative[len("uploads/"):]
    else:
        relative = relative.rsplit("/", 1)[-1]
    if not relative:
        return
    file_path = UPLOAD_DIR / relative
    try:
        if file_path.exists() and file_path.is_file():
            file_path.unlink()
    except OSError:
        # Best-effort cleanup only; never fail API on file delete issues.
        return


def _save_manual_selfie_image(*, employee_id: str, today: date, content: bytes) -> str:
    now = datetime.now()
    rel_dir = Path("attendance") / now.strftime("%Y") / now.strftime("%m")
    abs_dir = UPLOAD_DIR / rel_dir
    abs_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{employee_id}_{today.isoformat()}_{now.strftime('%H%M%S')}_{uuid.uuid4().hex[:8]}.jpg"
    abs_path = abs_dir / filename
    Image.open(BytesIO(content)).convert("RGB").save(abs_path, format="JPEG", quality=90)
    return f"/uploads/{rel_dir.as_posix()}/{filename}"


def _month_start_end(year: int, month: int) -> tuple[date, date]:
    if year < 2000 or year > 2100:
        raise HTTPException(status_code=400, detail="year out of supported range")
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="month must be between 1 and 12")
    start = date(year, month, 1)
    next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    return start, next_month


def _normalize_shift_time(value: object) -> str:
    if isinstance(value, timedelta):
        total = int(value.total_seconds()) % (24 * 3600)
        h = total // 3600
        m = (total % 3600) // 60
        s = total % 60
        return f"{h:02d}:{m:02d}:{s:02d}"
    if isinstance(value, time):
        return value.strftime("%H:%M:%S")
    raw = str(value or "").strip()
    if not raw:
        return "09:00:00"
    fmt = "%H:%M:%S" if raw.count(":") == 2 else "%H:%M"
    parsed = datetime.strptime(raw, fmt)
    return parsed.strftime("%H:%M:%S")


def _get_app_settings(cursor) -> dict:
    cursor.execute(
        """
        SELECT shift_start_time, grace_period_mins, fine_per_minute_pkr, updated_at
        FROM app_settings
        WHERE id=1
        LIMIT 1
        """
    )
    row = cursor.fetchone()
    if not row:
        cursor.execute(
            """
            INSERT INTO app_settings (id, shift_start_time, grace_period_mins, fine_per_minute_pkr)
            VALUES (1, '09:00:00', 15, 0.00)
            ON DUPLICATE KEY UPDATE id=id
            """
        )
        cursor.execute(
            """
            SELECT shift_start_time, grace_period_mins, fine_per_minute_pkr, updated_at
            FROM app_settings
            WHERE id=1
            LIMIT 1
            """
        )
        row = cursor.fetchone() or {}
    shift_start = _normalize_shift_time(row.get("shift_start_time"))
    grace = int(row.get("grace_period_mins") or 0)
    fine_rate = float(row.get("fine_per_minute_pkr") or 0)
    return {
        "shift_start_time": shift_start,
        "grace_period_mins": grace,
        "fine_per_minute_pkr": fine_rate,
        "updated_at": row.get("updated_at"),
    }


def _compute_fine(checkin_time: str | None, settings: dict) -> tuple[int, float]:
    if not checkin_time:
        return 0, 0.0
    checkin_raw = str(checkin_time).strip()
    if not checkin_raw:
        return 0, 0.0

    shift_setting = settings.get("shift_start_time")
    if shift_setting is None or str(shift_setting).strip() == "":
        return 0, 0.0
    shift_raw = _normalize_shift_time(shift_setting)
    grace = int(settings.get("grace_period_mins") if settings.get("grace_period_mins") is not None else 15)
    fine_rate = float(settings.get("fine_per_minute_pkr") or 0)

    checkin_dt = datetime.strptime(checkin_raw[:5], "%H:%M")
    shift_dt = datetime.strptime(shift_raw[:5], "%H:%M")
    diff_mins = int((checkin_dt - shift_dt).total_seconds() // 60)
    late_minutes = max(0, diff_mins - max(0, grace))
    fine_amount = round(late_minutes * max(0.0, fine_rate), 2)
    return late_minutes, fine_amount


def _decode_base64_image_bytes(image_base64: str) -> bytes:
    raw = str(image_base64 or "").split(",")[-1]
    try:
        return base64.b64decode(raw, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid image payload") from exc


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _to_int_or_none(value: object) -> int | None:
    if value is None:
        return None
    try:
        return int(str(value).strip())
    except Exception:
        return None


def _assert_new_capture_hash(cursor, *, image_hash: str, context: str, employee_id: object = None) -> None:
    cursor.execute(
        "SELECT id FROM face_capture_hashes WHERE image_hash=%s LIMIT 1",
        (image_hash,),
    )
    existing = cursor.fetchone()
    if existing:
        raise HTTPException(status_code=409, detail="Duplicate image detected. Please capture a fresh image.")
    try:
        cursor.execute(
            "INSERT INTO face_capture_hashes (image_hash, employee_id, context) VALUES (%s, %s, %s)",
            (image_hash, _to_int_or_none(employee_id), context),
        )
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Duplicate image detected. Please capture a fresh image.") from exc


def _create_liveness_challenge(current_user: dict, context: str) -> dict:
    token = uuid.uuid4().hex
    challenge = random.choice(LIVENESS_CHALLENGES)
    expires_at = datetime.now() + timedelta(seconds=LIVENESS_EXPIRES_SECONDS)
    with _challenge_lock:
        _challenge_store[token] = {
            "challenge": challenge,
            "context": context,
            "user_id": int(current_user["id"]),
            "expires_at": expires_at,
        }
    return {"token": token, "challenge": challenge, "expiresInSec": LIVENESS_EXPIRES_SECONDS}


def _consume_liveness_challenge(*, token: str, current_user: dict, context: str) -> dict:
    with _challenge_lock:
        row = _challenge_store.get(token)
        if not row:
            raise HTTPException(status_code=400, detail="Challenge not found or expired.")
        if datetime.now() > row["expires_at"]:
            _challenge_store.pop(token, None)
            raise HTTPException(status_code=400, detail="Challenge expired.")
        if int(row["user_id"]) != int(current_user["id"]):
            raise HTTPException(status_code=403, detail="Challenge user mismatch.")
        if str(row["context"]) != context:
            raise HTTPException(status_code=400, detail="Challenge context mismatch.")
        _challenge_store.pop(token, None)
        return row


def _scan_progress_ratio(completed_steps: int) -> float:
    total = max(1, len(SCAN_FLOW_DIRECTIONS))
    return min(1.0, max(0.0, float(completed_steps) / float(total)))


def _scan_guidance(direction: str) -> str:
    if direction == "center":
        return "Center your face in the circle."
    if direction == "left":
        return "Move your face left."
    if direction == "right":
        return "Move your face right."
    if direction == "up":
        return "Move your face up."
    if direction == "down":
        return "Move your face down."
    return "Hold steady."


def _scan_direction_passed(direction: str, metrics: dict) -> bool:
    nose_x = float(metrics.get("nose_x_norm") or 0.0)
    nose_y = float(metrics.get("nose_y_norm") or 0.0)
    if direction == "center":
        return abs(nose_x - 0.5) <= 0.12 and abs(nose_y - 0.46) <= 0.14
    if direction == "left":
        return nose_x >= 0.62
    if direction == "right":
        return nose_x <= 0.38
    if direction == "up":
        return nose_y <= 0.34
    if direction == "down":
        return nose_y >= 0.58
    return False


def _scan_session_start(current_user: dict, context: str) -> dict:
    token = uuid.uuid4().hex
    now = datetime.now()
    row = {
        "token": token,
        "context": context,
        "user_id": int(current_user["id"]),
        "step_index": 0,
        "updated_at": now,
        "expires_at": now + timedelta(seconds=SCAN_FLOW_EXPIRES_SECONDS),
    }
    with _scan_lock:
        _scan_sessions[token] = row
    return row


def _scan_session_get(token: str, current_user: dict, context: str) -> dict:
    now = datetime.now()
    with _scan_lock:
        expired_tokens = [k for k, v in _scan_sessions.items() if now > v.get("expires_at", now)]
        for k in expired_tokens:
            _scan_sessions.pop(k, None)

        row = _scan_sessions.get(token)
        if not row:
            raise HTTPException(status_code=400, detail="Scan session not found or expired.")
        if int(row["user_id"]) != int(current_user["id"]):
            raise HTTPException(status_code=403, detail="Scan session user mismatch.")
        if str(row["context"]) != context:
            raise HTTPException(status_code=400, detail="Scan session context mismatch.")
        row["updated_at"] = now
        row["expires_at"] = now + timedelta(seconds=SCAN_FLOW_EXPIRES_SECONDS)
        return row


def _scan_session_update(token: str, step_index: int) -> None:
    now = datetime.now()
    with _scan_lock:
        row = _scan_sessions.get(token)
        if not row:
            return
        row["step_index"] = max(0, step_index)
        row["updated_at"] = now
        row["expires_at"] = now + timedelta(seconds=SCAN_FLOW_EXPIRES_SECONDS)


def _checkin_session_cleanup_runtime() -> None:
    now = datetime.now()
    with _checkin_session_lock:
        expired = [k for k, v in _checkin_runtime.items() if now > v.get("expires_at", now)]
        for k in expired:
            _checkin_runtime.pop(k, None)


def _checkin_session_create_db(*, session_id: str, user_id: int, employee_id: int | None, challenge_type: str, device_info: str | None, device_ip: str | None) -> None:
    expires_at = datetime.now() + timedelta(seconds=CHECKIN_SESSION_TTL_SECONDS)
    with get_conn_cursor() as (_, cursor):
        cursor.execute(
            """
            INSERT INTO checkin_sessions (
              session_id, user_id, employee_id, challenge_type, state, retries, device_info, device_ip, created_at, expires_at
            ) VALUES (%s, %s, %s, %s, 'started', 0, %s, %s, NOW(), %s)
            """,
            (session_id, user_id, employee_id, challenge_type, device_info, device_ip, expires_at),
        )


def _checkin_session_get_db(session_id: str) -> dict:
    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute(
            """
            SELECT session_id, user_id, employee_id, matched_employee_id, challenge_type, state, retries, confidence, created_at, expires_at
            FROM checkin_sessions
            WHERE session_id=%s
            LIMIT 1
            """,
            (session_id,),
        )
        row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Check-in session not found.")
    return row


def _checkin_session_update_db(session_id: str, *, state: str | None = None, retries: int | None = None, matched_employee_id: int | None = None, confidence: float | None = None, notes: str | None = None) -> None:
    updates: list[str] = []
    params: list[object] = []
    if state is not None:
        updates.append("state=%s")
        params.append(state)
    if retries is not None:
        updates.append("retries=%s")
        params.append(retries)
    if matched_employee_id is not None:
        updates.append("matched_employee_id=%s")
        params.append(matched_employee_id)
    if confidence is not None:
        updates.append("confidence=%s")
        params.append(confidence)
    if notes is not None:
        updates.append("notes=%s")
        params.append(notes[:255])
    if state == "verified":
        updates.append("verified_at=NOW()")
    if state == "completed":
        updates.append("completed_at=NOW()")
    updates.append("updated_at=NOW()")
    with get_conn_cursor() as (_, cursor):
        cursor.execute(
            f"UPDATE checkin_sessions SET {', '.join(updates)} WHERE session_id=%s",
            (*params, session_id),
        )


def _checkin_runtime_get_or_create(session_id: str) -> dict:
    _checkin_session_cleanup_runtime()
    now = datetime.now()
    with _checkin_session_lock:
        row = _checkin_runtime.get(session_id)
        if not row:
            row = {
                "center_hold_ms": 0,
                "last_ts": None,
                "reference_locked": False,
                "reference_embedding": None,
                "reference_image": None,
                "reference_metrics": None,
                "challenge_started_at": None,
                "blink_low_seen": False,
                "expires_at": now + timedelta(seconds=CHECKIN_SESSION_TTL_SECONDS),
            }
            _checkin_runtime[session_id] = row
        else:
            row["expires_at"] = now + timedelta(seconds=CHECKIN_SESSION_TTL_SECONDS)
        return row


def _extract_face_metrics(image_bgr: np.ndarray) -> dict:
    faces = face_engine._model.get(image_bgr)
    if not faces:
        raise ValueError("No face detected")
    if len(faces) > 1:
        raise ValueError("Multiple faces detected")

    face = faces[0]
    bbox = np.asarray(face.bbox, dtype=np.float32)
    kps = np.asarray(getattr(face, "kps", None), dtype=np.float32) if getattr(face, "kps", None) is not None else None
    if kps is None or kps.shape[0] < 5:
        raise ValueError("Face landmarks unavailable")
    face_engine.quality_checks(image_bgr, bbox, kps)
    h, w = image_bgr.shape[:2]
    x1, y1, x2, y2 = bbox
    bw = max(1.0, x2 - x1)
    bh = max(1.0, y2 - y1)
    area_ratio = float((bw * bh) / max(1.0, float(h * w)))
    if area_ratio < face_engine.min_face_area_ratio:
        raise ValueError("Face too far")

    left_eye = kps[0]
    right_eye = kps[1]
    nose = kps[2]
    eye_dist = max(1.0, float(abs(right_eye[0] - left_eye[0])))
    eye_mid = (left_eye + right_eye) / 2.0
    yaw = float((nose[0] - eye_mid[0]) / eye_dist)
    face_cx = float((x1 + x2) / 2.0 / max(1.0, w))
    face_cy = float((y1 + y2) / 2.0 / max(1.0, h))

    # Lightweight blink metric via eye ROI vertical edge energy
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    eye_metric_values: list[float] = []
    eye_half_w = int(max(6, eye_dist * 0.24))
    eye_half_h = int(max(4, eye_dist * 0.10))
    for eye in (left_eye, right_eye):
        cx, cy = int(eye[0]), int(eye[1])
        xa = max(0, cx - eye_half_w)
        xb = min(w, cx + eye_half_w)
        ya = max(0, cy - eye_half_h)
        yb = min(h, cy + eye_half_h)
        roi = gray[ya:yb, xa:xb]
        if roi.size == 0:
            continue
        sobel_y = cv2.Sobel(roi, cv2.CV_64F, 0, 1, ksize=3)
        eye_metric_values.append(float(np.mean(np.abs(sobel_y))))
    eye_open_metric = float(np.mean(eye_metric_values)) if eye_metric_values else 0.0

    emb = np.asarray(face.embedding, dtype=np.float32)
    emb = emb / max(np.linalg.norm(emb), 1e-8)
    return {
        "embedding": emb,
        "confidence": float(face.det_score),
        "bbox": [int(round(float(x1))), int(round(float(y1))), int(round(float(x2))), int(round(float(y2)))],
        "face_center": (face_cx, face_cy),
        "yaw": yaw,
        "eye_open_metric": eye_open_metric,
    }


def _is_centered(face_center: tuple[float, float]) -> bool:
    cx, cy = face_center
    return abs(cx - 0.5) <= 0.18 and abs(cy - 0.5) <= 0.2


def _challenge_instruction(challenge_type: str) -> str:
    if challenge_type == "blink":
        return "Blink once"
    if challenge_type == "turn_head_left":
        return "Turn your head slightly left"
    return "Turn your head slightly right"


def _verify_liveness_challenge(challenge_type: str, runtime: dict, metrics: dict) -> bool:
    ref = runtime.get("reference_metrics") or {}
    if challenge_type == "turn_head_left":
        return float(metrics.get("yaw", 0.0)) - float(ref.get("yaw", 0.0)) <= -0.08
    if challenge_type == "turn_head_right":
        return float(metrics.get("yaw", 0.0)) - float(ref.get("yaw", 0.0)) >= 0.08
    # blink
    base_eye = float(ref.get("eye_open_metric", 0.0))
    current_eye = float(metrics.get("eye_open_metric", 0.0))
    if base_eye <= 0:
        return False
    if not runtime.get("blink_low_seen"):
        if current_eye <= base_eye * 0.72:
            runtime["blink_low_seen"] = True
        return False
    return current_eye >= base_eye * 0.9


def _match_employee_embedding(embedding: np.ndarray) -> tuple[int | None, float]:
    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute(
            """
            SELECT fe.employee_id, fe.embedding
            FROM face_embeddings fe
            INNER JOIN (
              SELECT employee_id, MAX(created_at) AS mx
              FROM face_embeddings
              GROUP BY employee_id
            ) latest ON latest.employee_id = fe.employee_id AND latest.mx = fe.created_at
            """
        )
        rows = cursor.fetchall()
    best_emp: int | None = None
    best_sim = 0.0
    for row in rows:
        db_vec = np.frombuffer(row["embedding"], dtype=np.float32)
        sim = face_engine.cosine_similarity(embedding, db_vec)
        if sim > best_sim:
            best_sim = sim
            best_emp = int(row["employee_id"])
    if best_emp is None or best_sim < face_engine.threshold:
        return None, float(best_sim)
    return best_emp, float(best_sim)


def _client_ip(request: Request) -> str | None:
    if request.client and request.client.host:
        return str(request.client.host)
    return None


def _frame_metrics(image_bgr: np.ndarray) -> dict:
    faces = face_engine._model.get(image_bgr)
    if not faces:
        raise HTTPException(status_code=400, detail="No face detected in burst.")
    if len(faces) > 1:
        raise HTTPException(status_code=400, detail="Multiple faces detected in burst.")
    face = faces[0]
    bbox = np.asarray(face.bbox, dtype=np.float32)
    x1, y1, x2, y2 = bbox
    bw = max(1.0, x2 - x1)
    bh = max(1.0, y2 - y1)
    img_h, img_w = image_bgr.shape[:2]
    area_ratio = float((bw * bh) / max(1.0, img_h * img_w))
    if area_ratio < face_engine.min_face_area_ratio:
        raise HTTPException(status_code=400, detail="Face too far in burst. Move closer.")
    kps = getattr(face, "kps", None)
    if kps is None:
        raise HTTPException(status_code=400, detail="Landmarks not available for liveness.")
    kps = np.asarray(kps, dtype=np.float32)
    if kps.shape[0] < 5:
        raise HTTPException(status_code=400, detail="Insufficient landmarks for liveness.")

    left_eye = kps[0]
    right_eye = kps[1]
    nose = kps[2]
    mouth_l = kps[3]
    mouth_r = kps[4]

    nose_x_norm = float((nose[0] - x1) / bw)
    nose_y_norm = float((nose[1] - y1) / bh)
    eye_to_nose = float(abs(((left_eye[1] + right_eye[1]) / 2.0) - nose[1]) / bh)
    mouth_width = float(abs(mouth_r[0] - mouth_l[0]) / bw)
    return {
        "nose_x_norm": nose_x_norm,
        "nose_y_norm": nose_y_norm,
        "eye_to_nose": eye_to_nose,
        "mouth_width": mouth_width,
    }


def _verify_burst_movement(challenge: str, metrics: list[dict]) -> bool:
    if len(metrics) < 2:
        return False
    nose_vals = [m["nose_x_norm"] for m in metrics]
    eye_vals = [m["eye_to_nose"] for m in metrics]
    mouth_vals = [m["mouth_width"] for m in metrics]
    base_nose = nose_vals[0]

    if challenge == "turn_left":
        return max(nose_vals) - base_nose > 0.09
    if challenge == "turn_right":
        return base_nose - min(nose_vals) > 0.09
    if challenge == "blink":
        return max(eye_vals) - min(eye_vals) > 0.03
    if challenge == "smile":
        return max(mouth_vals) - min(mouth_vals) > 0.08
    return False


def _decode_upload_image_bytes_to_bgr(content: bytes) -> np.ndarray:
    try:
        pil_img = Image.open(BytesIO(content)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid image payload") from exc
    arr_rgb = np.asarray(pil_img, dtype=np.uint8)
    if arr_rgb.ndim != 3 or arr_rgb.shape[2] != 3:
        raise HTTPException(status_code=400, detail="Invalid image payload")
    return arr_rgb[:, :, ::-1].copy()


def _scan_validate_result(image_bgr: np.ndarray) -> dict:
    faces = face_engine._model.get(image_bgr)
    if not faces:
        return {"ok": False, "reason": "no_face", "bbox": None, "confidence": None}
    if len(faces) > 1:
        return {"ok": False, "reason": "multiple_faces", "bbox": None, "confidence": None}

    face = faces[0]
    bbox = np.asarray(face.bbox, dtype=np.float32)
    x1, y1, x2, y2 = bbox
    img_h, img_w = image_bgr.shape[:2]
    area_ratio = float(max(0.0, (x2 - x1) * (y2 - y1)) / max(1.0, float(img_h * img_w)))
    if area_ratio < face_engine.min_face_area_ratio:
        return {"ok": False, "reason": "face_too_small", "bbox": None, "confidence": float(face.det_score)}

    kps = np.asarray(getattr(face, "kps", None), dtype=np.float32) if getattr(face, "kps", None) is not None else None
    try:
        face_engine.quality_checks(image_bgr, bbox, kps)
    except ValueError as exc:
        msg = str(exc).strip().lower()
        if "low light" in msg:
            reason = "too_dark"
        elif "blurry" in msg:
            reason = "too_blurry"
        else:
            reason = "too_blurry"
        return {"ok": False, "reason": reason, "bbox": None, "confidence": float(face.det_score)}

    bbox_int = [int(round(float(x1))), int(round(float(y1))), int(round(float(x2))), int(round(float(y2)))]
    return {
        "ok": True,
        "reason": "ok",
        "bbox": bbox_int,
        "confidence": float(face.det_score),
    }


def _employee_maps_to_current_admin(employee_email: str, current_user: dict, cursor) -> bool:
    if str(employee_email).lower() == str(current_user["email"]).lower():
        return True
    cursor.execute(
        "SELECT id, email FROM users WHERE email=%s LIMIT 1",
        (employee_email,),
    )
    target_user = cursor.fetchone()
    if not target_user:
        return False
    return (
        int(target_user["id"]) == int(current_user["id"])
        or str(target_user["email"]).lower() == str(current_user["email"]).lower()
    )


def _resolve_employee_id_for_user(cursor, user_row: dict) -> str:
    direct_employee_id = str(user_row.get("employee_id") or "").strip()
    if direct_employee_id:
        return direct_employee_id

    email = str(user_row.get("email") or "").strip()
    if not email:
        return ""
    cursor.execute(
        "SELECT id FROM employees WHERE LOWER(email)=LOWER(%s) LIMIT 1",
        (email,),
    )
    row = cursor.fetchone()
    return str(row["id"]).strip() if row and row.get("id") is not None else ""


def _cascade_delete_user(user_id: int) -> dict:
    file_paths: list[str] = []
    cascade = {
        "userId": int(user_id),
        "email": None,
        "employeeId": None,
        "deletedAttendanceRows": 0,
        "deletedFaceEmbeddings": 0,
        "deletedFaceCaptureHashes": 0,
        "deletedEmployee": False,
        "deletedUser": False,
        "deletedFiles": 0,
    }

    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute("SELECT id, email, employee_id FROM users WHERE id=%s LIMIT 1", (user_id,))
        user_row = cursor.fetchone()
        if not user_row:
            return cascade

        cascade["email"] = user_row.get("email")
        employee_id = _resolve_employee_id_for_user(cursor, user_row)
        cascade["employeeId"] = employee_id or None

        if employee_id:
            cursor.execute("SELECT photo_url FROM employees WHERE id=%s LIMIT 1", (employee_id,))
            employee_row = cursor.fetchone()
            if employee_row and employee_row.get("photo_url"):
                file_paths.append(str(employee_row["photo_url"]))

            cursor.execute(
                "SELECT evidence_photo_url FROM attendance WHERE employee_id=%s AND evidence_photo_url IS NOT NULL",
                (employee_id,),
            )
            for row in cursor.fetchall() or []:
                evidence = str(row.get("evidence_photo_url") or "").strip()
                if evidence:
                    file_paths.append(evidence)

            cursor.execute("DELETE FROM attendance WHERE employee_id=%s", (employee_id,))
            cascade["deletedAttendanceRows"] = int(cursor.rowcount or 0)

            cursor.execute("DELETE FROM face_embeddings WHERE employee_id=%s", (employee_id,))
            cascade["deletedFaceEmbeddings"] = int(cursor.rowcount or 0)

            capture_hash_employee_id = _to_int_or_none(employee_id)
            if capture_hash_employee_id is not None:
                cursor.execute("DELETE FROM face_capture_hashes WHERE employee_id=%s", (capture_hash_employee_id,))
                cascade["deletedFaceCaptureHashes"] = int(cursor.rowcount or 0)

            cursor.execute("DELETE FROM employees WHERE id=%s", (employee_id,))
            cascade["deletedEmployee"] = bool(cursor.rowcount)

        cursor.execute("DELETE FROM users WHERE id=%s", (user_id,))
        cascade["deletedUser"] = bool(cursor.rowcount)

    deleted_file_count = 0
    for path in {p for p in file_paths if p}:
        _delete_upload_file(path)
        deleted_file_count += 1
    cascade["deletedFiles"] = deleted_file_count
    return cascade


@app.middleware("http")
async def maintenance_mode_middleware(request: Request, call_next):
    if _is_maintenance_mode():
        path = request.url.path
        if path.startswith("/api") and request.method.upper() not in {"GET", "HEAD", "OPTIONS"}:
            if path not in {"/api/admin/backup/restore", "/api/admin/backup/download"}:
                return JSONResponse(
                    status_code=503,
                    content={"detail": "System is temporarily in maintenance mode for restore. Try again shortly."},
                )
    return await call_next(request)


@app.on_event("startup")
def startup_event() -> None:
    init_db()


@api.post("/auth/login")
def login(payload: LoginRequest):
    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute(
            """
            SELECT id, name, email, password_hash, role, employee_id, created_at
            FROM users
            WHERE email=%s
            LIMIT 1
            """,
            (payload.email,),
        )
        user = cursor.fetchone()

    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = create_access_token(user_id=int(user["id"]), role=user["role"])
    return {
        "token": token,
        "user": _serialize_user(user),
    }


@api.get("/auth/me")
def me(current_user: dict = Depends(get_current_user)):
    return {"user": _serialize_user(current_user)}


@api.get("/time")
def get_server_time():
    now = datetime.now().astimezone()
    return {
        "ok": True,
        "iso": now.isoformat(),
        "timezone": str(now.tzinfo or ""),
    }


@api.post("/auth/change-password")
def change_password(payload: ChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute("SELECT password_hash FROM users WHERE id=%s LIMIT 1", (current_user["id"],))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        if not verify_password(payload.oldPassword, row["password_hash"]):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        new_hash = hash_password(payload.newPassword)
        cursor.execute("UPDATE users SET password_hash=%s WHERE id=%s", (new_hash, current_user["id"]))

    _audit(current_user["email"], "password_change", {"userId": current_user["id"]})
    return {"ok": True}


@api.post("/face/challenge")
def start_face_challenge(payload: dict | None = Body(default=None), current_user: dict = Depends(get_current_user)):
    context = str((payload or {}).get("context") or "checkin").strip().lower()
    if context not in {"checkin", "enroll"}:
        raise HTTPException(status_code=400, detail="context must be checkin or enroll")
    row = _create_liveness_challenge(current_user, context)
    return {
        "ok": True,
        "challenge_token": row["token"],
        "challenge_type": row["challenge"],
        "expires_in_sec": row["expiresInSec"],
        "allow_single_frame_fallback": LIVENESS_FALLBACK_ALLOW_SINGLE,
    }


@api.post("/scan/validate-face")
async def validate_face_scan(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    image_bgr: np.ndarray | None = None
    content_type = str(request.headers.get("content-type") or "").lower()

    if "multipart/form-data" in content_type:
        form = await request.form()
        file_obj = form.get("file")
        if isinstance(file_obj, UploadFile):
            content = await file_obj.read()
            if not content:
                raise HTTPException(status_code=400, detail="Empty image file")
            image_bgr = _decode_upload_image_bytes_to_bgr(content)
        else:
            image_base64 = str(form.get("imageBase64") or "").strip()
            if not image_base64:
                raise HTTPException(status_code=400, detail="Provide image via file or imageBase64")
            try:
                image_bgr = face_engine.decode_image(image_base64)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
    else:
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        image_base64 = str((payload or {}).get("imageBase64") or "").strip()
        if not image_base64:
            raise HTTPException(status_code=400, detail="Provide image via file or imageBase64")
        try:
            image_bgr = face_engine.decode_image(image_base64)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    result = _scan_validate_result(image_bgr)
    return result


@api.post("/scan/frame")
async def scan_frame(payload: dict = Body(...), current_user: dict = Depends(get_current_user)):
    context = str(payload.get("context") or "checkin").strip().lower()
    if context not in {"checkin", "enroll"}:
        raise HTTPException(status_code=400, detail="context must be checkin or enroll")

    image_base64 = str(payload.get("imageBase64") or "").strip()
    if not image_base64:
        raise HTTPException(status_code=400, detail="imageBase64 is required")
    token = str(payload.get("scan_token") or "").strip()

    try:
        image_bgr = face_engine.decode_image(image_base64)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    quality = _scan_validate_result(image_bgr)
    if not quality.get("ok"):
        guidance_map = {
            "no_face": "Center your face in the circle.",
            "multiple_faces": "Only one face should be visible.",
            "face_too_small": "Move closer to the camera.",
            "too_dark": "Improve lighting and try again.",
            "too_blurry": "Hold still for a moment.",
        }
        return {
            "ok": False,
            "scan_token": token or None,
            "direction": "center",
            "progress": 0,
            "guidanceText": guidance_map.get(quality.get("reason"), "Adjust your face position."),
            "reason": quality.get("reason"),
            "canCapture": False,
        }

    session = _scan_session_get(token, current_user, context) if token else _scan_session_start(current_user, context)
    step_index = int(session.get("step_index") or 0)
    step_index = max(0, min(step_index, len(SCAN_FLOW_DIRECTIONS)))

    metrics = _frame_metrics(image_bgr)
    if step_index < len(SCAN_FLOW_DIRECTIONS):
        target = SCAN_FLOW_DIRECTIONS[step_index]
        if _scan_direction_passed(target, metrics):
            step_index += 1
            _scan_session_update(session["token"], step_index)

    complete = step_index >= len(SCAN_FLOW_DIRECTIONS)
    progress = int(round(_scan_progress_ratio(step_index) * 100))
    direction = "complete" if complete else SCAN_FLOW_DIRECTIONS[step_index]
    guidance = "Verified. Capturing now..." if complete else _scan_guidance(direction)

    return {
        "ok": True,
        "scan_token": session["token"],
        "direction": direction,
        "progress": progress,
        "guidanceText": guidance,
        "reason": "ok",
        "canCapture": complete,
    }


@api.post("/checkin/start")
def checkin_start(
    payload: CheckinStartRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") == "admin":
        employee_id = int(payload.employee_id) if payload.employee_id else None
    else:
        mapped = _resolve_employee_id_for_current_user(current_user)
        if not mapped:
            raise HTTPException(status_code=400, detail="Your account is not linked to an employee ID.")
        employee_id = int(mapped)

    challenge_type = random.choice(CHECKIN_CHALLENGES)
    session_id = uuid.uuid4().hex
    _checkin_session_create_db(
        session_id=session_id,
        user_id=int(current_user["id"]),
        employee_id=employee_id,
        challenge_type=challenge_type,
        device_info=(payload.device_info or "").strip() or None,
        device_ip=_client_ip(request),
    )
    _checkin_runtime_get_or_create(session_id)
    return {
        "ok": True,
        "session_id": session_id,
        "challenge_type": challenge_type,
        "instruction": _challenge_instruction(challenge_type),
        "expires_in_sec": CHECKIN_SESSION_TTL_SECONDS,
    }


@api.post("/checkin/frame")
def checkin_frame(
    payload: CheckinFrameRequest,
    current_user: dict = Depends(get_current_user),
):
    session = _checkin_session_get_db(payload.session_id)
    if int(session["user_id"]) != int(current_user["id"]):
        raise HTTPException(status_code=403, detail="Check-in session user mismatch.")
    if session.get("expires_at") and datetime.now() > session["expires_at"]:
        _checkin_session_update_db(payload.session_id, state="expired")
        raise HTTPException(status_code=400, detail="Check-in session expired.")
    if str(session.get("state") or "") in {"completed", "expired", "failed"}:
        raise HTTPException(status_code=400, detail="Session is no longer active.")

    runtime = _checkin_runtime_get_or_create(payload.session_id)
    try:
        image = face_engine.decode_image(payload.imageBase64)
        metrics = _extract_face_metrics(image)
    except ValueError as exc:
        msg = str(exc).lower()
        reason = "no_face"
        if "multiple faces" in msg:
            reason = "multiple_faces"
        elif "low light" in msg:
            reason = "too_dark"
        elif "blurry" in msg:
            reason = "too_blurry"
        elif "too far" in msg:
            reason = "face_too_small"
        return {
            "ok": False,
            "state": "aligning",
            "ready_for_challenge": False,
            "verified": False,
            "reason": reason,
            "guidance_text": "Center your face and improve lighting.",
            "challenge_type": session["challenge_type"],
            "instruction": _challenge_instruction(session["challenge_type"]),
            "retries_left": max(0, CHECKIN_MAX_RETRIES - int(session.get("retries") or 0)),
        }

    now_ts = int(payload.timestamp or int(datetime.now().timestamp() * 1000))
    last_ts = runtime.get("last_ts")
    runtime["last_ts"] = now_ts

    if not runtime.get("reference_locked"):
        if _is_centered(metrics["face_center"]):
            dt = max(80, min(500, now_ts - int(last_ts or now_ts - 120)))
            runtime["center_hold_ms"] = int(runtime.get("center_hold_ms", 0)) + dt
            if runtime["center_hold_ms"] >= CHECKIN_CENTER_HOLD_MS:
                runtime["reference_locked"] = True
                runtime["reference_embedding"] = metrics["embedding"]
                runtime["reference_image"] = payload.imageBase64
                runtime["reference_metrics"] = metrics
                runtime["challenge_started_at"] = now_ts
                runtime["blink_low_seen"] = False
                _checkin_session_update_db(payload.session_id, state="challenge")
                return {
                    "ok": True,
                    "state": "challenge",
                    "ready_for_challenge": True,
                    "verified": False,
                    "guidance_text": _challenge_instruction(session["challenge_type"]),
                    "challenge_type": session["challenge_type"],
                    "instruction": _challenge_instruction(session["challenge_type"]),
                    "retries_left": max(0, CHECKIN_MAX_RETRIES - int(session.get("retries") or 0)),
                }
        else:
            runtime["center_hold_ms"] = max(0, int(runtime.get("center_hold_ms", 0)) - 120)

        return {
            "ok": True,
            "state": "aligning",
            "ready_for_challenge": False,
            "verified": False,
            "guidance_text": "Center your face and hold still.",
            "challenge_type": session["challenge_type"],
            "instruction": "Center your face",
            "retries_left": max(0, CHECKIN_MAX_RETRIES - int(session.get("retries") or 0)),
            "hold_ms": int(runtime.get("center_hold_ms", 0)),
        }

    challenge_type = str(session["challenge_type"])
    passed = _verify_liveness_challenge(challenge_type, runtime, metrics)
    elapsed = now_ts - int(runtime.get("challenge_started_at") or now_ts)

    if passed:
        matched_employee_id, best_conf = _match_employee_embedding(metrics["embedding"])
        if matched_employee_id is None:
            _checkin_session_update_db(payload.session_id, state="failed", notes="Face did not match enrolled profile.")
            return {
                "ok": False,
                "state": "failed",
                "verified": False,
                "reason": "face_mismatch",
                "guidance_text": "Face did not match enrolled profile.",
                "retries_left": 0,
            }

        if current_user.get("role") != "admin":
            mapped = _resolve_employee_id_for_current_user(current_user)
            if not mapped or int(mapped) != int(matched_employee_id):
                _checkin_session_update_db(payload.session_id, state="failed", notes="Matched a different employee profile.")
                raise HTTPException(status_code=403, detail="Matched a different employee profile.")

        runtime["matched_employee_id"] = matched_employee_id
        runtime["match_confidence"] = best_conf
        _checkin_session_update_db(
            payload.session_id,
            state="verified",
            matched_employee_id=matched_employee_id,
            confidence=best_conf,
            notes="Liveness verified",
        )
        return {
            "ok": True,
            "state": "verified",
            "verified": True,
            "matched_employee_id": matched_employee_id,
            "confidence": round(float(best_conf), 4),
            "guidance_text": "Verified",
            "challenge_type": challenge_type,
            "instruction": "Verified",
            "retries_left": max(0, CHECKIN_MAX_RETRIES - int(session.get("retries") or 0)),
        }

    if elapsed >= 3000:
        retries = int(session.get("retries") or 0) + 1
        retries_left = max(0, CHECKIN_MAX_RETRIES - retries)
        if retries > CHECKIN_MAX_RETRIES:
            _checkin_session_update_db(payload.session_id, state="failed", retries=retries, notes="Liveness failed")
            return {
                "ok": False,
                "state": "failed",
                "verified": False,
                "reason": "liveness_failed",
                "guidance_text": "Liveness failed. Try again.",
                "challenge_type": challenge_type,
                "instruction": _challenge_instruction(challenge_type),
                "retries_left": 0,
            }

        runtime["reference_locked"] = False
        runtime["center_hold_ms"] = 0
        runtime["challenge_started_at"] = None
        runtime["blink_low_seen"] = False
        _checkin_session_update_db(payload.session_id, state="started", retries=retries, notes="Retry challenge")
        return {
            "ok": False,
            "state": "retry",
            "verified": False,
            "reason": "liveness_failed",
            "guidance_text": f"Liveness failed. Retry {retries}/{CHECKIN_MAX_RETRIES}.",
            "challenge_type": challenge_type,
            "instruction": "Center your face",
            "retries_left": retries_left,
        }

    return {
        "ok": True,
        "state": "challenge",
        "ready_for_challenge": True,
        "verified": False,
        "guidance_text": _challenge_instruction(challenge_type),
        "challenge_type": challenge_type,
        "instruction": _challenge_instruction(challenge_type),
        "retries_left": max(0, CHECKIN_MAX_RETRIES - int(session.get("retries") or 0)),
    }


@api.post("/checkin/complete")
def checkin_complete(
    payload: CheckinCompleteRequest,
    current_user: dict = Depends(get_current_user),
):
    session = _checkin_session_get_db(payload.session_id)
    if int(session["user_id"]) != int(current_user["id"]):
        raise HTTPException(status_code=403, detail="Check-in session user mismatch.")
    if str(session.get("state") or "") != "verified":
        raise HTTPException(status_code=400, detail="Session is not verified yet.")
    employee_id = int(session.get("matched_employee_id") or 0)
    if employee_id <= 0:
        raise HTTPException(status_code=400, detail="No matched employee for this session.")

    confidence = float(session.get("confidence") or 0.0)
    today = date.today().isoformat()
    now_dt = datetime.now()
    checkin_time = now_dt.strftime("%H:%M")

    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute(
            """
            SELECT shift_start_time, grace_period_mins, fine_per_minute_pkr
            FROM employees
            WHERE id=%s
            LIMIT 1
            """,
            (employee_id,),
        )
        employee_settings = cursor.fetchone() or {}
        cursor.execute(
            "SELECT id, checkin_time, fine_amount, status FROM attendance WHERE employee_id=%s AND date=%s LIMIT 1",
            (employee_id, today),
        )
        existing = cursor.fetchone()
        if existing:
            existing_late_minutes, _ = _compute_fine(existing.get("checkin_time"), employee_settings)
            _checkin_session_update_db(payload.session_id, state="completed", notes="Already marked today")
            return {
                "ok": True,
                "already": True,
                "attendance": {
                    "id": str(existing["id"]),
                    "employee_id": employee_id,
                    "date": today,
                    "checkin_time": existing.get("checkin_time"),
                    "status": existing.get("status") or "Present",
                    "late_minutes": int(existing_late_minutes),
                    "fine_amount": float(existing.get("fine_amount") or 0.0),
                    "confidence": confidence,
                    "source": "face",
                    "note": "Already checked in today.",
                },
            }

        late_minutes, fine_amount = _compute_fine(checkin_time, employee_settings)
        status_label = "Late" if late_minutes > 0 else "Present"
        att_id = str(uuid.uuid4())
        cursor.execute(
            """
            INSERT INTO attendance (
              id, employee_id, date, checkin_time, status, fine_amount, confidence, source, marked_by_user_id, note
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'face', NULL, %s)
            """,
            (att_id, employee_id, today, checkin_time, status_label, fine_amount, confidence, "Auto liveness check-in"),
        )
    cache_invalidate("attendance:today")
    _checkin_session_update_db(payload.session_id, state="completed", notes="Attendance marked")
    _audit(
        current_user["email"],
        "checkin_success_option_a",
        {"employeeId": employee_id, "confidence": confidence, "lateMinutes": late_minutes, "fineAmount": fine_amount},
    )
    with _checkin_session_lock:
        _checkin_runtime.pop(payload.session_id, None)
    return {
        "ok": True,
        "already": False,
        "attendance": {
            "id": att_id,
            "employee_id": employee_id,
            "date": today,
            "checkin_time": checkin_time,
            "status": status_label,
            "late_minutes": int(late_minutes),
            "fine_amount": float(fine_amount),
            "confidence": float(confidence),
            "source": "face",
            "note": "Auto liveness check-in",
        },
    }


@api.post("/face/verify-burst")
def verify_face_burst(payload: dict = Body(...), current_user: dict = Depends(get_current_user)):
    token = str(payload.get("challenge_token") or "").strip()
    context = str(payload.get("context") or "checkin").strip().lower()
    frames = payload.get("frames") or []
    if not token:
        raise HTTPException(status_code=400, detail="challenge_token is required")
    if context not in {"checkin", "enroll"}:
        raise HTTPException(status_code=400, detail="context must be checkin or enroll")
    if not isinstance(frames, list):
        raise HTTPException(status_code=400, detail="frames must be an array of base64 images")

    challenge_row = _consume_liveness_challenge(token=token, current_user=current_user, context=context)
    challenge = str(challenge_row["challenge"])

    if len(frames) < 2:
        if LIVENESS_FALLBACK_ALLOW_SINGLE and len(frames) == 1:
            return {
                "ok": True,
                "verified": True,
                "fallback": True,
                "warning": "Burst unavailable. Single-frame fallback accepted.",
            }
        raise HTTPException(status_code=400, detail="Burst capture required for liveness.")

    sample_frames = frames[:12]
    metrics: list[dict] = []
    for frame in sample_frames:
        image = face_engine.decode_image(str(frame))
        metrics.append(_frame_metrics(image))

    if not _verify_burst_movement(challenge, metrics):
        raise HTTPException(status_code=400, detail="Liveness challenge failed. Possible spoof or insufficient movement.")

    return {"ok": True, "verified": True, "fallback": False}


def _validate_notice_window(starts_at: datetime | None, ends_at: datetime | None) -> None:
    if starts_at and ends_at and starts_at > ends_at:
        raise HTTPException(status_code=400, detail="starts_at must be less than or equal to ends_at")


@api.get("/notices")
def get_notices(_: dict = Depends(get_current_user)):
    now = datetime.now()
    with get_conn_cursor(dictionary=True) as (_, cursor):
        notices = list_public_notices(cursor, now)
    return {"ok": True, "notices": notices}


@api.get("/admin/notices")
def get_admin_notices(_: dict = Depends(require_admin)):
    with get_conn_cursor(dictionary=True) as (_, cursor):
        notices = list_admin_notices(cursor)
    return {"ok": True, "notices": notices}


@api.post("/admin/notices")
def create_admin_notice(payload: NoticeCreateRequest, current_user: dict = Depends(require_admin)):
    if not payload.title.strip() or not payload.body.strip():
        raise HTTPException(status_code=400, detail="title and body are required")
    _validate_notice_window(payload.starts_at, payload.ends_at)
    with get_conn_cursor(dictionary=True) as (_, cursor):
        notice_id = insert_notice(
            cursor,
            title=payload.title.strip(),
            body=payload.body.strip(),
            priority=payload.priority,
            is_active=payload.is_active,
            starts_at=payload.starts_at,
            ends_at=payload.ends_at,
            created_by_user_id=int(current_user["id"]),
        )
        row = get_notice_by_id(cursor, notice_id)
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create notice")
    _audit(current_user["email"], "notice_create", {"noticeId": notice_id})
    return {"ok": True, "notice": serialize_notice_row(row)}


@api.put("/admin/notices/{notice_id}")
def update_admin_notice(notice_id: int, payload: NoticeUpdateRequest, current_user: dict = Depends(require_admin)):
    if not payload.title.strip() or not payload.body.strip():
        raise HTTPException(status_code=400, detail="title and body are required")
    _validate_notice_window(payload.starts_at, payload.ends_at)
    with get_conn_cursor(dictionary=True) as (_, cursor):
        existing = get_notice_by_id(cursor, notice_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Notice not found")
        update_notice(
            cursor,
            notice_id,
            title=payload.title.strip(),
            body=payload.body.strip(),
            priority=payload.priority,
            is_active=payload.is_active,
            starts_at=payload.starts_at,
            ends_at=payload.ends_at,
        )
        row = get_notice_by_id(cursor, notice_id)
    _audit(current_user["email"], "notice_update", {"noticeId": notice_id})
    return {"ok": True, "notice": serialize_notice_row(row or existing)}


@api.delete("/admin/notices/{notice_id}")
def delete_admin_notice(notice_id: int, current_user: dict = Depends(require_admin)):
    with get_conn_cursor(dictionary=True) as (_, cursor):
        existing = get_notice_by_id(cursor, notice_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Notice not found")
        delete_notice(cursor, notice_id)
    _audit(current_user["email"], "notice_delete", {"noticeId": notice_id})
    return {"ok": True}


@api.get("/admin/settings")
def get_admin_settings(_: dict = Depends(require_admin)):
    with get_conn_cursor(dictionary=True) as (_, cursor):
        settings = _get_app_settings(cursor)
    return {
        "ok": True,
        "settings": {
            "shift_start_time": settings["shift_start_time"],
            "grace_period_mins": settings["grace_period_mins"],
            "fine_per_minute_pkr": settings["fine_per_minute_pkr"],
            "updated_at": settings["updated_at"].isoformat() if settings.get("updated_at") else None,
        },
    }


@api.put("/admin/settings")
def update_admin_settings(payload: AppSettingsUpdateRequest, current_user: dict = Depends(require_admin)):
    try:
        normalized_time = _normalize_shift_time(payload.shift_start_time)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="shift_start_time must be HH:MM or HH:MM:SS") from exc

    grace = int(payload.grace_period_mins)
    fine_rate = round(float(payload.fine_per_minute_pkr), 2)
    if grace < 0:
        raise HTTPException(status_code=400, detail="grace_period_mins must be >= 0")
    if fine_rate < 0:
        raise HTTPException(status_code=400, detail="fine_per_minute_pkr must be >= 0")

    with get_conn_cursor(dictionary=True) as (_, cursor):
        _get_app_settings(cursor)
        cursor.execute(
            """
            UPDATE app_settings
            SET shift_start_time=%s, grace_period_mins=%s, fine_per_minute_pkr=%s
            WHERE id=1
            """,
            (normalized_time, grace, fine_rate),
        )
        settings = _get_app_settings(cursor)

    _audit(
        current_user["email"],
        "admin_settings_update",
        {
            "shift_start_time": normalized_time,
            "grace_period_mins": grace,
            "fine_per_minute_pkr": fine_rate,
        },
    )

    return {
        "ok": True,
        "settings": {
            "shift_start_time": settings["shift_start_time"],
            "grace_period_mins": settings["grace_period_mins"],
            "fine_per_minute_pkr": settings["fine_per_minute_pkr"],
            "updated_at": settings["updated_at"].isoformat() if settings.get("updated_at") else None,
        },
    }

@api.get("/users")
def list_users(_: dict = Depends(require_admin)):
    cached = cache_get("users:list")
    if cached is not None:
        return cached

    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute(
            """
            SELECT id, name, email, role, employee_id, created_at
            FROM users
            ORDER BY created_at DESC
            """
        )
        rows = cursor.fetchall()

    result = {
        "ok": True,
        "users": [
            {
                "id": r["id"],
                "name": r["name"],
                "email": r["email"],
                "role": r["role"],
                "employeeId": _employee_id_text(r.get("employee_id")) or None,
                "createdAt": r["created_at"].isoformat() if r.get("created_at") else None,
            }
            for r in rows
        ],
    }
    cache_set("users:list", result, ttl_seconds=30)
    return result


@api.put("/users/{user_id}")
def update_user(user_id: int, payload: UpdateUserRequest, current_user: dict = Depends(require_admin)):
    normalized_name = str(payload.name).strip()
    normalized_email = str(payload.email).strip().lower()
    normalized_role = str(payload.role).strip().lower()
    if normalized_role not in {"admin", "user"}:
        raise HTTPException(status_code=400, detail="role must be admin or user")

    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute("SELECT id FROM users WHERE id=%s LIMIT 1", (user_id,))
        existing = cursor.fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="User not found")

        cursor.execute("SELECT id FROM users WHERE LOWER(email)=LOWER(%s) AND id<>%s LIMIT 1", (normalized_email, user_id))
        email_conflict = cursor.fetchone()
        if email_conflict:
            raise HTTPException(status_code=409, detail="Email is already used by another user.")

        if payload.employee_id is not None:
            cursor.execute("SELECT id FROM employees WHERE id=%s LIMIT 1", (payload.employee_id,))
            employee_row = cursor.fetchone()
            if not employee_row:
                raise HTTPException(status_code=404, detail="Employee not found")

        _assert_employee_link_available(cursor, employee_id=payload.employee_id, current_user_id=user_id)

        if payload.password:
            cursor.execute(
                "UPDATE users SET name=%s, email=%s, role=%s, employee_id=%s, password_hash=%s WHERE id=%s",
                (
                    normalized_name,
                    normalized_email,
                    normalized_role,
                    payload.employee_id,
                    hash_password(payload.password),
                    user_id,
                ),
            )
        else:
            cursor.execute(
                "UPDATE users SET name=%s, email=%s, role=%s, employee_id=%s WHERE id=%s",
                (normalized_name, normalized_email, normalized_role, payload.employee_id, user_id),
            )

        cursor.execute(
            "SELECT id, name, email, role, employee_id, created_at FROM users WHERE id=%s LIMIT 1",
            (user_id,),
        )
        updated = cursor.fetchone()

    _audit(
        current_user["email"],
        "user_update",
        {
            "userId": user_id,
            "role": normalized_role,
            "employeeId": _employee_id_text(payload.employee_id) or None,
            "passwordReset": bool(payload.password),
        },
    )
    cache_invalidate("users:")
    cache_invalidate("auth:me:")
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to fetch updated user")
    return {"ok": True, "user": _serialize_user(updated)}


@api.delete("/users/{user_id}")
def delete_user(user_id: int, current_user: dict = Depends(require_admin)):
    skipped_ids: list[int] = []
    deleted_ids: list[int] = []
    cascade_details: dict | None = None

    if user_id == int(current_user["id"]):
        skipped_ids.append(user_id)
    else:
        cascade_details = _cascade_delete_user(user_id)
        if cascade_details.get("deletedUser"):
            deleted_ids.append(user_id)

    cache_invalidate("users:")
    cache_invalidate("employees:")
    cache_invalidate("attendance:")
    cache_invalidate("auth:me:")
    _audit(
        current_user["email"],
        "user_delete_cascade",
        {
            "requestedId": user_id,
            "deletedIds": deleted_ids,
            "skippedIds": skipped_ids,
            "cascade": cascade_details,
        },
    )

    return {
        "ok": True,
        "deletedIds": deleted_ids,
        "skippedIds": skipped_ids,
        "message": (
            f"Deleted {len(deleted_ids)} users. Skipped {len(skipped_ids)} (cannot delete yourself)."
            if skipped_ids
            else f"Deleted {len(deleted_ids)} users."
        ),
    }


@api.post("/users/bulk-delete")
def bulk_delete_users(payload: BulkDeleteUsersRequest, current_user: dict = Depends(require_admin)):
    requested_ids = sorted(set(int(uid) for uid in payload.userIds if isinstance(uid, int)))
    if not requested_ids:
        return {"ok": True, "deletedIds": [], "skippedIds": [], "message": "No user ids provided."}

    current_admin_id = int(current_user["id"])
    skipped_ids = [uid for uid in requested_ids if uid == current_admin_id]
    target_ids = [uid for uid in requested_ids if uid != current_admin_id]
    deleted_ids: list[int] = []
    cascade_details: list[dict] = []

    for uid in target_ids:
        detail = _cascade_delete_user(uid)
        cascade_details.append(detail)
        if detail.get("deletedUser"):
            deleted_ids.append(uid)

    cache_invalidate("users:")
    cache_invalidate("employees:")
    cache_invalidate("attendance:")
    cache_invalidate("auth:me:")
    _audit(
        current_user["email"],
        "user_bulk_delete_cascade",
        {
            "requestedIds": requested_ids,
            "deletedIds": deleted_ids,
            "skippedIds": skipped_ids,
            "cascade": cascade_details,
        },
    )

    return {
        "ok": True,
        "deletedIds": deleted_ids,
        "skippedIds": skipped_ids,
        "message": (
            f"Deleted {len(deleted_ids)} users. Skipped {len(skipped_ids)} (cannot delete yourself)."
            if skipped_ids
            else f"Deleted {len(deleted_ids)} users."
        ),
    }


@api.post("/employees/enroll")
def enroll_employee(payload: EnrollEmployeeRequest, current_user: dict = Depends(require_admin)):
    image_hash = _sha256_hex(_decode_base64_image_bytes(payload.imageBase64))
    try:
        image = face_engine.decode_image(payload.imageBase64)
        result = face_engine.detect_and_embed(image)
        face_engine.quality_checks(image, result.bbox, result.kps)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    normalized_department = str(payload.department or "").strip()
    if normalized_department not in ALLOWED_DEPARTMENTS:
        raise HTTPException(status_code=400, detail="Invalid department value.")

    try:
        normalized_shift_start = _normalize_shift_time(payload.shift_start_time)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="shift_start_time must be HH:MM or HH:MM:SS") from exc
    normalized_grace = int(payload.grace_period_mins)
    normalized_fine_rate = round(float(payload.fine_per_minute_pkr), 2)

    requested_employee_id = _to_int_or_none(payload.employeeId)
    emb_id = str(uuid.uuid4())
    created_new = False
    employee_id = requested_employee_id
    with get_conn_cursor(dictionary=True) as (_, cursor):
        _assert_new_capture_hash(cursor, image_hash=image_hash, context="enroll", employee_id=requested_employee_id)
        exists = None
        if requested_employee_id is not None:
            cursor.execute("SELECT id, role, photo_url FROM employees WHERE id = %s LIMIT 1", (requested_employee_id,))
            exists = cursor.fetchone()
            if not exists:
                raise HTTPException(status_code=404, detail="Employee not found for update")
        role_candidates = [
            getattr(payload, "role", None),
            (exists or {}).get("role"),
        ]
        requested_role = next((str(v).strip().lower() for v in role_candidates if v and str(v).strip()), "user")
        allowed_roles = {"admin", "user"}
        normalized_role = requested_role if requested_role in allowed_roles else "user"

        if requested_employee_id is None:
            created_new = True
            cursor.execute(
                """
                INSERT INTO employees (name, email, department, role, shift_start_time, grace_period_mins, fine_per_minute_pkr, is_active, photo_url)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 1, NULL)
                """,
                (
                    payload.name,
                    payload.email,
                    normalized_department,
                    normalized_role,
                    normalized_shift_start,
                    normalized_grace,
                    normalized_fine_rate,
                ),
            )
            employee_id = int(cursor.lastrowid)
        else:
            employee_id = requested_employee_id

        cursor.execute(
            """
            SELECT employee_id, embedding
            FROM face_embeddings
            WHERE employee_id <> %s
            """,
            (employee_id,),
        )
        others = cursor.fetchall()
        for row in others:
            db_vec = np.frombuffer(row["embedding"], dtype=np.float32)
            sim = face_engine.cosine_similarity(result.embedding, db_vec)
            if sim >= ENROLL_DUPLICATE_FACE_THRESHOLD:
                raise HTTPException(status_code=409, detail="Face already enrolled for another employee")

        photo_url = create_thumbnail(image, result.bbox, str(employee_id))

        if created_new:
            cursor.execute("UPDATE employees SET photo_url=%s WHERE id=%s", (photo_url, employee_id))
        else:
            cursor.execute(
                """
                UPDATE employees
                SET name=%s, email=%s, department=%s, role=%s, shift_start_time=%s, grace_period_mins=%s, fine_per_minute_pkr=%s, is_active=1, photo_url=%s
                WHERE id=%s
                """,
                (
                    payload.name,
                    payload.email,
                    normalized_department,
                    normalized_role,
                    normalized_shift_start,
                    normalized_grace,
                    normalized_fine_rate,
                    photo_url,
                    employee_id,
                ),
            )

        cursor.execute(
            "INSERT INTO face_embeddings (id, employee_id, embedding) VALUES (%s, %s, %s)",
            (emb_id, employee_id, result.embedding.astype(np.float32).tobytes()),
        )

        cursor.execute(
            "SELECT id, role FROM users WHERE email=%s LIMIT 1",
            (payload.email,),
        )
        user_row = cursor.fetchone()
        user_id = int(user_row["id"]) if user_row else None
        _assert_employee_link_available(cursor, employee_id=employee_id, current_user_id=user_id)
        if not user_row:
            cursor.execute(
                """
                INSERT INTO users (name, email, password_hash, role, employee_id)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (payload.name, payload.email, hash_password(payload.password), normalized_role, employee_id),
            )
        else:
            if payload.resetPassword:
                cursor.execute(
                    "UPDATE users SET name=%s, role=%s, employee_id=%s, password_hash=%s WHERE id=%s",
                    (payload.name, normalized_role, employee_id, hash_password(payload.password), user_row["id"]),
                )
            else:
                cursor.execute(
                    "UPDATE users SET name=%s, role=%s, employee_id=%s WHERE id=%s",
                    (payload.name, normalized_role, employee_id, user_row["id"]),
                )

    _audit(current_user["email"], "employee_enroll", {"employeeId": employee_id})
    cache_invalidate("employees:")
    cache_invalidate("users:")

    return {
        "ok": True,
        "employee": {
            "id": str(employee_id),
            "name": payload.name,
            "email": payload.email,
            "department": normalized_department,
            "role": normalized_role,
            "shiftStartTime": normalized_shift_start,
            "gracePeriodMins": normalized_grace,
            "finePerMinutePkr": normalized_fine_rate,
            "photoUrl": photo_url,
            "isActive": True,
        },
        "photoUrl": photo_url,
    }


@api.post("/attendance/checkin/me")
def checkin_me(payload: CheckInMeRequest, current_user: dict = Depends(get_current_user)):
    employee_id = _resolve_employee_id_for_current_user(current_user)
    if not employee_id:
        raise HTTPException(status_code=400, detail="Your account is not linked to an employee ID. Ask admin to link your account.")
    return checkin(CheckInRequest(employeeId=employee_id, imageBase64=payload.imageBase64), current_user)


@api.put("/admin/users/{user_id}/link-employee")
def link_user_employee(user_id: int, payload: LinkEmployeeRequest, current_user: dict = Depends(require_admin)):
    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute("SELECT id, email, employee_id FROM users WHERE id=%s LIMIT 1", (user_id,))
        target_user = cursor.fetchone()
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")

        cursor.execute("SELECT id FROM employees WHERE id=%s LIMIT 1", (payload.employeeId,))
        employee = cursor.fetchone()
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")

        _assert_employee_link_available(cursor, employee_id=payload.employeeId, current_user_id=user_id)

        cursor.execute("UPDATE users SET employee_id=%s WHERE id=%s", (payload.employeeId, user_id))

    _audit(
        current_user["email"],
        "user_link_employee",
        {"userId": user_id, "employeeId": payload.employeeId},
    )
    cache_invalidate("users:")
    return {"ok": True}


@api.put("/employees/{employee_id}")
def update_employee(employee_id: str, payload: UpdateEmployeeRequest, current_user: dict = Depends(require_admin)):
    updates = []
    values = []
    normalized_department = payload.department
    if normalized_department is not None:
        normalized_department = str(normalized_department).strip()
        if normalized_department not in ALLOWED_DEPARTMENTS:
            raise HTTPException(status_code=400, detail="Invalid department value.")

    normalized_role = payload.role
    if normalized_role is not None:
        normalized_role = str(normalized_role).strip().lower()
        if normalized_role not in {"admin", "user"}:
            raise HTTPException(status_code=400, detail="role must be admin or user")

    normalized_shift_start = payload.shift_start_time
    if normalized_shift_start is not None:
        raw_shift = str(normalized_shift_start).strip()
        if raw_shift == "":
            normalized_shift_start = None
        else:
            try:
                normalized_shift_start = _normalize_shift_time(raw_shift)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="shift_start_time must be HH:MM or HH:MM:SS") from exc

    normalized_grace = payload.grace_period_mins
    if normalized_grace is not None:
        normalized_grace = int(normalized_grace)
        if normalized_grace < 0:
            raise HTTPException(status_code=400, detail="grace_period_mins must be >= 0")

    normalized_fine_rate = payload.fine_per_minute_pkr
    if normalized_fine_rate is not None:
        normalized_fine_rate = round(float(normalized_fine_rate), 2)
        if normalized_fine_rate < 0:
            raise HTTPException(status_code=400, detail="fine_per_minute_pkr must be >= 0")

    field_map = {
        "name": payload.name,
        "email": payload.email,
        "department": normalized_department,
        "role": normalized_role,
        "shift_start_time": normalized_shift_start,
        "grace_period_mins": normalized_grace,
        "fine_per_minute_pkr": normalized_fine_rate,
    }
    for key, value in field_map.items():
        if value is not None:
            updates.append(f"{key}=%s")
            values.append(value)

    if payload.is_active is not None:
        updates.append("is_active=%s")
        values.append(1 if payload.is_active else 0)

    if updates:
        values.append(employee_id)
        with get_conn_cursor() as (_, cursor):
            cursor.execute(f"UPDATE employees SET {', '.join(updates)} WHERE id=%s", tuple(values))

    photo_url = None
    if payload.imageBase64:
        image_hash = _sha256_hex(_decode_base64_image_bytes(payload.imageBase64))
        try:
            image = face_engine.decode_image(payload.imageBase64)
            result = face_engine.detect_and_embed(image)
            face_engine.quality_checks(image, result.bbox, result.kps)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        photo_url = create_thumbnail(image, result.bbox, employee_id)
        with get_conn_cursor(dictionary=True) as (_, cursor):
            _assert_new_capture_hash(cursor, image_hash=image_hash, context="enroll", employee_id=employee_id)
            cursor.execute(
                """
                SELECT employee_id, embedding
                FROM face_embeddings
                WHERE employee_id <> %s
                """,
                (employee_id,),
            )
            others = cursor.fetchall()
            for row in others:
                db_vec = np.frombuffer(row["embedding"], dtype=np.float32)
                sim = face_engine.cosine_similarity(result.embedding, db_vec)
                if sim >= ENROLL_DUPLICATE_FACE_THRESHOLD:
                    raise HTTPException(status_code=409, detail="Face already enrolled for another employee")
            cursor.execute("UPDATE employees SET photo_url=%s WHERE id=%s", (photo_url, employee_id))
            cursor.execute(
                "INSERT INTO face_embeddings (id, employee_id, embedding) VALUES (%s, %s, %s)",
                (str(uuid.uuid4()), employee_id, result.embedding.astype(np.float32).tobytes()),
            )

    _audit(current_user["email"], "employee_update", {"employeeId": employee_id, "reenrolled": bool(payload.imageBase64)})
    cache_invalidate("employees:")
    return {"ok": True, "photoUrl": photo_url}


@api.delete("/employees/{employee_id}")
def delete_employee(employee_id: str, current_user: dict = Depends(require_admin)):
    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute("SELECT id, email, photo_url FROM employees WHERE id=%s LIMIT 1", (employee_id,))
        employee = cursor.fetchone()
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")

        if _employee_maps_to_current_admin(employee["email"], current_user, cursor):
            raise HTTPException(status_code=400, detail="You can't delete your own account.")

        cursor.execute("DELETE FROM employees WHERE id=%s", (employee_id,))

    _delete_upload_file(employee.get("photo_url"))
    _audit(current_user["email"], "employee_delete", {"employeeIds": [employee_id]})
    cache_invalidate("employees:")
    cache_invalidate("attendance:")
    return {
        "ok": True,
        "deletedIds": [employee_id],
        "message": "Deleted 1 employee.",
    }


@api.post("/employees/bulk-delete")
def bulk_delete_employees(payload: BulkDeleteEmployeesRequest, current_user: dict = Depends(require_admin)):
    requested_ids = sorted({int(eid) for eid in payload.ids if isinstance(eid, int)})
    if not requested_ids:
        return {"ok": True, "deletedIds": [], "message": "No employee ids provided."}

    with get_conn_cursor(dictionary=True) as (_, cursor):
        placeholders = ", ".join(["%s"] * len(requested_ids))
        cursor.execute(
            f"SELECT id, email, photo_url FROM employees WHERE id IN ({placeholders})",
            tuple(requested_ids),
        )
        existing_rows = cursor.fetchall()
        if not existing_rows:
            return {"ok": True, "deletedIds": [], "message": "No matching employees found."}

        for row in existing_rows:
            if _employee_maps_to_current_admin(row["email"], current_user, cursor):
                raise HTTPException(status_code=400, detail="You can't delete your own account.")

        existing_ids = sorted(int(r["id"]) for r in existing_rows)
        delete_placeholders = ", ".join(["%s"] * len(existing_ids))
        cursor.execute(
            f"DELETE FROM employees WHERE id IN ({delete_placeholders})",
            tuple(existing_ids),
        )

    for row in existing_rows:
        _delete_upload_file(row.get("photo_url"))

    _audit(current_user["email"], "employee_bulk_delete", {"employeeIds": existing_ids})
    cache_invalidate("employees:")
    cache_invalidate("attendance:")
    return {
        "ok": True,
        "deletedIds": existing_ids,
        "message": f"Deleted {len(existing_ids)} employees.",
    }


@api.get("/employees")
def list_employees(_: dict = Depends(require_admin)):
    cached = cache_get("employees:list")
    if cached is not None:
        return cached

    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute(
            """
            SELECT id, name, email, department, role, shift_start_time, grace_period_mins, fine_per_minute_pkr, is_active, photo_url, created_at
            FROM employees
            ORDER BY created_at DESC
            """
        )
        rows = cursor.fetchall()

    result = {
        "ok": True,
        "employees": [
            {
                "id": str(r["id"]),
                "name": r["name"],
                "email": r["email"],
                "department": r["department"],
                "role": r["role"],
                "shiftStartTime": _normalize_shift_time(r.get("shift_start_time")) if r.get("shift_start_time") else None,
                "gracePeriodMins": int(r.get("grace_period_mins") or 15),
                "finePerMinutePkr": float(r.get("fine_per_minute_pkr") or 0),
                "isActive": bool(r["is_active"]),
                "photoUrl": r["photo_url"],
                "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ],
    }
    cache_set("employees:list", result, ttl_seconds=30)
    return result


@api.post("/attendance/checkin")
def checkin(payload: CheckInRequest, current_user: dict = Depends(get_current_user)):
    if not _acquire_employee_lock(payload.employeeId):
        return {
            "ok": False,
            "already": False,
            "status": "Busy",
            "fineAmount": 0,
            "lateMinutes": 0,
            "checkInTime": None,
            "confidence": 0,
            "message": "A check-in is already being processed for this employee.",
        }

    today = date.today().isoformat()
    now = datetime.now()
    checkin_time = now.strftime("%H:%M")
    image_hash = _sha256_hex(_decode_base64_image_bytes(payload.imageBase64))


    try:
        with get_conn_cursor(dictionary=True) as (_, cursor):
            if current_user.get("role") != "admin":
                mapped_employee = _resolve_employee_id_for_current_user(current_user)
                if not mapped_employee or mapped_employee != payload.employeeId:
                    raise HTTPException(status_code=403, detail="Check-in employee mismatch for current user.")
            cursor.execute(
                """
                SELECT shift_start_time, grace_period_mins, fine_per_minute_pkr
                FROM employees
                WHERE id=%s
                LIMIT 1
                """,
                (payload.employeeId,),
            )
            employee_settings = cursor.fetchone() or {}
            cursor.execute(
                "SELECT checkin_time, fine_amount FROM attendance WHERE employee_id=%s AND date=%s LIMIT 1",
                (payload.employeeId, today),
            )
            existing = cursor.fetchone()
            if existing:
                existing_late_minutes, _ = _compute_fine(existing.get("checkin_time"), employee_settings)
                return {
                    "ok": True,
                    "already": True,
                    "status": "Present",
                    "fineAmount": float(existing.get("fine_amount") or 0),
                    "lateMinutes": existing_late_minutes,
                    "checkInTime": existing["checkin_time"],
                    "confidence": 1,
                    "message": "Already checked in today.",
                }

            cursor.execute(
                "SELECT embedding FROM face_embeddings WHERE employee_id=%s ORDER BY created_at DESC",
                (payload.employeeId,),
            )
            stored = cursor.fetchall()
            if not stored:
                raise HTTPException(status_code=404, detail="No enrolled face embeddings for this employee")
            _assert_new_capture_hash(cursor, image_hash=image_hash, context="checkin", employee_id=payload.employeeId)

        try:
            image = face_engine.decode_image(payload.imageBase64)
            result = face_engine.detect_and_embed(image)
            face_engine.quality_checks(image, result.bbox, result.kps)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        sims = []
        for row in stored:
            db_vec = np.frombuffer(row["embedding"], dtype=np.float32)
            sims.append(face_engine.cosine_similarity(result.embedding, db_vec))

        best = max(sims) if sims else 0.0
        ok = best >= face_engine.threshold

        if ok:
            status = "Present"
            late_minutes, fine = _compute_fine(checkin_time, employee_settings)
            with get_conn_cursor() as (_, cursor):
                cursor.execute(
                    """
                    INSERT INTO attendance (
                      id, employee_id, date, checkin_time, status, fine_amount, confidence, source, marked_by_user_id, note
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, 'face', NULL, NULL)
                    """,
                    (str(uuid.uuid4()), payload.employeeId, today, checkin_time, status, fine, best),
                )
            _audit(
                current_user["email"],
                "checkin_success",
                {"employeeId": payload.employeeId, "confidence": best, "lateMinutes": late_minutes, "fineAmount": fine},
            )
            cache_invalidate("attendance:today")
            return {
                "ok": True,
                "already": False,
                "status": status,
                "fineAmount": fine,
                "lateMinutes": late_minutes,
                "checkInTime": checkin_time,
                "confidence": round(best, 4),
                "message": "Check-in successful.",
            }

        _audit(current_user["email"], "checkin_failed", {"employeeId": payload.employeeId, "confidence": best})
        return {
            "ok": False,
            "already": False,
            "status": "Failed",
            "fineAmount": 0,
            "lateMinutes": 0,
            "checkInTime": None,
            "confidence": round(best, 4),
            "message": "Face did not match enrolled profile.",
        }
    finally:
        _release_employee_lock(payload.employeeId)


@api.get("/admin/attendance")
def admin_all_attendance(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = None,
    employee_id: str | None = None,
    department: str | None = None,
    q: str | None = None,
    page: int = 1,
    limit: int = 20,
    _: dict = Depends(require_admin),
):
    safe_page = max(1, int(page))
    safe_limit = max(1, min(100, int(limit)))
    offset = (safe_page - 1) * safe_limit

    filters: list[str] = []
    params: list[object] = []
    if from_:
        filters.append("a.date >= %s")
        params.append(from_)
    if to:
        filters.append("a.date <= %s")
        params.append(to)
    if employee_id:
        filters.append("a.employee_id = %s")
        params.append(employee_id)
    if department:
        filters.append("e.department = %s")
        params.append(department)
    if q:
        like = f"%{q.strip().lower()}%"
        filters.append("(LOWER(e.name) LIKE %s OR LOWER(e.email) LIKE %s OR CAST(e.id AS CHAR) LIKE %s)")
        params.extend([like, like, like])

    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""

    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute(
            f"""
            SELECT COUNT(*) AS total
            FROM attendance a
            JOIN employees e ON e.id = a.employee_id
            {where_clause}
            """,
            tuple(params),
        )
        total = int((cursor.fetchone() or {}).get("total", 0))

        cursor.execute(
            f"""
            SELECT
              a.id, a.employee_id, a.date, a.checkin_time, a.status, a.fine_amount,
              a.confidence, a.source, a.note, a.created_at, a.evidence_photo_url,
              e.id AS e_id, e.name AS e_name, e.email AS e_email, e.department AS e_department,
              e.role AS e_role, e.shift_start_time AS e_shift_start_time, e.grace_period_mins AS e_grace_period_mins,
              e.fine_per_minute_pkr AS e_fine_per_minute_pkr, e.is_active AS e_is_active, e.photo_url AS e_photo_url
            FROM attendance a
            JOIN employees e ON e.id = a.employee_id
            {where_clause}
            ORDER BY a.date DESC, a.checkin_time DESC, a.created_at DESC
            LIMIT %s OFFSET %s
            """,
            tuple(params + [safe_limit, offset]),
        )
        rows = cursor.fetchall()

    items = []
    for r in rows:
        late_minutes, _ = _compute_fine(
            r.get("checkin_time"),
            {
                "shift_start_time": r.get("e_shift_start_time"),
                "grace_period_mins": r.get("e_grace_period_mins"),
                "fine_per_minute_pkr": r.get("e_fine_per_minute_pkr"),
            },
        )
        items.append(
            {
                "id": r["id"],
                "employee_id": str(r["employee_id"]),
                "date": str(r["date"]),
                "checkin_time": r["checkin_time"],
                "status": r["status"],
                "fine_amount": float(r["fine_amount"]),
                "late_minutes": late_minutes,
                "confidence": float(r["confidence"]),
                "source": r.get("source"),
                "note": r.get("note"),
                "evidence_photo_url": r.get("evidence_photo_url"),
                "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
                "employee": {
                    "id": str(r["e_id"]),
                    "name": r["e_name"],
                    "email": r["e_email"],
                    "department": r["e_department"],
                    "role": r["e_role"],
                    "is_active": bool(r["e_is_active"]),
                    "photo_url": r["e_photo_url"],
                },
            }
        )

    return {"items": items, "total": total, "page": safe_page, "limit": safe_limit}


@api.get("/admin/attendance/employee/{employee_id}")
def admin_employee_attendance_report(employee_id: str, _: dict = Depends(require_admin)):
    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute(
            """
            SELECT id, name, email, department, role, shift_start_time, grace_period_mins, fine_per_minute_pkr, is_active, photo_url
            FROM employees
            WHERE id=%s
            LIMIT 1
            """,
            (employee_id,),
        )
        employee = cursor.fetchone()
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")

        cursor.execute(
            """
            SELECT
              COUNT(DISTINCT CASE WHEN status='Present' THEN date END) AS present_days,
              COUNT(DISTINCT CASE WHEN fine_amount > 0 THEN date END) AS late_days,
              COALESCE(SUM(fine_amount), 0) AS total_fine,
              MAX(created_at) AS last_checkin
            FROM attendance
            WHERE employee_id=%s
            """,
            (employee_id,),
        )
        summary_row = cursor.fetchone() or {}

        cursor.execute(
            """
            SELECT
              id, employee_id, date, checkin_time, status, fine_amount,
              confidence, source, note, evidence_photo_url, created_at
            FROM attendance
            WHERE employee_id=%s
            ORDER BY date DESC, checkin_time DESC, created_at DESC
            """,
            (employee_id,),
        )
        history_rows = cursor.fetchall()

    return {
        "employee": {
            "id": str(employee["id"]),
            "name": employee["name"],
            "email": employee["email"],
            "department": employee["department"],
            "role": employee["role"],
            "is_active": bool(employee["is_active"]),
            "photo_url": employee["photo_url"],
        },
        "summary": {
            "present_days": int(summary_row.get("present_days") or 0),
            "late_days": int(summary_row.get("late_days") or 0),
            "total_fine": float(summary_row.get("total_fine") or 0),
            "last_checkin": summary_row["last_checkin"].isoformat() if summary_row.get("last_checkin") else None,
        },
        "history": [
            {
                "id": r["id"],
                "employee_id": str(r["employee_id"]),
                "date": str(r["date"]),
                "checkin_time": r["checkin_time"],
                "status": r["status"],
                "fine_amount": float(r["fine_amount"]),
                "late_minutes": _compute_fine(
                    r.get("checkin_time"),
                    {
                        "shift_start_time": employee.get("shift_start_time"),
                        "grace_period_mins": employee.get("grace_period_mins"),
                        "fine_per_minute_pkr": employee.get("fine_per_minute_pkr"),
                    },
                )[0],
                "confidence": float(r["confidence"]),
                "source": r.get("source"),
                "note": r.get("note"),
                "evidence_photo_url": r.get("evidence_photo_url"),
                "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
            }
            for r in history_rows
        ],
    }


@api.get("/attendance/today")
def today_attendance(_: dict = Depends(require_admin)):
    cached = cache_get("attendance:today")
    if cached is not None:
        return cached

    today = date.today().isoformat()
    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute(
            """
            SELECT a.id, a.employee_id, a.date, a.checkin_time, a.status, a.fine_amount,
                   a.confidence, a.source, a.evidence_photo_url, a.created_at, e.name, e.department, e.role, e.photo_url,
                   e.shift_start_time, e.grace_period_mins, e.fine_per_minute_pkr
            FROM attendance a
            JOIN employees e ON e.id = a.employee_id
            WHERE a.date=%s
            ORDER BY a.created_at DESC
            """,
            (today,),
        )
        rows = cursor.fetchall()

    result = {
        "ok": True,
        "records": [
            {
                "id": r["id"],
                "employeeId": str(r["employee_id"]),
                "name": r["name"],
                "department": r["department"],
                "role": r["role"],
                "photoUrl": r["photo_url"],
                "date": str(r["date"]),
                "checkInTime": r["checkin_time"],
                "status": r["status"],
                "fineAmount": float(r["fine_amount"]),
                "lateMinutes": _compute_fine(
                    r.get("checkin_time"),
                    {
                        "shift_start_time": r.get("shift_start_time"),
                        "grace_period_mins": r.get("grace_period_mins"),
                        "fine_per_minute_pkr": r.get("fine_per_minute_pkr"),
                    },
                )[0],
                "confidence": float(r["confidence"]),
                "source": r.get("source"),
                "evidencePhotoUrl": r.get("evidence_photo_url"),
                "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ],
    }
    cache_set("attendance:today", result, ttl_seconds=15)
    return result


@api.get("/attendance/history/{employee_id}")
def attendance_history(employee_id: str, current_user: dict = Depends(get_current_user)):
    if employee_id == "me":
        employee_id = _resolve_employee_id_for_current_user(current_user)
        if not employee_id:
            raise HTTPException(status_code=400, detail="Your account is not linked to an employee ID. Ask admin to link your account.")

    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute(
            """
            SELECT id, name, email, department, role, shift_start_time, grace_period_mins, fine_per_minute_pkr, is_active, photo_url
            FROM employees
            WHERE id=%s
            LIMIT 1
            """,
            (employee_id,),
        )
        employee = cursor.fetchone()

        cursor.execute(
            """
            SELECT id, employee_id, date, checkin_time, status, fine_amount, confidence, source, note, evidence_photo_url, created_at
            FROM attendance
            WHERE employee_id=%s
            ORDER BY date DESC, created_at DESC
            """,
            (employee_id,),
        )
        rows = cursor.fetchall()

    return {
        "ok": True,
        "employee": {
            "id": str(employee["id"]),
            "name": employee["name"],
            "email": employee["email"],
            "department": employee["department"],
            "role": employee["role"],
            "isActive": bool(employee["is_active"]),
            "photoUrl": employee.get("photo_url"),
        }
        if employee
        else None,
        "records": [
            {
                "id": r["id"],
                "employeeId": str(r["employee_id"]),
                "date": str(r["date"]),
                "checkInTime": r["checkin_time"],
                "status": r["status"],
                "fineAmount": float(r["fine_amount"]),
                "lateMinutes": _compute_fine(
                    r.get("checkin_time"),
                    {
                        "shift_start_time": employee.get("shift_start_time") if employee else None,
                        "grace_period_mins": employee.get("grace_period_mins") if employee else None,
                        "fine_per_minute_pkr": employee.get("fine_per_minute_pkr") if employee else None,
                    },
                )[0],
                "confidence": float(r["confidence"]),
                "source": r.get("source"),
                "note": r.get("note"),
                "evidencePhotoUrl": r.get("evidence_photo_url"),
                "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ],
    }


@api.get("/attendance/history/me")
def attendance_history_me(current_user: dict = Depends(get_current_user)):
    employee_id = _resolve_employee_id_for_current_user(current_user)
    if not employee_id:
        raise HTTPException(status_code=400, detail="Your account is not linked to an employee ID. Ask admin to link your account.")
    return attendance_history(employee_id, current_user)


@api.get("/attendance/month")
def attendance_month(year: int, month: int, current_user: dict = Depends(get_current_user)):
    employee_id = _resolve_employee_id_for_current_user(current_user)
    if not employee_id:
        raise HTTPException(status_code=400, detail="Your account is not linked to an employee ID. Ask admin to link your account.")

    month_start, next_month = _month_start_end(year, month)
    today = date.today()

    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute(
            """
            SELECT shift_start_time, grace_period_mins, fine_per_minute_pkr
            FROM employees
            WHERE id=%s
            LIMIT 1
            """,
            (employee_id,),
        )
        employee_settings = cursor.fetchone() or {}
        cursor.execute(
            """
            SELECT date, status, checkin_time, fine_amount, source, evidence_photo_url
            FROM attendance
            WHERE employee_id=%s AND date >= %s AND date < %s
            ORDER BY date ASC
            """,
            (employee_id, month_start.isoformat(), next_month.isoformat()),
        )
        rows = cursor.fetchall()

    by_day = {str(r["date"]): r for r in rows}
    month_days: list[dict] = []
    cursor_day = month_start
    while cursor_day < next_month:
        key = cursor_day.isoformat()
        row = by_day.get(key)
        if row:
            normalized_status = "present" if str(row.get("status") or "").strip().lower() == "present" else "absent"
            month_days.append(
                {
                    "date": key,
                    "weekday": cursor_day.strftime("%a"),
                    "status": normalized_status,
                    "checkin_time": row.get("checkin_time"),
                    "late_minutes": _compute_fine(row.get("checkin_time"), employee_settings)[0],
                    "fine_amount": float(row.get("fine_amount") or 0),
                    "source": row.get("source"),
                    "evidence_photo_url": row.get("evidence_photo_url"),
                }
            )
        else:
            derived_status = "absent" if cursor_day < today else "not_marked"
            month_days.append(
                {
                    "date": key,
                    "weekday": cursor_day.strftime("%a"),
                    "status": derived_status,
                    "checkin_time": None,
                    "late_minutes": 0,
                    "fine_amount": 0.0,
                    "source": None,
                    "evidence_photo_url": None,
                }
            )
        cursor_day += timedelta(days=1)

    return {"ok": True, "year": year, "month": month, "month_days": month_days}


@api.post("/attendance/manual-selfie")
async def manual_selfie_attendance(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    employee_id = _resolve_employee_id_for_current_user(current_user)
    if not employee_id:
        raise HTTPException(status_code=400, detail="Your account is not linked to an employee ID. Ask admin to link your account.")

    content_type = (file.content_type or "").lower().strip()
    if content_type not in ALLOWED_MANUAL_SELFIE_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG and PNG images are allowed.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(content) > MAX_MANUAL_SELFIE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds 5MB upload limit.")
    image_hash = _sha256_hex(content)

    try:
        with Image.open(BytesIO(content)) as img:
            img.verify()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="Invalid image file.")

    today = date.today()
    today_str = today.isoformat()
    checkin_time = datetime.now().strftime("%H:%M")
    evidence_photo_url: str | None = None
    late_minutes = 0
    fine_amount = 0.0

    try:
        with get_conn_cursor(dictionary=True) as (_, cursor):
            _assert_new_capture_hash(cursor, image_hash=image_hash, context="checkin", employee_id=employee_id)
            cursor.execute(
                """
                SELECT shift_start_time, grace_period_mins, fine_per_minute_pkr
                FROM employees
                WHERE id=%s
                LIMIT 1
                """,
                (employee_id,),
            )
            employee_settings = cursor.fetchone() or {}
            cursor.execute(
                "SELECT id FROM attendance WHERE employee_id=%s AND date=%s LIMIT 1",
                (employee_id, today_str),
            )
            existing = cursor.fetchone()
            if existing:
                raise HTTPException(status_code=409, detail="Already marked today")

            late_minutes, fine_amount = _compute_fine(checkin_time, employee_settings)
            evidence_photo_url = _save_manual_selfie_image(employee_id=employee_id, today=today, content=content)
            attendance_id = str(uuid.uuid4())
            cursor.execute(
                """
                INSERT INTO attendance (
                  id, employee_id, date, checkin_time, status, fine_amount, confidence,
                  source, marked_by_user_id, note, evidence_photo_url
                )
                VALUES (%s, %s, %s, %s, 'Present', %s, 0, 'manual', %s, NULL, %s)
                """,
                (
                    attendance_id,
                    employee_id,
                    today_str,
                    checkin_time,
                    fine_amount,
                    current_user["id"],
                    evidence_photo_url,
                ),
            )

            cursor.execute(
                """
                SELECT id, employee_id, date, checkin_time, status, fine_amount, confidence, source, created_at, evidence_photo_url
                FROM attendance
                WHERE id=%s
                LIMIT 1
                """,
                (attendance_id,),
            )
            created = cursor.fetchone()
    except IntegrityError:
        _delete_upload_file(evidence_photo_url)
        raise HTTPException(status_code=409, detail="Already marked today")
    except Exception:
        _delete_upload_file(evidence_photo_url)
        raise

    _audit(
        current_user["email"],
        "attendance_manual_selfie_mark",
        {"employeeId": employee_id, "date": today_str, "status": "Present", "lateMinutes": late_minutes, "fineAmount": fine_amount},
    )
    cache_invalidate("attendance:")

    if not created:
        raise HTTPException(status_code=500, detail="Failed to create attendance record")

    return {
        "ok": True,
        "attendance": {
            "id": created["id"],
            "employee_id": str(created["employee_id"]),
            "date": str(created["date"]),
            "checkin_time": created["checkin_time"],
            "status": created["status"],
            "fine_amount": float(created["fine_amount"]),
            "late_minutes": late_minutes,
            "confidence": float(created["confidence"]),
            "source": created.get("source"),
            "evidence_photo_url": created.get("evidence_photo_url"),
            "created_at": created["created_at"].isoformat() if created.get("created_at") else None,
        },
    }


@api.get("/attendance/month/me")
def attendance_month_me(month: str, current_user: dict = Depends(get_current_user)):
    try:
        month_start = datetime.strptime(month, "%Y-%m").date().replace(day=1)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="month must be in YYYY-MM format") from exc

    employee_id = _resolve_employee_id_for_current_user(current_user)
    if not employee_id:
        raise HTTPException(status_code=400, detail="Your account is not linked to an employee ID. Ask admin to link your account.")

    next_month = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute(
            """
            SELECT shift_start_time, grace_period_mins, fine_per_minute_pkr
            FROM employees
            WHERE id=%s
            LIMIT 1
            """,
            (employee_id,),
        )
        employee_settings = cursor.fetchone() or {}
        cursor.execute(
            """
            SELECT date, status, checkin_time, source, confidence, fine_amount, evidence_photo_url
            FROM attendance
            WHERE employee_id=%s AND date >= %s AND date < %s
            ORDER BY date ASC
            """,
            (employee_id, month_start.isoformat(), next_month.isoformat()),
        )
        rows = cursor.fetchall()

    by_day = {str(r["date"]): r for r in rows}
    days = []
    cursor_day = month_start
    while cursor_day < next_month:
        key = cursor_day.isoformat()
        row = by_day.get(key)
        if row:
            days.append(
                {
                    "date": key,
                    "status": row["status"],
                    "checkInTime": row["checkin_time"],
                    "lateMinutes": _compute_fine(row.get("checkin_time"), employee_settings)[0],
                    "source": row.get("source"),
                    "confidence": float(row["confidence"]),
                    "fineAmount": float(row["fine_amount"]),
                    "evidencePhotoUrl": row.get("evidence_photo_url"),
                }
            )
        else:
            days.append(
                {
                    "date": key,
                    "status": "Late",
                    "checkInTime": None,
                    "lateMinutes": 0,
                    "source": None,
                    "confidence": 0.0,
                    "fineAmount": 0.0,
                    "evidencePhotoUrl": None,
                }
            )
        cursor_day += timedelta(days=1)

    return {"ok": True, "month": month, "days": days}


@api.post("/attendance/month/me/mark")
def mark_attendance_month_me(payload: MarkMonthlyAttendanceRequest, current_user: dict = Depends(get_current_user)):
    today_str = date.today().isoformat()
    if payload.date != today_str:
        raise HTTPException(status_code=400, detail="Only today can be marked manually.")

    if payload.status.strip() != "Present":
        raise HTTPException(status_code=400, detail="Only Present status can be marked manually.")

    if payload.note:
        # Keep API contract but this field is currently not persisted by monthly mark flow.
        pass

    return manual_attendance_today({"date": payload.date}, current_user)


@api.post("/attendance/manual-today")
def manual_attendance_today(payload: dict | None = Body(default=None), current_user: dict = Depends(get_current_user)):
    employee_id = _resolve_employee_id_for_current_user(current_user)
    if not employee_id:
        raise HTTPException(status_code=400, detail="Your account is not linked to an employee ID. Ask admin to link your account.")

    today = date.today()
    today_str = today.isoformat()
    payload_date = (payload or {}).get("date")
    if payload_date and str(payload_date) != today_str:
        raise HTTPException(status_code=400, detail="Only today can be marked manually.")
    checkin_time = datetime.now().strftime("%H:%M")
    late_minutes = 0
    fine_amount = 0.0

    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute(
            """
            SELECT shift_start_time, grace_period_mins, fine_per_minute_pkr
            FROM employees
            WHERE id=%s
            LIMIT 1
            """,
            (employee_id,),
        )
        employee_settings = cursor.fetchone() or {}
        late_minutes, fine_amount = _compute_fine(checkin_time, employee_settings)
        cursor.execute(
            "SELECT id, source FROM attendance WHERE employee_id=%s AND date=%s LIMIT 1",
            (employee_id, today_str),
        )
        existing = cursor.fetchone()
        if existing:
            return {"ok": True, "already": True, "message": "Already marked today."}

        cursor.execute(
            """
            INSERT INTO attendance (
              id, employee_id, date, checkin_time, status, fine_amount, confidence, source, marked_by_user_id, note
            )
            VALUES (%s, %s, %s, %s, 'Present', %s, 0, 'manual', %s, NULL)
            """,
            (
                str(uuid.uuid4()),
                employee_id,
                today_str,
                checkin_time,
                fine_amount,
                current_user["id"],
            ),
        )

    _audit(
        current_user["email"],
        "attendance_manual_mark",
        {"employeeId": employee_id, "date": today_str, "status": "Present", "lateMinutes": late_minutes, "fineAmount": fine_amount},
    )
    cache_invalidate("attendance:")
    return {
        "ok": True,
        "already": False,
        "date": today_str,
        "status": "Present",
        "checkInTime": checkin_time,
        "fineAmount": fine_amount,
        "lateMinutes": late_minutes,
        "message": "Marked present for today.",
    }


@api.get("/admin/backup/download")
def admin_backup_download(current_user: dict = Depends(require_admin)):
    temp_dir = Path(tempfile.mkdtemp(prefix="ivs_backup_download_"))
    zip_name = _backup_filename("backup")
    zip_path = temp_dir / zip_name

    try:
        _create_backup_zip(zip_path)

        size_bytes = zip_path.stat().st_size if zip_path.exists() else 0
        _audit_safe(current_user["email"], "backup_download", {"file": zip_name, "sizeBytes": size_bytes})

        def file_iterator():
            with zip_path.open("rb") as f:
                while True:
                    chunk = f.read(1024 * 1024)  # 1MB
                    if not chunk:
                        break
                    yield chunk

        return StreamingResponse(
            file_iterator(),
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{zip_name}"',
                "Content-Length": str(size_bytes),
            },
            background=BackgroundTask(lambda: shutil.rmtree(temp_dir, ignore_errors=True)),
        )

    except Exception as exc:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Backup generation failed: {exc}") from exc


@api.post("/admin/backup/restore")
async def admin_backup_restore(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_admin),
):
    filename = str(file.filename or "").strip()
    content_type = (file.content_type or "").lower().strip()
    if not filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip backup files are supported.")
    if content_type and content_type not in BACKUP_ALLOWED_MIME_TYPES and not content_type.endswith("/zip"):
        raise HTTPException(status_code=400, detail="Invalid backup file type.")

    work_dir = Path(tempfile.mkdtemp(prefix="ivs_restore_"))
    uploaded_zip = work_dir / "upload.zip"
    extracted_dir = work_dir / "extract"
    extracted_dir.mkdir(parents=True, exist_ok=True)
    safety_backup = work_dir / _backup_filename("safety_backup")
    steps: list[str] = []
    _audit_safe(current_user["email"], "restore_start", {"file": filename})
    _set_maintenance_mode(True)
    try:
        written = 0
        with uploaded_zip.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > BACKUP_MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail=f"Backup zip exceeds {BACKUP_MAX_UPLOAD_BYTES // (1024 * 1024)}MB limit.")
                out.write(chunk)
        if written == 0:
            raise HTTPException(status_code=400, detail="Uploaded backup file is empty.")
        steps.append("validating_backup_zip")

        sql_path, uploads_path = _safe_extract_backup_zip(uploaded_zip, extracted_dir)
        if not uploads_path.exists() or not uploads_path.is_dir():
            raise HTTPException(status_code=400, detail="Invalid backup zip: uploads folder not found.")

        steps.append("backing_up_current_state")
        _create_backup_zip(safety_backup)

        steps.append("restoring_database")
        _reset_database_schema()
        _import_sql_file(sql_path)

        steps.append("restoring_uploads")
        _replace_uploads(uploads_path, work_dir)

        cache_invalidate("attendance:")
        cache_invalidate("audit_logs:")
        _audit_safe(
            current_user["email"],
            "restore_success",
            {"file": filename, "steps": steps, "safetyBackup": safety_backup.name},
        )
        steps.append("done")
        return {"ok": True, "message": "Restore completed successfully.", "steps": steps}
    except HTTPException as exc:
        old_uploads = work_dir / "old_uploads"
        if old_uploads.exists() and old_uploads.is_dir():
            try:
                if UPLOAD_DIR.exists():
                    shutil.rmtree(UPLOAD_DIR, ignore_errors=True)
                shutil.copytree(old_uploads, UPLOAD_DIR, dirs_exist_ok=True)
            except Exception:
                pass
        _audit_safe(current_user["email"], "restore_failed", {"file": filename, "steps": steps, "error": exc.detail})
        raise
    except Exception as exc:
        old_uploads = work_dir / "old_uploads"
        if old_uploads.exists() and old_uploads.is_dir():
            try:
                if UPLOAD_DIR.exists():
                    shutil.rmtree(UPLOAD_DIR, ignore_errors=True)
                shutil.copytree(old_uploads, UPLOAD_DIR, dirs_exist_ok=True)
            except Exception:
                pass
        _audit_safe(current_user["email"], "restore_failed", {"file": filename, "steps": steps, "error": str(exc)})
        raise HTTPException(status_code=500, detail=f"Restore failed: {exc}") from exc
    finally:
        _set_maintenance_mode(False)
        shutil.rmtree(work_dir, ignore_errors=True)


@api.get("/audit/logs")
def audit_logs(limit: int = 200, _: dict = Depends(require_admin)):
    safe_limit = max(1, min(1000, limit))
    cache_key = f"audit_logs:{safe_limit}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    with get_conn_cursor(dictionary=True) as (_, cursor):
        cursor.execute(
            "SELECT id, ts, actor, action, details FROM audit_logs ORDER BY ts DESC LIMIT %s",
            (safe_limit,),
        )
        rows = cursor.fetchall()
    result = {
        "ok": True,
        "logs": [
            {
                "id": r["id"],
                "ts": r["ts"].isoformat() if r["ts"] else None,
                "actor": r["actor"],
                "action": r["action"],
                "details": r["details"],
            }
            for r in rows
        ],
    }
    cache_set(cache_key, result, ttl_seconds=10)
    return result


@app.get("/api/files/{filename}")
def get_file(filename: str):
    file_path = UPLOAD_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)


app.include_router(api)
