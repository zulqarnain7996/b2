from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field


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
    fine_per_minute_pkr: float = Field(default=1.5, ge=0, le=1000000)
    password: str = Field(min_length=6, max_length=255)
    resetPassword: bool = False
    imageBase64: str = Field(min_length=32)


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
    fine_per_minute_pkr: Optional[float] = Field(default=None, ge=0, le=1000000)
    is_active: Optional[bool] = None
    imageBase64: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    oldPassword: str = Field(min_length=6, max_length=255)
    newPassword: str = Field(min_length=6, max_length=255)


class LinkEmployeeRequest(BaseModel):
    employeeId: int = Field(ge=1)


class UpdateUserRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    role: Literal["admin", "user"]
    employee_id: Optional[int] = Field(default=None, ge=1)
    password: Optional[str] = Field(default=None, min_length=6, max_length=255)


class MarkMonthlyAttendanceRequest(BaseModel):
    date: str = Field(min_length=10, max_length=10)
    status: str = Field(min_length=4, max_length=16)
    note: Optional[str] = Field(default=None, max_length=255)
    overrideFace: bool = False


class NoticeCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1)
    priority: Literal["normal", "important", "urgent"] = "normal"
    is_active: bool = True
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class NoticeUpdateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1)
    priority: Literal["normal", "important", "urgent"] = "normal"
    is_active: bool = True
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class AppSettingsUpdateRequest(BaseModel):
    shift_start_time: str = Field(min_length=4, max_length=8)
    grace_period_mins: int = Field(ge=0, le=720)
    fine_per_minute_pkr: float = Field(ge=0, le=1000000)
