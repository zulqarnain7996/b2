export type Employee = {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  shiftStartTime?: string | null;
  gracePeriodMins?: number | null;
  finePerMinutePkr?: number | null;
  isActive: boolean;
  photoUrl?: string;
  createdAt?: string;
};

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user";
  employeeId?: string | null;
  createdAt?: string | null;
};

export type SystemUser = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user";
  employeeId?: string | null;
  createdAt?: string | null;
};

export type AttendanceRecord = {
  id: string;
  employeeId: string;
  name?: string;
  department?: string;
  role?: string;
  photoUrl?: string;
  date: string;
  checkInTime: string;
  status: string;
  lateMinutes?: number;
  source?: "face" | "manual" | null;
  note?: string | null;
  evidencePhotoUrl?: string | null;
  fineAmount: number;
  confidence: number;
  createdAt?: string;
};

export type MyHistoryResponse = {
  ok: boolean;
  employee?: Employee | null;
  records: AttendanceRecord[];
};

export type MonthlyAttendanceDay = {
  date: string;
  status: "Present" | "Late";
  checkInTime: string | null;
  lateMinutes?: number;
  source: "face" | "manual" | null;
  evidencePhotoUrl?: string | null;
  confidence: number;
  fineAmount: number;
};

export type MonthlyAttendanceCalendarDay = {
  date: string;
  weekday: string;
  status: "present" | "absent" | "not_marked";
  checkin_time: string | null;
  late_minutes?: number;
  fine_amount: number;
  source: "face" | "manual" | null;
  evidence_photo_url: string | null;
};

export type AuditLog = {
  id: number;
  ts: string;
  actor: string;
  action: string;
  details: string;
};

export type NoticePriority = "normal" | "important" | "urgent";

export type Notice = {
  id: number;
  title: string;
  body: string;
  priority: NoticePriority;
  created_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

export type AdminNotice = Notice & {
  is_active: boolean;
  updated_at: string | null;
  created_by_user_id?: number | null;
};

export type AdminAttendanceItem = {
  id: string;
  employee_id: string;
  date: string;
  checkin_time: string | null;
  status: string;
  late_minutes?: number;
  fine_amount: number;
  confidence: number;
  source: "face" | "manual" | null;
  evidence_photo_url?: string | null;
  note: string | null;
  created_at: string | null;
  employee: {
    id: string;
    name: string;
    email: string;
    department: string;
    role: string;
    is_active: boolean;
    photo_url?: string | null;
  };
};

export type AdminAttendanceEmployeeReport = {
  employee: {
    id: string;
    name: string;
    email: string;
    department: string;
    role: string;
    is_active: boolean;
    photo_url?: string | null;
  };
  summary: {
    present_days: number;
    late_days: number;
    total_fine: number;
    last_checkin: string | null;
  };
  history: Array<{
    id: string;
    employee_id: string;
    date: string;
    checkin_time: string | null;
    status: string;
    late_minutes?: number;
    fine_amount: number;
    confidence: number;
    source: "face" | "manual" | null;
    evidence_photo_url?: string | null;
    note: string | null;
    created_at: string | null;
  }>;
};

export type AppSettings = {
  shift_start_time: string;
  grace_period_mins: number;
  fine_per_minute_pkr: number;
  updated_at: string | null;
};
