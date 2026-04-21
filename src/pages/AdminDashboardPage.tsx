import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArcElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartOptions,
  type Plugin,
} from "chart.js";
import { Doughnut, Line } from "react-chartjs-2";
import { motion } from "framer-motion";
import {
  Activity,
  Bell,
  Building2,
  ChevronRight,
  Clock3,
  ShieldCheck,
  TrendingUp,
  UserX,
  Users,
  Wallet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { WelcomeModal } from "@/components/dashboard/WelcomeModal";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useTheme } from "@/theme/ThemeContext";
import { apiClient } from "@/services/apiClient";
import type { AttendanceRecord, AuditLog, Employee, Notice } from "@/types";

ChartJS.register(ArcElement, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

type Hotspot = "kpi" | "chip" | "chart" | null;

function classNames(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(" ");
}

function safePct(n: number, d: number) {
  if (!d) return 0;
  return Math.max(0, Math.min(100, Math.round((n / d) * 100)));
}

function toMs(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return t;
  }
  return null;
}

function niceDateLabel(d: Date) {
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "2-digit" }).format(d);
  } catch {
    return d.toDateString();
  }
}

function onCardKeyDown(event: React.KeyboardEvent<HTMLElement>, action: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

function routeWithQuery(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return qs ? `${path}?${qs}` : path;
}

function DashboardStatCard(props: {
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ReactNode;
  toneClass: string;
  cardClass: string;
  onClick: () => void;
  pulse?: boolean;
}) {
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.16 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={props.onClick}
        onKeyDown={(event) => onCardKeyDown(event, props.onClick)}
        className={classNames(
          "theme-surface cursor-pointer rounded-3xl border p-5 transition-all duration-200 hover:shadow-[0_18px_36px_rgba(var(--shadow-color),0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300",
          props.cardClass,
          props.pulse && "animate-pulse",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--text-soft))]">{props.title}</p>
            <p className="mt-3 text-3xl font-bold tracking-tight text-[rgb(var(--text))]">{props.value}</p>
            <p className="mt-2 text-sm text-[rgb(var(--text-soft))]">{props.subtitle}</p>
          </div>
          <div className={classNames("grid h-11 w-11 place-items-center rounded-2xl border text-sm shadow-sm", props.toneClass)}>
            {props.icon}
          </div>
        </div>
        <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[rgb(var(--text-soft))]">
          View details <ChevronRight className="h-4 w-4" />
        </div>
      </div>
    </motion.div>
  );
}

function DashboardChip(props: {
  label: string;
  icon: React.ReactNode;
  className: string;
  tooltip: string;
  onClick: () => void;
  pulse?: boolean;
}) {
  return (
    <button
      title={props.tooltip}
      onClick={props.onClick}
      className={classNames(
        "inline-flex items-center gap-2 rounded-2xl border px-3.5 py-2 text-sm font-medium transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300",
        props.className,
        props.pulse && "animate-pulse",
      )}
    >
      {props.icon}
      {props.label}
    </button>
  );
}

const doughnutCenterTextPlugin: Plugin<"doughnut"> = {
  id: "doughnutCenterText",
  beforeDraw(chart) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const anyPlugins = chart.options.plugins as unknown as Record<string, any>;
    const cfg = anyPlugins?.doughnutCenterText as
      | { title?: string; value?: string; subtitle?: string; titleColor?: string; valueColor?: string; subtitleColor?: string }
      | undefined;
    if (!cfg?.value) return;

    const centerX = (chartArea.left + chartArea.right) / 2;
    const centerY = (chartArea.top + chartArea.bottom) / 2;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (cfg.title) {
      ctx.fillStyle = cfg.titleColor || "#64748b";
      ctx.font = "600 11px ui-sans-serif, system-ui, -apple-system";
      ctx.fillText(cfg.title, centerX, centerY - 18);
    }
    ctx.fillStyle = cfg.valueColor || "#0f172a";
    ctx.font = "800 28px ui-sans-serif, system-ui, -apple-system";
    ctx.fillText(cfg.value, centerX, centerY + 2);

    if (cfg.subtitle) {
      ctx.fillStyle = cfg.subtitleColor || "#475569";
      ctx.font = "600 11px ui-sans-serif, system-ui, -apple-system";
      ctx.fillText(cfg.subtitle, centerX, centerY + 22);
    }
    ctx.restore();
  },
};

ChartJS.register(doughnutCenterTextPlugin);

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const { theme } = useTheme();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [monthFineTotal, setMonthFineTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [tourFocus, setTourFocus] = useState<Hotspot>(null);
  const navLockRef = useRef(false);

  function safeNavigate(to: string) {
    if (navLockRef.current) return;
    navLockRef.current = true;
    navigate(to);
    window.setTimeout(() => {
      navLockRef.current = false;
    }, 500);
  }

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const [empRes, attendanceRes, logsRes, noticesRes] = await Promise.all([
          apiClient.getEmployees(),
          apiClient.getTodayAttendance(),
          apiClient.getLogs(),
          apiClient.getNotices(),
        ]);
        if (!mounted) return;
        setEmployees(empRes.employees);
        setAttendance(attendanceRes.records);
        setLogs(logsRes.logs);
        setNotices(noticesRes.notices);

        const now = new Date();
        const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        let page = 1;
        const limit = 100;
        let sum = 0;
        let total = 0;
        do {
          const monthly = await apiClient.getAdminAttendance({ from, to, page, limit });
          sum += (monthly.items || []).reduce((acc, row) => acc + Number(row.fine_amount || 0), 0);
          total = Number(monthly.total || 0);
          page += 1;
        } while ((page - 1) * limit < total);
        if (mounted) setMonthFineTotal(sum);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load dashboard");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [toast]);

  useEffect(() => {
    if (!user) return;
    const key = `ivs_welcome_seen_${user.id}`;
    const seen = localStorage.getItem(key);
    if (!seen) {
      setShowWelcome(true);
      localStorage.setItem(key, "1");
    }
  }, [user]);

  const activeEmployees = useMemo(() => employees.filter((e) => e.isActive).length, [employees]);
  const presentToday = useMemo(
    () => attendance.filter((r) => String(r.status || "").toLowerCase() === "present").length,
    [attendance],
  );
  const lateToday = useMemo(() => attendance.filter((r) => Number(r.fineAmount || 0) > 0).length, [attendance]);
  const totalFineToday = useMemo(() => attendance.reduce((sum, r) => sum + Number(r.fineAmount || 0), 0), [attendance]);
  const absentToday = Math.max(0, activeEmployees - presentToday);
  const presentPct = useMemo(() => safePct(presentToday, Math.max(1, activeEmployees)), [presentToday, activeEmployees]);

  const weeklyAttendanceData = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of attendance) {
      const key = r.date || "";
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
    const labels = Array.from(map.keys()).sort();
    const last = labels.slice(-7);
    if (!last.length) {
      const days: string[] = [];
      const values: number[] = [];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        days.push(niceDateLabel(d));
        values.push(i === 0 ? attendance.length : 0);
      }
      return { labels: days, values };
    }
    return { labels: last, values: last.map((d) => map.get(d) || 0) };
  }, [attendance]);

  const departmentStats = useMemo(() => {
    const stats = new Map<string, { total: number; present: number }>();
    employees.forEach((e) => {
      const dept = e.department || "Unknown";
      const row = stats.get(dept) || { total: 0, present: 0 };
      row.total += 1;
      if (attendance.some((a) => a.employeeId === e.id && String(a.status).toLowerCase() === "present")) {
        row.present += 1;
      }
      stats.set(dept, row);
    });
    return Array.from(stats.entries())
      .map(([name, row]) => ({ name, rate: row.total ? Math.round((row.present / row.total) * 100) : 0 }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5);
  }, [employees, attendance]);

  const topLatecomers = useMemo(() => {
    return attendance
      .filter((r) => Number(r.fineAmount || 0) > 0)
      .map((r) => ({
        employeeId: r.employeeId,
        name: r.name || r.employeeId,
        checkInTime: r.checkInTime,
        ts: toMs(r.checkInTime) ?? 0,
      }))
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .slice(0, 5);
  }, [attendance]);

  const lineData = useMemo(
    () => ({
      labels: weeklyAttendanceData.labels,
      datasets: [
        {
          label: "Check-ins",
          data: weeklyAttendanceData.values,
          tension: 0.38,
          borderWidth: 3,
          pointRadius: 2.5,
          pointHoverRadius: 5,
          borderColor: "#0f6cbd",
          backgroundColor: "rgba(15,108,189,0.10)",
          fill: true,
        },
      ],
    }),
    [weeklyAttendanceData],
  );

  const chartPalette = useMemo(
    () =>
      theme === "dark"
        ? {
            legend: "#cfd9ee",
            ticks: "#9eabc4",
            grid: "rgba(148,163,184,0.18)",
            centerTitle: "#9eabc4",
            centerValue: "#eef4ff",
            centerSubtitle: "#cfd9ee",
            doughnutBorder: "#1f2937",
          }
        : {
            legend: "#475569",
            ticks: "#64748b",
            grid: "rgba(148,163,184,0.16)",
            centerTitle: "#64748b",
            centerValue: "#0f172a",
            centerSubtitle: "#475569",
            doughnutBorder: "#ffffff",
          },
    [theme],
  );

  const lineOptions = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: { usePointStyle: true, boxWidth: 10, color: chartPalette.legend, padding: 18 },
        },
      },
      scales: {
        x: { ticks: { color: chartPalette.ticks }, grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: { precision: 0, color: chartPalette.ticks },
          grid: { color: chartPalette.grid },
        },
      },
    }),
    [chartPalette],
  );

  const doughnutData = useMemo(
    () => ({
      labels: ["Present", "Late/Other", "Absent"],
      datasets: [
        {
          data: [presentToday, lateToday, absentToday],
          backgroundColor: ["#16a34a", "#d97706", "#dc2626"],
          borderColor: [chartPalette.doughnutBorder, chartPalette.doughnutBorder, chartPalette.doughnutBorder],
          borderWidth: 5,
          spacing: 2,
          borderRadius: 10,
          hoverOffset: 6,
        },
      ],
    }),
    [absentToday, chartPalette.doughnutBorder, lateToday, presentToday],
  );

  const doughnutOptions = useMemo<ChartOptions<"doughnut">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "74%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { usePointStyle: true, boxWidth: 10, color: chartPalette.legend, padding: 16 },
        },
        doughnutCenterText: {
          title: "Present rate",
          value: `${presentPct}%`,
          subtitle: `${presentToday}/${Math.max(1, activeEmployees)}`,
          titleColor: chartPalette.centerTitle,
          valueColor: chartPalette.centerValue,
          subtitleColor: chartPalette.centerSubtitle,
        } as any,
      } as any,
    }),
    [activeEmployees, chartPalette, presentPct, presentToday],
  );

  function runQuickTour() {
    setTourFocus("kpi");
    setTimeout(() => setTourFocus("chip"), 1800);
    setTimeout(() => setTourFocus("chart"), 3600);
    setTimeout(() => setTourFocus(null), 5600);
    setShowWelcome(false);
  }

  if (loading) {
    return (
      <div className="theme-surface mx-auto w-full max-w-7xl rounded-3xl border p-5 backdrop-blur">
        <div className="mb-4">
          <div className="h-6 w-48 rounded bg-slate-200/60 dark:bg-slate-700/60" />
          <div className="mt-2 h-4 w-80 rounded bg-slate-200/40 dark:bg-slate-700/40" />
        </div>
        <TableSkeleton rows={4} columns={4} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <WelcomeModal
        isOpen={showWelcome}
        name={user?.name || "Admin"}
        role={user?.role || "admin"}
        onClose={() => setShowWelcome(false)}
        onQuickTour={runQuickTour}
      />

      <Modal isOpen={!!selectedNotice} title={selectedNotice?.title || "Notice"} onClose={() => setSelectedNotice(null)}>
        {selectedNotice ? (
          <div className="space-y-3 text-sm">
            <p className="whitespace-pre-wrap text-[rgb(var(--text))]">{selectedNotice.body}</p>
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 text-[rgb(var(--text-soft))]">
              <p>
                Priority: <span className="font-semibold text-[rgb(var(--text))]">{selectedNotice.priority}</span>
              </p>
              <p>Starts: {selectedNotice.starts_at ? new Date(selectedNotice.starts_at).toLocaleString() : "-"}</p>
              <p>Ends: {selectedNotice.ends_at ? new Date(selectedNotice.ends_at).toLocaleString() : "-"}</p>
            </div>
          </div>
        ) : null}
      </Modal>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }}>
        <section className="theme-surface rounded-[28px] border p-5 backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="theme-surface-strong grid h-12 w-12 place-items-center rounded-2xl border text-sky-200 shadow-sm">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgb(var(--text-soft))]">Admin Workspace</div>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-[rgb(var(--text))]">Operational overview</h1>
                <p className="mt-1 max-w-2xl text-sm text-[rgb(var(--text-soft))]">
                  Monitor attendance, notices, and activity from a single clean control surface.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <DashboardChip
                pulse={tourFocus === "chip"}
                tooltip="Open audit logs"
                label="System online"
                icon={<Activity className="h-4 w-4" />}
                className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/25 dark:text-emerald-200"
                onClick={() => safeNavigate("/admin/audit-logs")}
              />
              <DashboardChip
                pulse={tourFocus === "chip"}
                tooltip="View all today's attendance"
                label={`Present rate ${presentPct}%`}
                icon={<TrendingUp className="h-4 w-4" />}
                className="border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-200"
                onClick={() => safeNavigate(routeWithQuery("/admin/all-attendance", { filter: "today" }))}
              />
              <DashboardChip
                pulse={tourFocus === "chip"}
                tooltip="Sort attendance by highest fines"
                label={`Fines PKR ${monthFineTotal.toFixed(2)}`}
                icon={<Wallet className="h-4 w-4" />}
                className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/25 dark:text-amber-200"
                onClick={() => safeNavigate(routeWithQuery("/admin/all-attendance", { filter: "month", sort: "fine_desc" }))}
              />
            </div>
          </div>
        </section>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardStatCard
          pulse={tourFocus === "kpi"}
          title="Total Staff"
          value={employees.length}
          subtitle="All employee records"
          icon={<Users className="h-5 w-5" />}
          cardClass="bg-[linear-gradient(180deg,rgba(239,246,255,0.98),rgba(247,251,255,0.94))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-elevated),1),rgba(var(--surface),1))]"
          toneClass="border-sky-300/60 bg-sky-500/12 text-sky-700 dark:border-sky-500/30 dark:text-sky-200"
          onClick={() => safeNavigate("/admin/employees")}
        />
        <DashboardStatCard
          pulse={tourFocus === "kpi"}
          title="Present Today"
          value={presentToday}
          subtitle="Successful check-ins"
          icon={<ShieldCheck className="h-5 w-5" />}
          cardClass="bg-[linear-gradient(180deg,rgba(240,253,244,0.98),rgba(247,252,248,0.94))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-elevated),1),rgba(var(--surface),1))]"
          toneClass="border-emerald-300/60 bg-emerald-500/12 text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-200"
          onClick={() => safeNavigate(routeWithQuery("/admin/all-attendance", { filter: "today", status: "present" }))}
        />
        <DashboardStatCard
          pulse={tourFocus === "kpi"}
          title="Late Arrivals"
          value={lateToday}
          subtitle="Late records today"
          icon={<Clock3 className="h-5 w-5" />}
          cardClass="bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(255,248,240,0.94))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-elevated),1),rgba(var(--surface),1))]"
          toneClass="border-amber-300/60 bg-amber-500/12 text-amber-700 dark:border-amber-500/30 dark:text-amber-200"
          onClick={() => safeNavigate(routeWithQuery("/admin/all-attendance", { filter: "today", lateness: "late" }))}
        />
        <DashboardStatCard
          pulse={tourFocus === "kpi"}
          title="Absent"
          value={absentToday}
          subtitle="Not checked in yet"
          icon={<UserX className="h-5 w-5" />}
          cardClass="bg-[linear-gradient(180deg,rgba(255,241,242,0.98),rgba(255,247,249,0.94))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-elevated),1),rgba(var(--surface),1))]"
          toneClass="border-rose-300/60 bg-rose-500/12 text-rose-700 dark:border-rose-500/30 dark:text-rose-200"
          onClick={() => safeNavigate(routeWithQuery("/admin/all-attendance", { filter: "today", status: "absent" }))}
        />
      </div>

      <Card
        title="Latest Notices"
        subtitle="Top 3 active notices"
        actions={
          <Button variant="secondary" size="sm" onClick={() => safeNavigate("/admin/notices")}>
            Manage Notices
          </Button>
        }
        className="bg-[linear-gradient(180deg,rgba(239,246,255,0.96),rgba(247,251,255,0.94))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-elevated),1),rgba(var(--surface),1))]"
      >
        <ul className="space-y-3">
          {notices.slice(0, 3).length ? (
            notices.slice(0, 3).map((notice) => (
              <li key={notice.id}>
                <button
                  type="button"
                  onClick={() => setSelectedNotice(notice)}
                  className="group w-full rounded-2xl border border-sky-100/80 bg-white/68 px-4 py-3.5 text-left transition hover:bg-white/84 dark:border-[rgb(var(--border))] dark:bg-[rgb(var(--surface-muted))] dark:hover:bg-[rgb(var(--surface-elevated))]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[rgb(var(--text))]">{notice.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[rgb(var(--text-soft))]">{notice.body}</p>
                    </div>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-sky-100/80 bg-white/82 text-slate-500 transition group-hover:text-slate-900 dark:border-[rgb(var(--border))] dark:bg-[rgb(var(--surface-elevated))] dark:text-[rgb(var(--text-soft))] dark:group-hover:text-[rgb(var(--text))]">
                      <Bell className="h-4 w-4" />
                    </span>
                  </div>
                </button>
              </li>
            ))
          ) : (
            <li className="text-sm text-[rgb(var(--text-soft))]">No active notices.</li>
          )}
        </ul>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div
          role="button"
          tabIndex={0}
          onClick={() => safeNavigate(routeWithQuery("/admin/all-attendance", { filter: "week" }))}
          onKeyDown={(event) => onCardKeyDown(event, () => safeNavigate(routeWithQuery("/admin/all-attendance", { filter: "week" })))}
          className={classNames(
            "cursor-pointer rounded-3xl border border-sky-100/80 bg-[linear-gradient(180deg,rgba(239,246,255,0.96),rgba(247,251,255,0.94))] p-5 transition hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(var(--shadow-color),0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 dark:border-[rgb(var(--border))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-elevated),1),rgba(var(--surface),1))]",
            tourFocus === "chart" && "animate-pulse",
          )}
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-[rgb(var(--text))]">Weekly Attendance</h3>
              <p className="text-sm text-[rgb(var(--text-soft))]">Attendance trend across recent dates</p>
            </div>
            <span className="text-sm font-medium text-sky-700 dark:text-sky-300">View details</span>
          </div>
          <div className="h-72 rounded-2xl border border-sky-100/80 bg-white/74 p-4 dark:border-[rgb(var(--border))] dark:bg-[rgb(var(--surface-muted))]">
            <Line data={lineData as any} options={lineOptions} />
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => safeNavigate(routeWithQuery("/admin/all-attendance", { filter: "today" }))}
          onKeyDown={(event) => onCardKeyDown(event, () => safeNavigate(routeWithQuery("/admin/all-attendance", { filter: "today" })))}
          className={classNames(
            "cursor-pointer rounded-3xl border border-violet-100/80 bg-[linear-gradient(180deg,rgba(245,243,255,0.96),rgba(250,247,255,0.94))] p-5 transition hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(var(--shadow-color),0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 dark:border-[rgb(var(--border))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-elevated),1),rgba(var(--surface),1))]",
            tourFocus === "chart" && "animate-pulse",
          )}
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-[rgb(var(--text))]">Daily Breakdown</h3>
              <p className="text-sm text-[rgb(var(--text-soft))]">Present vs late vs absent</p>
            </div>
            <span className="text-sm font-medium text-sky-700 dark:text-sky-300">View details</span>
          </div>
          <div className="h-72 rounded-2xl border border-violet-100/80 bg-white/76 p-4 dark:border-[rgb(var(--border))] dark:bg-[rgb(var(--surface-muted))]">
            <Doughnut data={doughnutData as any} options={doughnutOptions} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          title="Department Performance"
          subtitle="Present rate by department"
          className="bg-[linear-gradient(180deg,rgba(240,253,244,0.96),rgba(247,252,248,0.94))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-elevated),1),rgba(var(--surface),1))]"
        >
          <ul className="space-y-2.5">
            {departmentStats.length ? (
              departmentStats.map((d) => (
                <li
                  key={d.name}
                  className="flex items-center justify-between rounded-2xl border border-emerald-100/80 bg-white/72 px-4 py-3 dark:border-[rgb(var(--border))] dark:bg-[rgb(var(--surface-muted))]"
                >
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-[rgb(var(--text))]">
                    <Building2 className="h-4 w-4 text-[rgb(var(--text-soft))]" />
                    {d.name}
                  </span>
                  <span className="text-sm font-bold text-[rgb(var(--text))]">{d.rate}%</span>
                </li>
              ))
            ) : (
              <li className="text-sm text-[rgb(var(--text-soft))]">No department data.</li>
            )}
          </ul>
        </Card>

        <Card
          title="Recent Activity"
          subtitle="Last 6 audit events"
          actions={
            <Button variant="ghost" size="sm" onClick={() => safeNavigate("/admin/audit-logs")}>
              Open Logs
            </Button>
          }
          className="bg-[linear-gradient(180deg,rgba(255,251,235,0.96),rgba(255,248,240,0.94))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-elevated),1),rgba(var(--surface),1))]"
        >
          <ul className="space-y-2.5">
            {logs.length ? (
              logs.slice(0, 6).map((log) => (
                <li key={log.id}>
                  <button
                    type="button"
                    onClick={() => safeNavigate("/admin/audit-logs")}
                    className="group w-full rounded-2xl border border-amber-100/80 bg-white/72 px-4 py-3 text-left transition hover:bg-white/84 dark:border-[rgb(var(--border))] dark:bg-[rgb(var(--surface-muted))] dark:hover:bg-[rgb(var(--surface-elevated))]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[rgb(var(--text))]">{log.action}</p>
                      <ChevronRight className="h-4 w-4 text-[rgb(var(--text-soft))] group-hover:text-[rgb(var(--text))]" />
                    </div>
                    <p className="mt-1 text-xs text-[rgb(var(--text-soft))]">{new Date(log.ts).toLocaleString()}</p>
                  </button>
                </li>
              ))
            ) : (
              <li className="text-sm text-[rgb(var(--text-soft))]">No activity logs.</li>
            )}
          </ul>
        </Card>

        <Card
          title="Top Latecomers"
          subtitle="Today"
          className="bg-[linear-gradient(180deg,rgba(255,241,242,0.96),rgba(255,247,249,0.94))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-elevated),1),rgba(var(--surface),1))]"
        >
          <ul className="space-y-2.5">
            {topLatecomers.length ? (
              topLatecomers.map((row) => (
                <li key={`${row.employeeId}-${row.checkInTime || "na"}`}>
                  <button
                    type="button"
                    onClick={() => safeNavigate(routeWithQuery("/admin/all-attendance", { filter: "today", lateness: "late" }))}
                    className="w-full rounded-2xl border border-rose-100/80 bg-white/72 px-4 py-3 text-left transition hover:bg-white/84 dark:border-[rgb(var(--border))] dark:bg-[rgb(var(--surface-muted))] dark:hover:bg-[rgb(var(--surface-elevated))]"
                  >
                    <p className="text-sm font-semibold text-[rgb(var(--text))]">{row.name}</p>
                    <p className="mt-1 text-xs text-[rgb(var(--text-soft))]">
                      {row.employeeId} • {row.checkInTime || "-"}
                    </p>
                  </button>
                </li>
              ))
            ) : (
              <li className="text-sm text-[rgb(var(--text-soft))]">No late arrivals.</li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
