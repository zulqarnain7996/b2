import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  Search,
  Wallet,
  X,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useToast } from "@/components/feedback/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CardSkeleton } from "@/components/ui/CardSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useDepartments } from "@/hooks/useDepartments";
import { apiClient, toFileUrl } from "@/services/apiClient";
import { localYmd, sameLocalDay, startOfMonthLocal } from "@/utils/date";
import type { Employee, MonthlyAttendanceCalendarDay } from "@/types";

type DayCell = {
  date: Date;
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  data: MonthlyAttendanceCalendarDay | null;
};

type VisualStatus = "present" | "late" | "absent" | "leave" | "not_marked" | "off" | "pre_join";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toMonthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function toMonthValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");
}

function formatTime(value: string | null): string {
  if (!value) return "-";
  const [hh, mm] = value.split(":");
  const hour = Number(hh);
  if (!Number.isFinite(hour)) return value;
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${mm} ${ampm}`;
}

function resolveVisualStatus(cell: DayCell, todayIso: string): VisualStatus {
  if (cell.data?.status === "pre_join") return "pre_join";
  if (cell.data?.status === "off") return "off";
  if (cell.data?.status === "leave") return "leave";
  if (cell.data?.status === "present") {
    if (Number(cell.data.fine_amount || 0) > 0 || Number(cell.data.late_minutes || 0) > 0) {
      return "late";
    }
    return "present";
  }
  if (cell.data?.status === "absent") return "absent";
  return cell.iso < todayIso ? "absent" : "not_marked";
}

function statusMeta(status: VisualStatus) {
  switch (status) {
    case "present":
      return { label: "Present", cardClass: "border-emerald-300/35 bg-emerald-500/10 dark:bg-emerald-500/12", dotClass: "bg-emerald-500" };
    case "late":
      return { label: "Late", cardClass: "border-amber-300/35 bg-amber-500/10 dark:bg-amber-500/12", dotClass: "bg-amber-500" };
    case "absent":
      return { label: "Absent", cardClass: "border-rose-300/35 bg-rose-500/10 dark:bg-rose-500/12", dotClass: "bg-rose-500" };
    case "leave":
      return { label: "Leave", cardClass: "border-cyan-300/35 bg-cyan-500/10 dark:bg-cyan-500/12", dotClass: "bg-cyan-500" };
    case "off":
      return { label: "Off", cardClass: "border-violet-300/35 bg-violet-500/10 dark:bg-violet-500/12", dotClass: "bg-violet-500" };
    case "pre_join":
      return { label: "Pre-Join", cardClass: "border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]", dotClass: "bg-slate-300" };
    default:
      return { label: "Not Marked", cardClass: "border-[rgb(var(--border))] bg-[rgb(var(--surface))]", dotClass: "bg-slate-400" };
  }
}

function SummaryCard(props: { title: string; value: string | number; subtitle: string; icon: React.ReactNode; toneClass: string }) {
  return (
    <div className="theme-surface rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--text-soft))]">{props.title}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-[rgb(var(--text))]">{props.value}</p>
          <p className="mt-1 text-xs text-[rgb(var(--text-soft))]">{props.subtitle}</p>
        </div>
        <span className={`grid h-10 w-10 place-items-center rounded-2xl border text-sm shadow-sm ${props.toneClass}`}>{props.icon}</span>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: VisualStatus }) {
  const meta = statusMeta(status);
  const tone = {
    present: "border border-emerald-300/60 bg-emerald-500/12 text-emerald-700 dark:text-emerald-200",
    late: "border border-amber-300/60 bg-amber-500/12 text-amber-700 dark:text-amber-200",
    absent: "border border-rose-300/60 bg-rose-500/12 text-rose-700 dark:text-rose-200",
    leave: "border border-cyan-300/60 bg-cyan-500/12 text-cyan-700 dark:text-cyan-200",
    off: "border border-violet-300/60 bg-violet-500/12 text-violet-700 dark:text-violet-200",
    pre_join: "border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-[rgb(var(--text-soft))]",
    not_marked: "border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-[rgb(var(--text-soft))]",
  }[status];
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${tone}`}>{meta.label}</span>;
}

export function MonthlyAttendancePage() {
  const { user, isAdmin, hasPermission, getAllowedDepartments } = useAuth();
  const toast = useToast();
  const canViewManagedMonthly = isAdmin || hasPermission("can_view_monthly_attendance");
  const allowedDepartments = useMemo(
    () => getAllowedDepartments("can_view_monthly_attendance"),
    [getAllowedDepartments],
  );
  const { departments: departmentRecords } = useDepartments({ admin: isAdmin, includeInactive: isAdmin });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loadSeqRef = useRef(0);

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return startOfMonthLocal(now.getFullYear(), now.getMonth());
  });
  const [now, setNow] = useState(() => new Date());
  const [monthDays, setMonthDays] = useState<MonthlyAttendanceCalendarDay[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeeLoadError, setEmployeeLoadError] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [selectedSelfieFile, setSelectedSelfieFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [captureStep, setCaptureStep] = useState<"picker" | "live" | "preview">("picker");
  const [cameraMessage, setCameraMessage] = useState("");
  const [adminEditOpen, setAdminEditOpen] = useState(false);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [actionCellIso, setActionCellIso] = useState("");
  const [actionCheckinTime, setActionCheckinTime] = useState("09:00");
  const [actionNote, setActionNote] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSaving, setActionSaving] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);

  const todayIso = useMemo(() => localYmd(now), [now]);
  const employeeOptions = useMemo(() => {
    const unique = new Map<string, Employee>();
    employees.forEach((employee) => unique.set(employee.id, employee));
    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [employees]);
  const departmentOptions = useMemo(() => {
    const names = departmentRecords.map((department) => department.name).sort((a, b) => a.localeCompare(b));
    if (isAdmin) return names;
    if (!canViewManagedMonthly) return [];
    const allowed = new Set(allowedDepartments || []);
    return names.filter((departmentName) => allowed.has(departmentName));
  }, [allowedDepartments, canViewManagedMonthly, departmentRecords, isAdmin]);
  const roleOptions = useMemo(() => Array.from(new Set(employeeOptions.map((employee) => employee.role).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [employeeOptions]);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredEmployeeOptions = useMemo(
    () =>
      employeeOptions.filter((employee) => {
        const matchesDepartment = departmentFilter === "all" || employee.department === departmentFilter;
        const matchesRole = roleFilter === "all" || employee.role === roleFilter;
        const haystack = `${employee.name} ${employee.email} ${employee.department} ${employee.role}`.toLowerCase();
        return matchesDepartment && matchesRole && (!normalizedSearch || haystack.includes(normalizedSearch));
      }),
    [departmentFilter, employeeOptions, normalizedSearch, roleFilter],
  );
  const selectedEmployee = useMemo(() => employeeOptions.find((employee) => employee.id === selectedEmployeeId) ?? null, [employeeOptions, selectedEmployeeId]);
  const activeAttendanceEmployeeId = canViewManagedMonthly ? selectedEmployeeId : user?.employeeId?.trim() || "";
  const adminFilterActive = departmentFilter !== "all" || roleFilter !== "all" || !!searchQuery.trim();

  useEffect(() => {
    let mounted = true;
    async function syncClock() {
      try {
        const res = await apiClient.getServerTime();
        if (!mounted) return;
        const serverNow = new Date(res.iso);
        if (Number.isNaN(serverNow.getTime())) return;
        setNow(serverNow);
        setCurrentMonth((prev) => {
          const sameMonth = prev.getFullYear() === serverNow.getFullYear() && prev.getMonth() === serverNow.getMonth();
          return sameMonth ? prev : startOfMonthLocal(serverNow.getFullYear(), serverNow.getMonth());
        });
      } catch {
        // Fallback to local clock.
      }
    }
    void syncClock();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (!canViewManagedMonthly) {
      setEmployees([]);
      setEmployeeLoadError("");
      setSelectedEmployeeId("");
      setDepartmentFilter("all");
      setRoleFilter("all");
      setSearchQuery("");
      return;
    }

    let mounted = true;
    setEmployeesLoading(true);
    setEmployeeLoadError("");
    const employeeRequest = isAdmin
      ? apiClient.getEmployees()
      : apiClient.getAccessibleEmployees("can_view_monthly_attendance");

    employeeRequest.then((res) => {
      if (mounted) setEmployees(res.employees || []);
    }).catch((e) => {
      if (!mounted) return;
      const msg = e instanceof Error ? e.message : "Failed to load employees";
      setEmployeeLoadError(msg);
      toast.error(msg);
      setEmployees([]);
    }).finally(() => {
      if (mounted) setEmployeesLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [canViewManagedMonthly, isAdmin, toast]);

  useEffect(() => {
    if (!canViewManagedMonthly) return;
    const ownEmployeeId = user?.employeeId?.trim() || "";
    const selectedStillVisible = !!selectedEmployeeId && (selectedEmployeeId === ownEmployeeId || filteredEmployeeOptions.some((employee) => employee.id === selectedEmployeeId));
    if (selectedStillVisible) return;
    const nextEmployeeId = filteredEmployeeOptions.length === 0
      ? ""
      : filteredEmployeeOptions[0]?.id || ownEmployeeId || employeeOptions[0]?.id || "";
    if (nextEmployeeId !== selectedEmployeeId) setSelectedEmployeeId(nextEmployeeId);
  }, [canViewManagedMonthly, employeeOptions, filteredEmployeeOptions, selectedEmployeeId, user?.employeeId]);

  async function loadMonth(target: Date, employeeId: string) {
    if (isAdmin && !employeeId) {
      setMonthDays([]);
      setLoading(false);
      setError("");
      return;
    }

    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError("");
    try {
      if (import.meta.env.DEV) {
        console.debug("[MonthlyAttendance.loadMonth] request", {
          canViewManagedMonthly,
          selectedEmployeeId: selectedEmployeeId || null,
          activeAttendanceEmployeeId: employeeId || null,
          year: target.getFullYear(),
          month: target.getMonth() + 1,
        });
      }
      const res = await apiClient.getAttendanceMonth(
        target.getFullYear(),
        target.getMonth() + 1,
        canViewManagedMonthly ? employeeId : undefined,
      );
      if (seq !== loadSeqRef.current) return;
      if (import.meta.env.DEV) {
        console.debug("[MonthlyAttendance.loadMonth] response", {
          requestedEmployeeId: employeeId || null,
          returnedEmployeeId: (res as { employee_id?: string }).employee_id || null,
          days: res.month_days.length,
        });
      }
      setMonthDays(res.month_days);
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      const msg = e instanceof Error ? e.message : "Failed to load attendance month";
      setError(msg);
      toast.error(msg);
      setMonthDays([]);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    void loadMonth(currentMonth, activeAttendanceEmployeeId);
  }, [activeAttendanceEmployeeId, canViewManagedMonthly, currentMonth]);

  useEffect(() => {
    if (import.meta.env.DEV && canViewManagedMonthly) {
      console.debug("[MonthlyAttendance] selection changed", {
        selectedEmployeeId: selectedEmployeeId || null,
        activeAttendanceEmployeeId: activeAttendanceEmployeeId || null,
      });
    }
  }, [activeAttendanceEmployeeId, canViewManagedMonthly, selectedEmployeeId]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      stopCameraStream();
    };
  }, [previewUrl]);

  useEffect(() => {
    if ((!previewOpen && !adminEditOpen) || captureStep !== "live" || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    void video.play().catch(() => {});
  }, [adminEditOpen, captureStep, previewOpen]);

  const monthDaysMap = useMemo(() => {
    const map = new Map<string, MonthlyAttendanceCalendarDay>();
    monthDays.forEach((day) => map.set(day.date, day));
    return map;
  }, [monthDays]);

  const calendarCells = useMemo(() => {
    const start = startOfMonthLocal(currentMonth.getFullYear(), currentMonth.getMonth());
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    const leading = start.getDay();
    const totalDays = end.getDate();
    const trailing = (7 - ((leading + totalDays) % 7)) % 7;
    const cells: DayCell[] = [];

    for (let i = leading; i > 0; i -= 1) {
      const d = new Date(start);
      d.setDate(start.getDate() - i);
      const key = localYmd(d);
      cells.push({ date: d, iso: key, inMonth: false, isToday: false, data: monthDaysMap.get(key) ?? null });
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const d = startOfMonthLocal(currentMonth.getFullYear(), currentMonth.getMonth());
      d.setDate(day);
      const key = localYmd(d);
      cells.push({ date: d, iso: key, inMonth: true, isToday: key === todayIso, data: monthDaysMap.get(key) ?? null });
    }

    for (let i = 1; i <= trailing; i += 1) {
      const d = new Date(end);
      d.setDate(end.getDate() + i);
      const key = localYmd(d);
      cells.push({ date: d, iso: key, inMonth: false, isToday: false, data: monthDaysMap.get(key) ?? null });
    }

    return cells;
  }, [currentMonth, monthDaysMap, todayIso]);

  const summary = useMemo(() => {
    const present = monthDays.filter((d) => d.status === "present" && Number(d.fine_amount || 0) <= 0).length;
    const late = monthDays.filter((d) => d.status === "present" && Number(d.fine_amount || 0) > 0).length;
    const absent = monthDays.filter((d) => d.status === "absent").length;
    const leave = monthDays.filter((d) => d.status === "leave").length;
    const off = monthDays.filter((d) => d.status === "off").length;
    const totalFine = monthDays.reduce((acc, day) => acc + Number(day.fine_amount || 0), 0);
    return { present, late, absent, leave, off, totalFine };
  }, [monthDays]);

  const activeActionCell = useMemo(
    () => calendarCells.find((cell) => cell.iso === actionCellIso) ?? null,
    [actionCellIso, calendarCells],
  );

  const todayRecord = useMemo(() => monthDays.find((d) => d.date === todayIso) ?? null, [monthDays, todayIso]);
  const todayStatus = useMemo(() => {
    const todayCell = calendarCells.find((cell) => cell.iso === todayIso);
    return todayCell ? resolveVisualStatus(todayCell, todayIso) : "not_marked";
  }, [calendarCells, todayIso]);
  const todayAlreadyPresent = todayRecord?.status === "present";
  const todayIsOff = todayRecord?.status === "off";
  const canMarkPresent = !canViewManagedMonthly;
  const isViewingCurrentMonth = sameLocalDay(
    startOfMonthLocal(currentMonth.getFullYear(), currentMonth.getMonth()),
    startOfMonthLocal(now.getFullYear(), now.getMonth()),
  );
  const markPresentTooltip = !canMarkPresent
    ? "Manual marking is available only in your own attendance view."
    : !isViewingCurrentMonth
      ? "Mark Present is available only for today in the current month."
      : todayIsOff
        ? "Today is configured as an off day."
        : todayAlreadyPresent
          ? "Today's attendance is already marked."
          : "Mark attendance for today with selfie proof.";

  function goPrevMonth() {
    setCurrentMonth((prev) => startOfMonthLocal(prev.getFullYear(), prev.getMonth() - 1));
  }

  function goNextMonth() {
    setCurrentMonth((prev) => startOfMonthLocal(prev.getFullYear(), prev.getMonth() + 1));
  }

  function jumpToCurrentMonth() {
    setCurrentMonth(startOfMonthLocal(now.getFullYear(), now.getMonth()));
  }

  function onMonthInputChange(value: string) {
    const match = value.match(/^(\d{4})-(\d{2})$/);
    if (!match) return;
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) return;
    setCurrentMonth(startOfMonthLocal(year, monthIndex));
  }

  function clearAdminFilters() {
    setDepartmentFilter("all");
    setRoleFilter("all");
    setSearchQuery("");
  }

  async function downloadMonthlyPDF() {
    if (!isAdmin) {
      toast.error("Only admins can download this PDF report.");
      return;
    }
    if (!selectedEmployeeId || !selectedEmployee) {
      const msg = "Select an employee before downloading the PDF.";
      setError(msg);
      toast.error(msg);
      return;
    }

    setPdfDownloading(true);
    try {
      const month = toMonthValue(currentMonth);
      const blob = await apiClient.getAdminMonthlyAttendancePDF({
        employee_id: selectedEmployeeId,
        month,
      });
      const filename = `monthly_attendance_${sanitizeFilenamePart(selectedEmployee.name) || selectedEmployee.id}_${month}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Monthly attendance PDF downloaded.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to download monthly attendance PDF.";
      setError(msg);
      toast.error(msg);
    } finally {
      setPdfDownloading(false);
    }
  }

  function stopCameraStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function resetCaptureState() {
    setSelectedSelfieFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setCaptureStep("picker");
    setCameraMessage("");
    stopCameraStream();
  }

  function onPickSelfie() {
    resetCaptureState();
    setActionError("");
    setCameraMessage("");
    setCaptureStep("picker");
    setPreviewOpen(true);
  }

  function openAdminEdit(cell: DayCell) {
    resetCaptureState();
    setActionCellIso(cell.iso);
    setActionNote(cell.data?.note || "");
    setActionCheckinTime(selectedEmployee?.shiftStartTime?.slice(0, 5) || "09:00");
    setActionError("");
    setAdminEditOpen(true);
  }

  function openLeaveModal(cell: DayCell) {
    setActionCellIso(cell.iso);
    setActionNote(cell.data?.note || "");
    setActionError("");
    setLeaveModalOpen(true);
  }

  function closeAdminEdit() {
    setAdminEditOpen(false);
    setActionCellIso("");
    setActionCheckinTime(selectedEmployee?.shiftStartTime?.slice(0, 5) || "09:00");
    setActionNote("");
    setActionError("");
    resetCaptureState();
  }

  function closeLeaveModal() {
    setLeaveModalOpen(false);
    setActionCellIso("");
    setActionNote("");
    setActionError("");
  }

  async function openLiveCamera() {
    setCameraMessage("");
    if (!navigator.mediaDevices?.getUserMedia) {
      const msg = "Camera not available on this device.";
      setCameraMessage(msg);
      toast.info(msg);
      return;
    }

    try {
      stopCameraStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
        },
        audio: false,
      });
      streamRef.current = stream;
      setCaptureStep("live");
    } catch {
      const msg = "Camera not available on this device.";
      setCameraMessage(msg);
      toast.info(msg);
    }
  }

  function captureFromVideo() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const width = video.videoWidth || 960;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error("Failed to capture image. Please try again.");
          return;
        }
        const file = new File([blob], `selfie_${Date.now()}.jpg`, { type: "image/jpeg" });
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setSelectedSelfieFile(file);
        setPreviewUrl(URL.createObjectURL(file));
        setCaptureStep("preview");
        stopCameraStream();
      },
      "image/jpeg",
      0.92,
    );
  }

  async function submitManualSelfie() {
    if (!selectedSelfieFile) return;
    setUploading(true);
    setError("");
    try {
      const res = await apiClient.markAttendanceManualSelfie(selectedSelfieFile, {
        device_info: navigator.userAgent,
      });
      toast.success(`Attendance marked at ${formatTime(res.attendance.checkin_time)}.`);
      setPreviewOpen(false);
      resetCaptureState();
      await loadMonth(currentMonth, activeAttendanceEmployeeId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to submit selfie proof.";
      if (msg.toLowerCase().includes("already marked today")) {
        toast.info("Already marked today.");
        await loadMonth(currentMonth, activeAttendanceEmployeeId);
      } else {
        toast.error(msg);
      }
      setError(msg);
    } finally {
      setUploading(false);
    }
  }

  async function submitAdminEdit() {
    if (!selectedEmployeeId) {
      const msg = "Select an employee before updating attendance.";
      setActionError(msg);
      toast.error(msg);
      return;
    }
    if (!activeActionCell) {
      const msg = "Select a calendar day before updating attendance.";
      setActionError(msg);
      toast.error(msg);
      return;
    }
    if (!selectedSelfieFile) {
      const msg = "Capture a proof photo before saving attendance.";
      setActionError(msg);
      toast.error(msg);
      return;
    }
    if (!actionCheckinTime) {
      const msg = "Check-in time is required.";
      setActionError(msg);
      toast.error(msg);
      return;
    }

    setActionSaving(true);
    setActionError("");
    try {
      const res = await apiClient.adminAdjustMonthlyAttendance(selectedSelfieFile, {
        employee_id: selectedEmployeeId,
        date: activeActionCell.iso,
        checkin_time: actionCheckinTime,
        note: actionNote.trim() || undefined,
        device_info: navigator.userAgent,
      });
      toast.success(`${res.attendance.status} saved for ${activeActionCell.iso}.`);
      closeAdminEdit();
      await loadMonth(currentMonth, activeAttendanceEmployeeId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update attendance.";
      setActionError(msg);
      toast.error(msg);
    } finally {
      setActionSaving(false);
    }
  }

  async function submitLeave() {
    if (!selectedEmployeeId) {
      const msg = "Select an employee before marking leave.";
      setActionError(msg);
      toast.error(msg);
      return;
    }
    if (!activeActionCell) {
      const msg = "Select a calendar day before marking leave.";
      setActionError(msg);
      toast.error(msg);
      return;
    }

    const normalizedNote = actionNote.trim();
    if (!normalizedNote) {
      const msg = "Leave note is required.";
      setActionError(msg);
      toast.error(msg);
      return;
    }

    setActionSaving(true);
    setActionError("");
    try {
      await apiClient.adminMarkMonthlyLeave({
        employee_id: selectedEmployeeId,
        date: activeActionCell.iso,
        note: normalizedNote,
      });
      toast.success(`Leave marked for ${activeActionCell.iso}.`);
      closeLeaveModal();
      await loadMonth(currentMonth, activeAttendanceEmployeeId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to mark leave.";
      setActionError(msg);
      toast.error(msg);
    } finally {
      setActionSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <section className="theme-surface rounded-[28px] border p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <span className="theme-surface-strong grid h-11 w-11 place-items-center rounded-2xl border text-sky-200 shadow-sm">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgb(var(--text-soft))]">Attendance Calendar</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-[rgb(var(--text))]">Monthly Attendance</h1>
              <p className="mt-1 text-sm text-[rgb(var(--text-soft))]">
                {canViewManagedMonthly
                  ? "Switch between employees and review monthly attendance without leaving the calendar."
                  : "View the whole month at a glance and mark today with live selfie proof when needed."}
              </p>
              {canViewManagedMonthly && selectedEmployee ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-semibold text-sky-700 dark:border-sky-400/30 dark:bg-sky-500/12 dark:text-sky-200">
                    {selectedEmployee.name}
                  </span>
                  <span className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] px-2.5 py-1 text-[rgb(var(--text-soft))]">
                    {selectedEmployee.email}
                  </span>
                  <span className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] px-2.5 py-1 text-[rgb(var(--text-soft))]">
                    {selectedEmployee.department}
                  </span>
                  <span className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] px-2.5 py-1 capitalize text-[rgb(var(--text-soft))]">
                    {selectedEmployee.role}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 xl:max-w-[760px] xl:items-end">
            {canViewManagedMonthly ? (
              <div className="theme-surface-muted grid w-full gap-3 rounded-[24px] border p-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.45fr_auto]">
                <Select label="Department" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} disabled={employeesLoading}>
                  <option value="all">All departments</option>
                  {departmentOptions.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </Select>

                <Select label="Role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} disabled={employeesLoading}>
                  <option value="all">All roles</option>
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </Select>

                <div className="grid gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">Find Employee</span>
                  <label className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--text-soft))]" />
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search name or email"
                      className="h-10 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-elevated))] pl-9 pr-3 text-sm text-[rgb(var(--text))] shadow-sm outline-none transition placeholder:text-[rgb(var(--text-soft))] focus:border-[rgb(var(--primary))] focus:ring-4 focus:ring-[rgba(var(--focus-ring),0.18)]"
                    />
                  </label>
                </div>

                <div className="flex items-end">
                  <Button variant="secondary" onClick={clearAdminFilters} disabled={employeesLoading || !adminFilterActive} className="w-full xl:w-auto">
                    <X className="h-4 w-4" />
                    Clear
                  </Button>
                </div>

                <div className="sm:col-span-2 xl:col-span-4">
                  {employeeLoadError ? <Alert variant="error">{employeeLoadError}</Alert> : null}
                  <Select label="Employee" value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)} disabled={employeesLoading || filteredEmployeeOptions.length === 0} className="w-full">
                    {filteredEmployeeOptions.length === 0 ? <option value="">No matching employees</option> : null}
                    {filteredEmployeeOptions.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name} | {employee.email} | {employee.department}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-xs text-[rgb(var(--text-soft))]">
                    {employeesLoading
                      ? "Loading employees..."
                      : filteredEmployeeOptions.length === 0
                        ? "No employee matches the current filters."
                        : `${filteredEmployeeOptions.length} employee${filteredEmployeeOptions.length === 1 ? "" : "s"} available in the current filter set.`}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Input
                label="Month"
                type="month"
                value={toMonthValue(currentMonth)}
                onChange={(event) => onMonthInputChange(event.target.value)}
                className="min-w-[180px]"
              />
              <Button variant="secondary" onClick={goPrevMonth}>
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>
              <div className="theme-surface rounded-2xl border px-4 py-2 text-sm font-semibold">{toMonthLabel(currentMonth)}</div>
              <Button variant="secondary" onClick={goNextMonth}>
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
              {!isViewingCurrentMonth ? <Button variant="secondary" onClick={jumpToCurrentMonth}>Today</Button> : null}
              {isAdmin ? (
                <Button
                  variant="secondary"
                  onClick={() => void downloadMonthlyPDF()}
                  disabled={pdfDownloading || employeesLoading || !selectedEmployeeId}
                >
                  <Download className="h-4 w-4" />
                  {pdfDownloading ? "Downloading..." : "Download PDF"}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard title="Present" value={summary.present} subtitle="On-time days" icon={<CheckCircle2 className="h-4 w-4" />} toneClass="border-emerald-200 bg-emerald-50 text-emerald-700" />
        <SummaryCard title="Late" value={summary.late} subtitle="Late arrivals" icon={<Clock3 className="h-4 w-4" />} toneClass="border-amber-200 bg-amber-50 text-amber-700" />
        <SummaryCard title="Absent" value={summary.absent} subtitle="Past missed days" icon={<CircleAlert className="h-4 w-4" />} toneClass="border-rose-200 bg-rose-50 text-rose-700" />
        <SummaryCard title="Leave" value={summary.leave} subtitle="Approved leave days" icon={<CalendarDays className="h-4 w-4" />} toneClass="border-cyan-200 bg-cyan-50 text-cyan-700" />
        <SummaryCard title="Off" value={summary.off} subtitle="Weekly holidays" icon={<CalendarDays className="h-4 w-4" />} toneClass="border-violet-200 bg-violet-50 text-violet-700" />
        <SummaryCard title="Total Fine" value={`PKR ${summary.totalFine.toFixed(2)}`} subtitle="This month" icon={<Wallet className="h-4 w-4" />} toneClass="border-sky-200 bg-sky-50 text-sky-700" />
      </div>

      <Card
        title="Monthly Calendar"
        subtitle={canViewManagedMonthly ? "Review month-level attendance for the selected employee." : "Past and future days are view-only. Today can be marked once with selfie proof."}
        className="shadow-[0_12px_30px_rgba(15,23,42,0.04)]"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="theme-surface-muted hidden items-center gap-2 rounded-2xl border px-3 py-2 text-xs text-[rgb(var(--text-soft))] md:flex">
              {(["present", "late", "absent", "leave", "off", "pre_join", "not_marked"] as const).map((status) => {
                const meta = statusMeta(status);
                return (
                  <span key={status} className="inline-flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${meta.dotClass}`} />
                    {meta.label}
                  </span>
                );
              })}
            </div>
            {canMarkPresent ? (
              <Button onClick={onPickSelfie} disabled={todayAlreadyPresent || todayIsOff || uploading || !isViewingCurrentMonth} title={markPresentTooltip}>
                <Camera className="h-4 w-4" />
                {!isViewingCurrentMonth ? "Open Current Month To Mark" : todayIsOff ? "Off Day" : todayAlreadyPresent ? "Already Marked Today" : uploading ? "Uploading..." : "Mark Present"}
              </Button>
            ) : null}
          </div>
        }
      >
        {loading ? (
          <div className="space-y-3">
            <CardSkeleton rows={2} />
            <CardSkeleton rows={2} />
          </div>
        ) : null}

        {!loading && monthDays.length === 0 ? (
          <EmptyState
            title={canViewManagedMonthly && employeeLoadError ? "Employee access unavailable" : canViewManagedMonthly && filteredEmployeeOptions.length === 0 ? "No matching employees" : canViewManagedMonthly && !activeAttendanceEmployeeId ? "Select an employee" : "No month data"}
            message={canViewManagedMonthly && employeeLoadError ? "The monthly employee selector could not be loaded for your current scope." : canViewManagedMonthly && filteredEmployeeOptions.length === 0 ? "Try a different department, role, or search term." : canViewManagedMonthly && !activeAttendanceEmployeeId ? "Choose an employee to view monthly attendance." : "Unable to load attendance days for this month."}
          />
        ) : null}

        {!loading && monthDays.length > 0 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 md:hidden">
              {(["present", "late", "absent", "leave", "off", "pre_join", "not_marked"] as const).map((status) => {
                const meta = statusMeta(status);
                return (
                  <div key={status} className="theme-surface-muted inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs text-[rgb(var(--text-soft))]">
                    <span className={`h-2 w-2 rounded-full ${meta.dotClass}`} />
                    {meta.label}
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {WEEKDAYS.map((weekday) => (
                <div key={weekday} className="theme-surface-muted rounded-xl border px-2 py-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-[rgb(var(--text-soft))]">
                  {weekday}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
              {calendarCells.map((cell) => {
                const status = resolveVisualStatus(cell, todayIso);
                const meta = statusMeta(status);
                const lateMinutes = Number(cell.data?.late_minutes ?? 0);
                const fineAmount = Number(cell.data?.fine_amount ?? 0);
                const hasEvidence = !!cell.data?.evidence_photo_url;
                const canAdminAdjustDay =
                  isAdmin &&
                  canViewManagedMonthly &&
                  cell.inMonth &&
                  (status === "absent" || status === "not_marked");

                return (
                  <div
                    key={cell.iso}
                    className={[
                      "relative rounded-2xl border p-3 transition-all",
                      meta.cardClass,
                      cell.isToday ? "ring-2 ring-sky-400/25 shadow-[0_8px_20px_rgba(14,165,233,0.16)]" : "shadow-[0_6px_18px_rgba(var(--shadow-color),0.12)]",
                      !cell.inMonth ? "opacity-55" : "",
                    ].join(" ")}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-[rgb(var(--text))]">{cell.date.getDate()}</p>
                        <p className="text-[11px] text-[rgb(var(--text-soft))]">{cell.data?.weekday ?? cell.date.toLocaleDateString(undefined, { weekday: "short" })}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {cell.isToday ? <span className="rounded-full border border-sky-400/35 bg-sky-500/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-200">Today</span> : null}
                        <StatusPill status={status} />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[rgb(var(--text-soft))]">Time</span>
                        <span className="font-medium text-[rgb(var(--text))]">{formatTime(cell.data?.checkin_time ?? null)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[rgb(var(--text-soft))]">Late</span>
                        <span className="font-medium text-[rgb(var(--text))]">{status === "off" || status === "pre_join" ? "-" : `${lateMinutes} min`}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[rgb(var(--text-soft))]">Fine</span>
                        <span className={`font-medium ${fineAmount > 0 ? "text-rose-700 dark:text-rose-200" : "text-[rgb(var(--text))]"}`}>PKR {fineAmount.toFixed(2)}</span>
                      </div>
                    </div>

                    {cell.data?.note ? (
                      <div className="mt-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-elevated))] px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[rgb(var(--text-soft))]">Note</p>
                        <p className="mt-1 text-xs text-[rgb(var(--text))]">{cell.data.note}</p>
                      </div>
                    ) : null}

                    {hasEvidence ? (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-[0.12em] text-[rgb(var(--text-soft))]">{cell.data?.source ?? "none"}</span>
                          <span className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface-elevated))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--text-soft))]">Evidence</span>
                        </div>
                        <a href={toFileUrl(cell.data?.evidence_photo_url ?? undefined)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-elevated))] shadow-[0_8px_18px_rgba(var(--shadow-color),0.18)]">
                          <img src={toFileUrl(cell.data?.evidence_photo_url ?? undefined)} alt="Evidence" className="h-28 w-full object-cover" />
                        </a>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-[0.12em] text-[rgb(var(--text-soft))]">{cell.data?.source ?? "none"}</span>
                        <span className="inline-flex h-9 items-center justify-center rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface-elevated))] px-3 text-[10px] text-[rgb(var(--text-soft))]">No photo</span>
                      </div>
                    )}

                    {canAdminAdjustDay ? (
                      <div className="mt-3 grid gap-2">
                        <Button size="sm" onClick={() => openAdminEdit(cell)}>
                          <Camera className="h-4 w-4" />
                          Edit With Proof
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => openLeaveModal(cell)}>
                          Mark Leave
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </Card>

      <Modal
        isOpen={previewOpen}
        title={captureStep === "live" ? "Live Camera Capture" : selectedSelfieFile ? "Selfie Proof Preview" : "Mark Present"}
        onClose={() => {
          if (uploading) return;
          setPreviewOpen(false);
          resetCaptureState();
        }}
        width="md"
        footer={
          <>
            {captureStep === "live" ? (
              <>
                <Button onClick={captureFromVideo}>
                  <Camera className="h-4 w-4" />
                  Capture
                </Button>
                <Button variant="secondary" onClick={() => {
                  stopCameraStream();
                  setCaptureStep("picker");
                }}>
                  Cancel
                </Button>
              </>
            ) : selectedSelfieFile ? (
              <>
                <Button variant="secondary" onClick={() => void openLiveCamera()} disabled={uploading}>
                  Retake
                </Button>
                <Button onClick={() => void submitManualSelfie()} disabled={!selectedSelfieFile || uploading}>
                  {uploading ? "Submitting..." : "Submit"}
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => setPreviewOpen(false)} disabled={uploading}>
                Cancel
              </Button>
            )}
          </>
        }
      >
        {captureStep === "live" ? (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-black">
              <video ref={videoRef} className="h-72 w-full object-cover" autoPlay playsInline muted />
            </div>
            <p className="text-xs text-[rgb(var(--text-soft))]">Align your face clearly and tap Capture.</p>
            <canvas ref={canvasRef} className="hidden" />
          </div>
        ) : previewUrl ? (
          <div className="space-y-3">
            <img src={previewUrl} alt="Selfie preview" className="h-72 w-full rounded-2xl border border-[rgb(var(--border))] object-cover" />
            <p className="text-xs text-[rgb(var(--text-soft))]">Review the photo before submitting today's attendance.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="theme-surface-muted rounded-2xl border p-4">
              <p className="text-sm font-semibold text-[rgb(var(--text))]">Live selfie proof</p>
              <p className="mt-1 text-sm text-[rgb(var(--text-soft))]">Use your camera to capture a fresh photo. This marks attendance for today only.</p>
            </div>
            {cameraMessage ? <Alert variant="info">{cameraMessage}</Alert> : null}
            <div className="grid gap-3">
              <Button onClick={() => void openLiveCamera()}>
                <Camera className="h-4 w-4" />
                Open Camera
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={adminEditOpen}
        title={activeActionCell ? `Edit Absent Day · ${activeActionCell.iso}` : "Edit Absent Day"}
        onClose={actionSaving ? () => {} : closeAdminEdit}
        width="md"
        footer={
          captureStep === "live" ? (
            <>
              <Button onClick={captureFromVideo} disabled={actionSaving}>
                <Camera className="h-4 w-4" />
                Capture
              </Button>
              <Button variant="secondary" onClick={() => {
                stopCameraStream();
                setCaptureStep("picker");
              }} disabled={actionSaving}>
                Cancel Camera
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={closeAdminEdit} disabled={actionSaving}>
                Cancel
              </Button>
              <Button onClick={() => void submitAdminEdit()} disabled={!selectedSelfieFile || !actionCheckinTime || actionSaving}>
                {actionSaving ? "Saving..." : "Save Attendance"}
              </Button>
            </>
          )
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4">
            <Input
              label="Check-in Time"
              type="time"
              value={actionCheckinTime}
              onChange={(event) => setActionCheckinTime(event.target.value)}
            />
            <Textarea
              label="Admin Note"
              rows={3}
              value={actionNote}
              onChange={(event) => setActionNote(event.target.value)}
              placeholder="Optional note for the attendance correction"
            />
          </div>

          {captureStep === "live" ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-black">
                <video ref={videoRef} className="h-72 w-full object-cover" autoPlay playsInline muted />
              </div>
              <p className="text-xs text-[rgb(var(--text-soft))]">Capture the employee photo as proof for this correction.</p>
              <canvas ref={canvasRef} className="hidden" />
            </div>
          ) : previewUrl ? (
            <div className="space-y-3">
              <img src={previewUrl} alt="Attendance proof preview" className="h-72 w-full rounded-2xl border border-[rgb(var(--border))] object-cover" />
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => void openLiveCamera()} disabled={actionSaving}>
                  Retake
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="theme-surface-muted rounded-2xl border p-4">
                <p className="text-sm font-semibold text-[rgb(var(--text))]">Proof photo required</p>
                <p className="mt-1 text-sm text-[rgb(var(--text-soft))]">Take a fresh photo, then save. The backend will recalculate status and fine from the check-in time.</p>
              </div>
              {cameraMessage ? <Alert variant="info">{cameraMessage}</Alert> : null}
              <Button onClick={() => void openLiveCamera()} disabled={actionSaving}>
                <Camera className="h-4 w-4" />
                Open Camera
              </Button>
            </div>
          )}

          {actionError ? <Alert variant="error">{actionError}</Alert> : null}
        </div>
      </Modal>

      <Modal
        isOpen={leaveModalOpen}
        title={activeActionCell ? `Mark Leave · ${activeActionCell.iso}` : "Mark Leave"}
        onClose={actionSaving ? () => {} : closeLeaveModal}
        width="md"
        footer={
          <>
            <Button variant="secondary" onClick={closeLeaveModal} disabled={actionSaving}>
              Cancel
            </Button>
            <Button onClick={() => void submitLeave()} disabled={actionSaving}>
              {actionSaving ? "Saving..." : "Save Leave"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="theme-surface-muted rounded-2xl border p-4">
            <p className="text-sm font-semibold text-[rgb(var(--text))]">Leave days do not carry a fine</p>
            <p className="mt-1 text-sm text-[rgb(var(--text-soft))]">Add the reason so this day is visible as approved leave instead of absence.</p>
          </div>
          <Textarea
            label="Leave Note"
            rows={4}
            value={actionNote}
            onChange={(event) => setActionNote(event.target.value)}
            placeholder="Reason for leave"
          />
          {actionError ? <Alert variant="error">{actionError}</Alert> : null}
        </div>
      </Modal>
    </div>
  );
}
