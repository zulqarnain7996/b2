export type PermissionKey =
  | "can_view_all_attendance"
  | "can_view_monthly_attendance"
  | "can_manage_notices"
  | "can_view_audit_logs"
  | "can_manage_employees"
  | "can_manage_users"
  | "can_backup_restore";

export type PermissionAssignment = {
  key: PermissionKey;
  allowed_departments: string[];
};

export type Employee = {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  shiftStartTime?: string | null;
  gracePeriodMins?: number | null;
  lateFinePkr?: number | null;
  absentFinePkr?: number | null;
  notMarkedFinePkr?: number | null;
  offDays?: string[];
  isActive: boolean;
  photoUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  userId?: number | null;
  userRole?: string | null;
  userCreatedAt?: string | null;
  forcePasswordChange?: boolean;
  faceEmbeddingsCount?: number;
};

export type Department = {
  id: number;
  name: string;
  is_active: boolean;
  employee_count: number;
  notice_count: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user";
  employeeId?: string | null;
  department?: string | null;
  permissions?: PermissionAssignment[];
  photoUrl?: string | null;
  forcePasswordChange?: boolean;
  createdAt?: string | null;
};

export type SystemUser = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user";
  employeeId?: string | null;
  department?: string | null;
  permissions?: PermissionAssignment[];
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
  deviceInfo?: string | null;
  deviceIp?: string | null;
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
  status: "Present" | "Late" | "Absent" | "Leave" | "Not Marked" | "Off" | "Pre-Join";
  checkInTime: string | null;
  lateMinutes?: number;
  source: "face" | "manual" | null;
  evidencePhotoUrl?: string | null;
  confidence: number;
  fineAmount: number;
  note?: string | null;
};

export type MonthlyAttendanceCalendarDay = {
  date: string;
  weekday: string;
  status: "present" | "absent" | "leave" | "not_marked" | "off" | "pre_join";
  checkin_time: string | null;
  late_minutes?: number;
  fine_amount: number;
  source: "face" | "manual" | null;
  evidence_photo_url: string | null;
  note?: string | null;
};

export type AuditLog = {
  id: number;
  ts: string;
  actor: string;
  action: string;
  details: string;
};

export type NoticePriority = "normal" | "important" | "urgent";
export type NoticeAudience = "all" | "admins_only" | "users_only";

export type Notice = {
  id: number;
  title: string;
  body: string;
  priority: NoticePriority;
  is_active?: boolean;
  is_sticky?: boolean;
  show_on_login?: boolean;
  show_on_refresh?: boolean;
  repeat_every_login?: boolean;
  is_dismissible?: boolean;
  requires_acknowledgement?: boolean;
  target_audience?: NoticeAudience;
  target_department?: string | null;
  target_role?: string | null;
  created_by_user_id?: number | null;
  created_by_name?: string | null;
  closed_at?: string | null;
  closed_by_user_id?: number | null;
  created_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

export type AdminNotice = Notice & {
  is_active: boolean;
  is_sticky: boolean;
  show_on_login: boolean;
  show_on_refresh: boolean;
  repeat_every_login: boolean;
  is_dismissible: boolean;
  requires_acknowledgement: boolean;
  target_audience: NoticeAudience;
  target_department: string | null;
  target_role: string | null;
  updated_at: string | null;
  created_by_user_id?: number | null;
  created_by_name?: string | null;
  closed_at?: string | null;
  closed_by_user_id?: number | null;
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

export type AdminAttendanceSummary = {
  records: number;
  present: number;
  late: number;
  absent: number;
  totalFine: number;
};

export type AdminAttendanceResponse = {
  items: AdminAttendanceItem[];
  total: number;
  page: number;
  limit: number;
  summary: AdminAttendanceSummary;
};

export type AdminDashboardSummaryResponse = {
  ok: boolean;
  summary: {
    totalEmployees: number;
    activeEmployees: number;
    presentToday: number;
    lateToday: number;
    absentToday: number;
    presentRatePct: number;
    monthFineTotal: number;
  };
  weeklyAttendance: {
    labels: string[];
    values: number[];
  };
  departmentStats: Array<{
    name: string;
    rate: number;
  }>;
  topLatecomers: Array<{
    employeeId: string;
    name: string;
    checkInTime: string | null;
  }>;
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
  late_fine_pkr: number;
  absent_fine_pkr: number;
  not_marked_fine_pkr: number;
  updated_at: string | null;
};

export type AdminEmployeeDetail = {
  ok: boolean;
  employee: Employee;
  attendanceSummary: {
    totalRecords: number;
    presentDays: number;
    lateDays: number;
    totalFine: number;
    lastCheckin: string | null;
  };
  recentAttendance: Array<{
    id: string;
    date: string;
    checkInTime: string | null;
    status: string;
    fineAmount: number;
    confidence: number;
    source: "face" | "manual" | null;
    createdAt: string | null;
  }>;
};
