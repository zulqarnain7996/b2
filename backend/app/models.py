from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

import json

from pydantic import AliasChoices, BaseModel, EmailStr, Field, field_validator

WEEKDAY_VALUES = ("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday")
PERMISSION_KEYS = (
    "can_view_all_attendance",
    "can_view_monthly_attendance",
    "can_manage_notices",
    "can_view_audit_logs",
    "can_manage_employees",
    "can_manage_users",
    "can_backup_restore",
)
SCOPED_PERMISSION_KEYS = ("can_view_all_attendance", "can_view_monthly_attendance")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=255)

class BulkDeleteUsersRequest(BaseModel):
    userIds: list[int] = Field(default_factory=list)

class BulkDeleteEmployeesRequest(BaseModel):
    ids: list[int] = Field(default_factory=list)


class EnrollEmployeeRequest(BaseModel):
    employeeId: Optional[int] = Field(default=None, ge=1)
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    department: str = Field(min_length=1, max_length=255)
    role: str = Field(min_length=1, max_length=255)
    shift_start_time: str = Field(default="09:00", min_length=4, max_length=8)
    grace_period_mins: int = Field(default=15, ge=0, le=720)
    late_fine_pkr: float = Field(default=0, ge=0, le=1000000)
    absent_fine_pkr: float = Field(default=0, ge=0, le=1000000)
    not_marked_fine_pkr: float = Field(default=0, ge=0, le=1000000)
    off_days: list[Literal["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]] = Field(
        default_factory=list,
        validation_alias=AliasChoices("off_days", "offDays", "off_days_json"),
    )
    password: str = Field(min_length=6, max_length=255)
    resetPassword: bool = False
    imageBase64: str = Field(min_length=32)

    @field_validator("off_days", mode="before")
    @classmethod
    def normalize_off_days_aliases(cls, value):
        if value is None:
            return value
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return []
            try:
                value = json.loads(raw)
            except json.JSONDecodeError:
                value = [part.strip() for part in raw.split(",") if part.strip()]
        if isinstance(value, (tuple, set)):
            value = list(value)
        if isinstance(value, list):
            return [str(day).strip().lower() for day in value if str(day).strip()]
        return value


class CheckInRequest(BaseModel):
    employeeId: str = Field(min_length=1, max_length=64)
    imageBase64: str = Field(min_length=32)

class CheckInMeRequest(BaseModel):
    imageBase64: str = Field(min_length=32)

class CheckinStartRequest(BaseModel):
    employee_id: Optional[int] = Field(default=None, ge=1)
    device_info: Optional[str] = Field(default=None, max_length=255)

class CheckinFrameRequest(BaseModel):
    session_id: str = Field(min_length=8, max_length=64)
    imageBase64: str = Field(min_length=32)
    timestamp: Optional[int] = None

class CheckinCompleteRequest(BaseModel):
    session_id: str = Field(min_length=8, max_length=64)


class UpdateEmployeeRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=255)
    email: Optional[EmailStr] = None
    department: Optional[str] = Field(default=None, max_length=255)
    role: Optional[str] = Field(default=None, max_length=255)
    shift_start_time: Optional[str] = Field(default=None, max_length=8)
    grace_period_mins: Optional[int] = Field(default=None, ge=0, le=720)
    late_fine_pkr: Optional[float] = Field(default=None, ge=0, le=1000000)
    absent_fine_pkr: Optional[float] = Field(default=None, ge=0, le=1000000)
    not_marked_fine_pkr: Optional[float] = Field(default=None, ge=0, le=1000000)
    off_days: Optional[list[Literal["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]]] = Field(
        default=None,
        validation_alias=AliasChoices("off_days", "offDays", "off_days_json"),
    )
    is_active: Optional[bool] = None
    imageBase64: Optional[str] = None

    @field_validator("off_days", mode="before")
    @classmethod
    def normalize_off_days_aliases(cls, value):
        if value is None:
            return value
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return []
            try:
                value = json.loads(raw)
            except json.JSONDecodeError:
                value = [part.strip() for part in raw.split(",") if part.strip()]
        if isinstance(value, (tuple, set)):
            value = list(value)
        if isinstance(value, list):
            return [str(day).strip().lower() for day in value if str(day).strip()]
        return value


class ChangePasswordRequest(BaseModel):
    oldPassword: str = Field(min_length=6, max_length=255)
    newPassword: str = Field(min_length=6, max_length=255)


class AdminResetEmployeePasswordRequest(BaseModel):
    temporaryPassword: Optional[str] = Field(default=None, min_length=6, max_length=255)
    forcePasswordChange: bool = True


class LinkEmployeeRequest(BaseModel):
    employeeId: int = Field(ge=1)


class UpdateUserRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    role: Literal["admin", "user"]
    employee_id: Optional[int] = Field(default=None, ge=1, validation_alias=AliasChoices("employee_id", "employeeId"))
    password: Optional[str] = Field(default=None, min_length=6, max_length=255)
    permissions: list["PermissionAssignmentRequest"] = Field(default_factory=list)


class PermissionAssignmentRequest(BaseModel):
    key: Literal[
        "can_view_all_attendance",
        "can_view_monthly_attendance",
        "can_manage_notices",
        "can_view_audit_logs",
        "can_manage_employees",
        "can_manage_users",
        "can_backup_restore",
    ]
    allowed_departments: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("allowed_departments", "allowedDepartments"),
    )

    @field_validator("allowed_departments", mode="before")
    @classmethod
    def normalize_allowed_departments(cls, value):
        if value is None:
            return []
        if isinstance(value, (tuple, set)):
            value = list(value)
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        return value


class MarkMonthlyAttendanceRequest(BaseModel):
    date: str = Field(min_length=10, max_length=10)
    status: str = Field(min_length=4, max_length=16)
    note: Optional[str] = Field(default=None, max_length=255)
    overrideFace: bool = False


class UpdateAttendanceRequest(BaseModel):
    status: Literal["Present", "Late", "Absent", "Leave"]
    checkin_time: Optional[str] = Field(default=None, max_length=5)
    source: Literal["face", "manual"] = "manual"
    note: Optional[str] = Field(default=None, max_length=255)


class AdminMonthlyLeaveRequest(BaseModel):
    employee_id: str = Field(min_length=1, max_length=64)
    date: str = Field(min_length=10, max_length=10)
    note: str = Field(min_length=1, max_length=255)


class DepartmentCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    is_active: bool = True


class DepartmentUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    is_active: bool = True


class NoticeCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1)
    priority: Literal["normal", "important", "urgent"] = "normal"
    is_active: bool = True
    is_sticky: bool = False
    show_on_login: bool = False
    show_on_refresh: bool = False
    repeat_every_login: bool = False
    is_dismissible: bool = False
    requires_acknowledgement: bool = False
    target_audience: Literal["all", "admins_only", "users_only"] = "all"
    target_department: Optional[str] = Field(default=None, max_length=255)
    target_role: Optional[str] = Field(default=None, max_length=255)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class NoticeUpdateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1)
    priority: Literal["normal", "important", "urgent"] = "normal"
    is_active: bool = True
    is_sticky: bool = False
    show_on_login: bool = False
    show_on_refresh: bool = False
    repeat_every_login: bool = False
    is_dismissible: bool = False
    requires_acknowledgement: bool = False
    target_audience: Literal["all", "admins_only", "users_only"] = "all"
    target_department: Optional[str] = Field(default=None, max_length=255)
    target_role: Optional[str] = Field(default=None, max_length=255)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class AppSettingsUpdateRequest(BaseModel):
    shift_start_time: str = Field(min_length=4, max_length=8)
    grace_period_mins: int = Field(ge=0, le=720)
    late_fine_pkr: float = Field(ge=0, le=1000000)
    absent_fine_pkr: float = Field(ge=0, le=1000000)
    not_marked_fine_pkr: float = Field(ge=0, le=1000000)
