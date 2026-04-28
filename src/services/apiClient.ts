import type {
  AdminAttendanceResponse,
  AdminAttendanceSummary,
  AdminDashboardSummaryResponse,
  AdminAttendanceEmployeeReport,
  AdminEmployeeDetail,
  AdminAttendanceItem,
  AdminNotice,
  AppSettings,
  AttendanceRecord,
  AuditLog,
  Department,
  AuthUser,
  Employee,
  MonthlyAttendanceCalendarDay,
  MonthlyAttendanceDay,
  Notice,
  NoticeAudience,
  NoticePriority,
  PermissionAssignment,
  PermissionKey,
  SystemUser,
  MyHistoryResponse,
} from "../types";

function normalizePermissionAssignmentsPayload(assignments?: PermissionAssignment[]): PermissionAssignment[] {
  if (!Array.isArray(assignments)) return [];
  const seen = new Set<string>();
  const normalized: PermissionAssignment[] = [];

  assignments.forEach((assignment) => {
    const key = String(assignment?.key || "").trim() as PermissionKey;
    if (!key || seen.has(key)) return;
    seen.add(key);
    normalized.push({
      key,
      allowed_departments: Array.from(
        new Set(
          Array.isArray(assignment?.allowed_departments)
            ? assignment.allowed_departments.map((item) => String(item || "").trim()).filter(Boolean)
            : [],
        ),
      ),
    });
  });

  return normalized;
}

function formatApiErrorDetail(detail: unknown): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          const record = item as { loc?: unknown[]; msg?: unknown; type?: unknown };
          const loc = Array.isArray(record.loc)
            ? record.loc
                .map((part) => (typeof part === "string" || typeof part === "number" ? String(part) : ""))
                .filter(Boolean)
                .join(".")
            : "";
          const msg = typeof record.msg === "string" ? record.msg.trim() : "";
          if (loc && msg) return `${loc}: ${msg}`;
          if (msg) return msg;
          try {
            return JSON.stringify(item);
          } catch {
            return "";
          }
        }
        return "";
      })
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  if (detail && typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim()) return record.message.trim();
    if (typeof record.error === "string" && record.error.trim()) return record.error.trim();
    try {
      return JSON.stringify(detail);
    } catch {
      return "Request failed";
    }
  }
  return "Request failed";
}

function resolveApiBase(): string {
  const fromEnv = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || "").trim();
  if (fromEnv) {
    if (fromEnv.startsWith("/")) {
      return fromEnv.endsWith("/api") ? fromEnv : `${fromEnv.replace(/\/+$/, "")}/api`;
    }
    const cleaned = fromEnv.replace(/\/+$/, "");
    return cleaned.endsWith("/api") ? cleaned : `${cleaned}/api`;
  }

  return "/api";
}

const API_BASE = resolveApiBase();
const SERVER_ORIGIN = /^https?:\/\//i.test(API_BASE) ? API_BASE.replace(/\/api\/?$/, "") : "";
const AUTH_TOKEN_STORAGE_KEY = "ivs_access_token";
let accessToken: string | null = null;

function normalizeOffDaysPayload(payload: {
  off_days?: string[];
  offDays?: string[];
  off_days_json?: string[] | string;
}) {
  const source = payload.off_days ?? payload.offDays ?? payload.off_days_json;
  if (Array.isArray(source)) {
    return source.map((day) => String(day).trim().toLowerCase()).filter(Boolean);
  }
  if (typeof source === "string") {
    try {
      const parsed = JSON.parse(source);
      if (Array.isArray(parsed)) {
        return parsed.map((day) => String(day).trim().toLowerCase()).filter(Boolean);
      }
    } catch {
      return source.split(",").map((day) => day.trim().toLowerCase()).filter(Boolean);
    }
  }
  return undefined;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  const token = String(raw || "").trim();
  return token || null;
}

export function persistAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormDataBody = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormDataBody ? {} : { "Content-Type": "application/json" }),
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers,
    ...init,
  });

  const raw = await response.text();
  let data: any = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    const detailMessage = formatApiErrorDetail(data?.detail);
    if (import.meta.env.DEV) {
      console.error("[apiClient.request] error", {
        path,
        status: response.status,
        detail: data?.detail ?? null,
        raw,
      });
    }
    if (response.status === 401 && path === "/auth/me") {
      setAccessToken(null);
      persistAccessToken(null);
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }
    throw new Error(detailMessage);
  }
  return data as T;
}

async function requestWithFallback<T>(paths: string[], init?: RequestInit): Promise<T> {
  let lastError: unknown = null;
  for (let index = 0; index < paths.length; index += 1) {
    try {
      return await request<T>(paths[index], init);
    } catch (error) {
      lastError = error;
      if (index === paths.length - 1) {
        throw error;
      }
      const message = error instanceof Error ? error.message : "";
      const canFallback =
        message === "Method Not Allowed" ||
        message === "Not Found" ||
        message === "Request failed";
      if (!canFallback) {
        throw error;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed");
}

export function toFileUrl(path?: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/")) {
    return SERVER_ORIGIN ? `${SERVER_ORIGIN}${path}` : path;
  }
  return SERVER_ORIGIN ? `${SERVER_ORIGIN}/${path}` : `/${path}`;
}

export const apiClient = {
  login: (payload: { email: string; password: string }) =>
    request<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  logout: () =>
    request<{ ok: boolean }>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
    }),

  getMe: () => request<{ user: AuthUser }>("/auth/me"),

  getDepartments: (params?: { admin?: boolean; includeInactive?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.includeInactive) {
      query.set("include_inactive", "true");
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const path = params?.admin ? `/admin/departments${suffix}` : `/departments${suffix}`;
    return request<{ ok: boolean; departments: Department[] }>(path);
  },

  createDepartment: (payload: { name: string; is_active?: boolean }) =>
    request<{ ok: boolean; department: Department }>("/admin/departments", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateDepartment: (id: number, payload: { name: string; is_active: boolean }) =>
    request<{ ok: boolean; department: Department }>(`/admin/departments/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteDepartment: (id: number) =>
    request<{ ok: boolean }>(`/admin/departments/${id}`, {
      method: "DELETE",
    }),

  getServerTime: () =>
    request<{ ok: boolean; iso: string; timezone: string }>("/time"),

  getUsers: () => request<{ ok: boolean; users: SystemUser[] }>("/users"),

  deleteUser: (id: number) =>
    request<{ ok: boolean; deletedIds: number[]; skippedIds: number[]; message: string }>(`/users/${id}`, {
      method: "DELETE",
    }),

  bulkDeleteUsers: (ids: number[]) =>
    request<{ ok: boolean; deletedIds: number[]; skippedIds: number[]; message: string }>("/users/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ userIds: ids }),
    }),

  enrollEmployee: (payload: {
    employeeId?: string | null;
    name: string;
    email: string;
    department: string;
    role: string;
    shift_start_time: string;
    grace_period_mins: number;
    late_fine_pkr: number;
    absent_fine_pkr: number;
    not_marked_fine_pkr: number;
    off_days: string[];
    offDays?: string[];
    off_days_json?: string[] | string;
    password: string;
    resetPassword?: boolean;
    imageBase64: string;
  }) =>
    request<{ ok: boolean; employee: Employee; photoUrl: string }>("/employees/enroll", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        off_days: normalizeOffDaysPayload(payload) ?? [],
      }),
    }),

  updateUser: (
    id: number,
    payload: {
      name: string;
      email: string;
      role: "admin" | "user";
      employee_id: number | null;
      permissions: PermissionAssignment[];
      password?: string;
    },
  ) =>
    request<{ ok: boolean; user: SystemUser }>(`/users/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        ...payload,
        permissions: normalizePermissionAssignmentsPayload(payload.permissions),
      }),
    }),

  changePassword: (payload: { oldPassword: string; newPassword: string }) =>
    request<{ ok: boolean }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateEmployee: (
    id: string,
    payload: {
      name?: string;
      email?: string;
      department?: string;
      role?: string;
      shift_start_time?: string | null;
      grace_period_mins?: number;
      late_fine_pkr?: number;
      absent_fine_pkr?: number;
      not_marked_fine_pkr?: number;
      off_days?: string[];
      offDays?: string[];
      off_days_json?: string[] | string;
      is_active?: boolean;
      imageBase64?: string;
    },
  ) =>
    request<{ ok: boolean; photoUrl?: string }>(`/employees/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        ...payload,
        off_days: normalizeOffDaysPayload(payload),
      }),
    }),

  getEmployees: () => request<{ ok: boolean; employees: Employee[] }>("/employees"),

  getAccessibleEmployees: (permissionKey: PermissionKey) =>
    request<{ ok: boolean; employees: Employee[] }>(
      `/employees/accessible?permission_key=${encodeURIComponent(permissionKey)}`,
    ),

  getEmployeeDetail: (id: string) =>
    requestWithFallback<AdminEmployeeDetail>([
      `/admin/employees/${encodeURIComponent(id)}`,
      `/employees/${encodeURIComponent(id)}`,
    ]),

  resetEmployeePassword: (
    id: string,
    payload: { temporaryPassword?: string; forcePasswordChange: boolean },
  ) =>
    requestWithFallback<{ ok: boolean; message: string; temporaryPassword: string; forcePasswordChange: boolean }>(
      [
        `/admin/employees/${encodeURIComponent(id)}/reset-password`,
        `/employees/${encodeURIComponent(id)}/reset-password`,
      ],
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  deleteEmployee: (id: string) =>
    request<{ ok: boolean; deletedIds: string[]; message: string }>(`/employees/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  bulkDeleteEmployees: (ids: number[]) =>
    request<{ ok: boolean; deletedIds: number[]; message: string }>("/employees/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

  checkIn: (payload: { employeeId: string; imageBase64: string }) =>
    request<{
      ok: boolean;
      already: boolean;
      status: string;
      fineAmount: number;
      lateMinutes?: number;
      checkInTime: string | null;
      confidence: number;
      message: string;
    }>("/attendance/checkin", { method: "POST", body: JSON.stringify(payload) }),

  checkInMe: (imageBase64: string) =>
    request<{
      ok: boolean;
      already: boolean;
      status: string;
      fineAmount: number;
      lateMinutes?: number;
      checkInTime: string | null;
      confidence: number;
      message: string;
    }>("/attendance/checkin/me", { method: "POST", body: JSON.stringify({ imageBase64 }) }),

  checkinStart: (payload?: { employee_id?: number; device_info?: string }) =>
    request<{
      ok: boolean;
      session_id: string;
      challenge_type: "blink" | "turn_head_left" | "turn_head_right";
      instruction: string;
      expires_in_sec: number;
    }>("/checkin/start", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    }),

  checkinFrame: (payload: { session_id: string; imageBase64: string; timestamp?: number }) =>
    request<{
      ok: boolean;
      state: "aligning" | "challenge" | "verified" | "retry" | "failed";
      ready_for_challenge?: boolean;
      verified: boolean;
      reason?: string;
      guidance_text: string;
      challenge_type: "blink" | "turn_head_left" | "turn_head_right";
      instruction: string;
      retries_left: number;
      hold_ms?: number;
      matched_employee_id?: number;
      confidence?: number;
    }>("/checkin/frame", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  checkinComplete: (payload: { session_id: string }) =>
    request<{
      ok: boolean;
      already: boolean;
      attendance: {
        id: string;
        employee_id: number;
        date: string;
        checkin_time: string | null;
        status: string;
        late_minutes: number;
        fine_amount: number;
        confidence: number;
        source: "face" | "manual";
        note?: string | null;
      };
    }>("/checkin/complete", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getTodayAttendance: () => request<{ ok: boolean; records: AttendanceRecord[] }>("/attendance/today"),
  getMyTodayAttendance: () => request<{ ok: boolean; record: AttendanceRecord | null }>("/attendance/today/me"),

  getHistory: (employeeId: string) => request<MyHistoryResponse>(`/attendance/history/${employeeId}`),
  getMyHistory: () => request<MyHistoryResponse>("/attendance/history/me"),
  getMyMonthAttendance: (month: string) =>
    request<{ ok: boolean; month: string; days: MonthlyAttendanceDay[] }>(
      `/attendance/month/me?month=${encodeURIComponent(month)}`,
    ),
  getAttendanceMonth: (year: number, month: number, employeeId?: string) => {
    const query = new URLSearchParams({
      year: String(year),
      month: String(month),
    });
    if (employeeId) {
      query.set("employee_id", employeeId);
    }
    if (import.meta.env.DEV) {
      console.debug("[apiClient.getAttendanceMonth]", {
        year,
        month,
        employeeId: employeeId || null,
        url: `/attendance/month?${query.toString()}`,
      });
    }
    return request<{ ok: boolean; year: number; month: number; month_days: MonthlyAttendanceCalendarDay[] }>(
      `/attendance/month?${query.toString()}`,
    );
  },
  getMyAttendanceMonth: (year: number, month: number) =>
    apiClient.getAttendanceMonth(year, month),
  markAttendanceManualSelfie: (file: File, options?: { device_info?: string }) => {
    const formData = new FormData();
    formData.append("file", file);
    if (options?.device_info) {
      formData.append("device_info", options.device_info);
    }
    return request<{
      ok: boolean;
      attendance: {
        id: string;
        employee_id: string;
        date: string;
        checkin_time: string;
        status: string;
        late_minutes?: number;
        fine_amount: number;
        confidence: number;
        source: "manual" | "face";
        evidence_photo_url: string | null;
        device_info?: string | null;
        device_ip?: string | null;
        created_at: string | null;
      };
    }>("/attendance/manual-selfie", {
      method: "POST",
      body: formData,
    });
  },
  adminAdjustMonthlyAttendance: (
    file: File,
    payload: {
      employee_id: string;
      date: string;
      checkin_time: string;
      note?: string;
      device_info?: string;
    },
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("employee_id", payload.employee_id);
    formData.append("date", payload.date);
    formData.append("checkin_time", payload.checkin_time);
    if (payload.note) {
      formData.append("note", payload.note);
    }
    if (payload.device_info) {
      formData.append("device_info", payload.device_info);
    }
    return request<{
      ok: boolean;
      attendance: {
        id: string;
        employee_id: string;
        date: string;
        checkin_time: string | null;
        status: string;
        late_minutes?: number;
        fine_amount: number;
        confidence: number;
        source: "manual" | "face";
        evidence_photo_url: string | null;
        note?: string | null;
        created_at: string | null;
      };
    }>("/admin/attendance/monthly-adjustment", {
      method: "POST",
      body: formData,
    });
  },
  adminMarkMonthlyLeave: (payload: { employee_id: string; date: string; note: string }) =>
    request<{
      ok: boolean;
      attendance: {
        id: string;
        employee_id: string;
        date: string;
        checkin_time: string | null;
        status: string;
        late_minutes?: number;
        fine_amount: number;
        confidence: number;
        source: "manual" | "face";
        evidence_photo_url: string | null;
        note?: string | null;
        created_at: string | null;
      };
    }>("/admin/attendance/monthly-leave", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  markMyMonthAttendance: (payload: {
    date: string;
    status: "Present" | "Late";
    note?: string;
    overrideFace?: boolean;
  }) =>
    request<{ ok: boolean; date: string; status: string; checkInTime: string }>("/attendance/month/me/mark", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  markAttendanceManualToday: () =>
    request<{ ok: boolean; already: boolean; message: string; checkInTime?: string; fineAmount?: number; lateMinutes?: number }>("/attendance/manual-today", {
      method: "POST",
      body: JSON.stringify({}),
    }),

  getAdminAttendance: (params?: {
    from?: string;
    to?: string;
    employee_id?: string;
    department?: string;
    q?: string;
    source?: "face" | "manual" | "all";
    lateness?: "late" | "on_time" | "all";
    status?: "present" | "absent" | "all";
    sort?: "recent" | "fine_desc";
    page?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.employee_id) query.set("employee_id", params.employee_id);
    if (params?.department) query.set("department", params.department);
    if (params?.q) query.set("q", params.q);
    if (params?.source && params.source !== "all") query.set("source", params.source);
    if (params?.lateness && params.lateness !== "all") query.set("lateness", params.lateness);
    if (params?.status && params.status !== "all") query.set("status", params.status);
    if (params?.sort && params.sort !== "recent") query.set("sort", params.sort);
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<AdminAttendanceResponse>(
      `/admin/attendance${suffix}`,
    );
  },

  getAdminDashboardSummary: () =>
    request<AdminDashboardSummaryResponse>("/admin/dashboard/summary"),

  getAdminAttendanceEmployeeReport: (employeeId: string) =>
    request<AdminAttendanceEmployeeReport>(`/admin/attendance/employee/${encodeURIComponent(employeeId)}`),

  updateAdminAttendance: (
    id: string,
    payload: {
      status: "Present" | "Late" | "Absent" | "Leave";
      checkin_time: string | null;
      source: "face" | "manual";
      note?: string;
    },
  ) =>
    request<{ ok: boolean; item: AdminAttendanceItem }>(`/admin/attendance/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  getLogs: () => request<{ ok: boolean; logs: AuditLog[] }>("/audit/logs"),

  getNotices: () => request<{ ok: boolean; notices: Notice[] }>("/notices"),

  getAdminNotices: () => request<{ ok: boolean; notices: AdminNotice[] }>("/admin/notices"),

  createAdminNotice: (payload: {
      title: string;
      body: string;
      priority: NoticePriority;
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
    starts_at: string | null;
    ends_at: string | null;
  }) =>
    request<{ ok: boolean; notice: AdminNotice }>("/admin/notices", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateAdminNotice: (
    id: number,
      payload: {
        title: string;
        body: string;
        priority: NoticePriority;
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
      starts_at: string | null;
      ends_at: string | null;
    },
  ) =>
    request<{ ok: boolean; notice: AdminNotice }>(`/admin/notices/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteAdminNotice: (id: number) =>
    request<{ ok: boolean }>(`/admin/notices/${id}`, {
      method: "DELETE",
    }),

  getLoginNotices: (trigger: "login" | "refresh") =>
    request<{ ok: boolean; notices: Notice[] }>(`/notices/login-pending?trigger=${trigger}`),

  markNoticeSeen: (id: number) =>
    request<{ ok: boolean }>(`/notices/${id}/seen`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  dismissNotice: (id: number) =>
    request<{ ok: boolean }>(`/notices/${id}/dismiss`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  acknowledgeNotice: (id: number) =>
    request<{ ok: boolean }>(`/notices/${id}/acknowledge`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  downloadBackup: async () => {
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const response = await fetch(`${API_BASE}/admin/backup/download`, { method: "GET", headers, credentials: "include" });
    if (!response.ok) {
      const raw = await response.text();
      let detail = "Backup download failed";
      try {
        detail = JSON.parse(raw)?.detail || detail;
      } catch {
        // ignore
      }
      throw new Error(detail);
    }
    const blob = await response.blob();
    const cd = response.headers.get("content-disposition") || "";
    const match = cd.match(/filename=\"?([^"]+)\"?/i);
    const filename = match?.[1] || `backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.zip`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { ok: true, filename };
  },

  restoreBackup: (file: File, onProgress?: (percent: number) => void) =>
    new Promise<{ ok: boolean; message: string; steps: string[] }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}/admin/backup/restore`);
      xhr.withCredentials = true;
      if (accessToken) xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
      xhr.responseType = "json";
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || !onProgress) return;
        onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onerror = () => reject(new Error("Restore upload failed"));
      xhr.onload = () => {
        const payload = (xhr.response || {}) as any;
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(payload);
        } else {
          reject(new Error(payload?.detail || "Restore failed"));
        }
      };
      const formData = new FormData();
      formData.append("file", file);
      xhr.send(formData);
    }),

  getAdminSettings: () => request<{ ok: boolean; settings: AppSettings }>("/admin/settings"),

  updateAdminSettings: (payload: {
    shift_start_time: string;
    grace_period_mins: number;
    late_fine_pkr: number;
    absent_fine_pkr: number;
    not_marked_fine_pkr: number;
  }) =>
    request<{ ok: boolean; settings: AppSettings }>("/admin/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  startFaceChallenge: (context: "enroll" | "checkin") =>
    request<{
      ok: boolean;
      challenge_token: string;
      challenge_type: "blink" | "turn_left" | "turn_right" | "smile";
      expires_in_sec: number;
      allow_single_frame_fallback: boolean;
    }>("/face/challenge", {
      method: "POST",
      body: JSON.stringify({ context }),
    }),

  verifyFaceBurst: (payload: {
    challenge_token: string;
    context: "enroll" | "checkin";
    frames: string[];
  }) =>
    request<{
      ok: boolean;
      verified: boolean;
      fallback: boolean;
      warning?: string;
    }>("/face/verify-burst", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  validateFaceScan: (imageBase64: string) =>
    request<{
      ok: boolean;
      reason: "no_face" | "multiple_faces" | "too_dark" | "too_blurry" | "face_too_small" | "ok" | null;
      bbox: [number, number, number, number] | null;
      confidence: number | null;
    }>("/scan/validate-face", {
      method: "POST",
      body: JSON.stringify({ imageBase64 }),
    }),

  scanFrame: (payload: { imageBase64: string; context: "checkin" | "enroll"; scan_token?: string }) =>
    request<{
      ok: boolean;
      scan_token: string | null;
      direction: "center" | "left" | "right" | "up" | "down" | "complete";
      progress: number;
      guidanceText: string;
      reason: "no_face" | "multiple_faces" | "too_dark" | "too_blurry" | "face_too_small" | "ok" | null;
      canCapture: boolean;
    }>("/scan/frame", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
