import type {
  AdminAttendanceEmployeeReport,
  AdminAttendanceItem,
  AdminNotice,
  AppSettings,
  AttendanceRecord,
  AuditLog,
  AuthUser,
  Employee,
  MonthlyAttendanceCalendarDay,
  MonthlyAttendanceDay,
  Notice,
  NoticePriority,
  SystemUser,
  MyHistoryResponse,
} from "../types";

function resolveApiBase(): string {
  const fromEnv = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || "").trim();
  if (fromEnv) {
    const cleaned = fromEnv.replace(/\/+$/, "");
    return cleaned.endsWith("/api") ? cleaned : `${cleaned}/api`;
  }

  if (typeof window !== "undefined") {
    const origin =
      window.location.hostname === "localhost"
        ? "http://127.0.0.1:8000"
        : `http://${window.location.hostname}:8000`;
    return `${origin}/api`;
  }

  return "http://127.0.0.1:8000/api";
}

const API_BASE = resolveApiBase();
const SERVER_ORIGIN = API_BASE.replace(/\/api\/?$/, "");
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
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
    if (response.status === 401 && path === "/auth/me") {
      sessionStorage.removeItem("authToken");
      setAccessToken(null);
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }
    throw new Error(data.detail || "Request failed");
  }
  return data as T;
}

export function toFileUrl(path?: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${SERVER_ORIGIN}${path}`;
}

export const apiClient = {
  login: (payload: { email: string; password: string }) =>
    request<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getMe: () => request<{ user: AuthUser }>("/auth/me"),

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
    fine_per_minute_pkr: number;
    password: string;
    resetPassword?: boolean;
    imageBase64: string;
  }) => request<{ ok: boolean; employee: Employee; photoUrl: string }>("/employees/enroll", { method: "POST", body: JSON.stringify(payload) }),

  updateUser: (
    id: number,
    payload: {
      name: string;
      email: string;
      role: "admin" | "user";
      employee_id: number | null;
      password?: string;
    },
  ) =>
    request<{ ok: boolean; user: SystemUser }>(`/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
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
      fine_per_minute_pkr?: number;
      is_active?: boolean;
      imageBase64?: string;
    },
  ) =>
    request<{ ok: boolean; photoUrl?: string }>(`/employees/${id}`, { method: "PUT", body: JSON.stringify(payload) }),

  getEmployees: () => request<{ ok: boolean; employees: Employee[] }>("/employees"),

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

  getHistory: (employeeId: string) => request<MyHistoryResponse>(`/attendance/history/${employeeId}`),
  getMyHistory: () => request<MyHistoryResponse>("/attendance/history/me"),
  getMyMonthAttendance: (month: string) =>
    request<{ ok: boolean; month: string; days: MonthlyAttendanceDay[] }>(
      `/attendance/month/me?month=${encodeURIComponent(month)}`,
    ),
  getMyAttendanceMonth: (year: number, month: number) =>
    request<{ ok: boolean; year: number; month: number; month_days: MonthlyAttendanceCalendarDay[] }>(
      `/attendance/month?year=${encodeURIComponent(String(year))}&month=${encodeURIComponent(String(month))}`,
    ),
  markAttendanceManualSelfie: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
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
        created_at: string | null;
      };
    }>("/attendance/manual-selfie", {
      method: "POST",
      body: formData,
    });
  },
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
    page?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.employee_id) query.set("employee_id", params.employee_id);
    if (params?.department) query.set("department", params.department);
    if (params?.q) query.set("q", params.q);
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<{ items: AdminAttendanceItem[]; total: number; page: number; limit: number }>(
      `/admin/attendance${suffix}`,
    );
  },

  getAdminAttendanceEmployeeReport: (employeeId: string) =>
    request<AdminAttendanceEmployeeReport>(`/admin/attendance/employee/${encodeURIComponent(employeeId)}`),

  getLogs: () => request<{ ok: boolean; logs: AuditLog[] }>("/audit/logs"),

  getNotices: () => request<{ ok: boolean; notices: Notice[] }>("/notices"),

  getAdminNotices: () => request<{ ok: boolean; notices: AdminNotice[] }>("/admin/notices"),

  createAdminNotice: (payload: {
    title: string;
    body: string;
    priority: NoticePriority;
    is_active: boolean;
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

  downloadBackup: async () => {
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const response = await fetch(`${API_BASE}/admin/backup/download`, { method: "GET", headers });
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
    fine_per_minute_pkr: number;
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
