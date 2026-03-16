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
import { Activity, Bell, Building2, ChevronRight, Clock3, ShieldCheck, TrendingUp, UserX, Users, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { WelcomeModal } from "@/components/dashboard/WelcomeModal";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
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

function ClickableStatCard(props: {
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ReactNode;
  gradient: string;
  onClick: () => void;
  pulse?: boolean;
}) {
  return (
    <motion.div whileHover={{ y: -4, scale: 1.01 }} transition={{ duration: 0.16 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={props.onClick}
        onKeyDown={(event) => onCardKeyDown(event, props.onClick)}
        className={classNames(
          "relative cursor-pointer overflow-hidden rounded-3xl border border-white/35 p-5 text-white shadow-md transition duration-200 hover:shadow-[0_18px_40px_-22px_rgba(2,132,199,0.58)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300",
          props.gradient,
          props.pulse && "animate-pulse",
        )}
      >
        <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/80">{props.title}</p>
            <p className="mt-2 text-3xl font-extrabold">{props.value}</p>
            <p className="mt-2 text-sm text-white/85">{props.subtitle}</p>
          </div>
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25">{props.icon}</div>
        </div>
        <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-white/95">
          View details <ChevronRight className="h-4 w-4" />
        </div>
      </div>
    </motion.div>
  );
}

function ClickableChip(props: {
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
        "inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300",
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
    const cfg = anyPlugins?.doughnutCenterText as { title?: string; value?: string; subtitle?: string } | undefined;
    if (!cfg?.value) return;

    const centerX = (chartArea.left + chartArea.right) / 2;
    const centerY = (chartArea.top + chartArea.bottom) / 2;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (cfg.title) {
      ctx.fillStyle = "#64748b";
      ctx.font = "600 11px ui-sans-serif, system-ui, -apple-system";
      ctx.fillText(cfg.title, centerX, centerY - 18);
    }
    ctx.fillStyle = "#0f172a";
    ctx.font = "800 28px ui-sans-serif, system-ui, -apple-system";
    ctx.fillText(cfg.value, centerX, centerY + 2);

    if (cfg.subtitle) {
      ctx.fillStyle = "#475569";
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
      if (attendance.some((a) => a.employeeId === e.id && String(a.status).toLowerCase() === "present")) row.present += 1;
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

  const lineData = useMemo(() => ({
    labels: weeklyAttendanceData.labels,
    datasets: [
      {
        label: "Check-ins",
        data: weeklyAttendanceData.values,
        tension: 0.38,
        borderWidth: 3,
        pointRadius: 3,
        pointHoverRadius: 6,
        borderColor: "#0284c7",
        backgroundColor: "rgba(2,132,199,0.20)",
        fill: true,
      },
    ],
  }), [weeklyAttendanceData]);

  const lineOptions = useMemo<ChartOptions<"line">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: "bottom", labels: { usePointStyle: true, boxWidth: 10, color: "#334155", padding: 18 } },
    },
    scales: {
      x: { ticks: { color: "#64748b" }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { precision: 0, color: "#64748b" }, grid: { color: "rgba(148,163,184,0.22)" } },
    },
  }), []);

  const doughnutData = useMemo(() => ({
    labels: ["Present", "Late/Other", "Absent"],
    datasets: [
      {
        data: [presentToday, lateToday, absentToday],
        backgroundColor: ["#22c55e", "#f59e0b", "#ef4444"],
        borderColor: ["#ffffff", "#ffffff", "#ffffff"],
        borderWidth: 6,
        spacing: 3,
        borderRadius: 12,
        hoverOffset: 8,
      },
    ],
  }), [presentToday, lateToday, absentToday]);

  const doughnutOptions = useMemo<ChartOptions<"doughnut">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: "72%",
    plugins: {
      legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 10, color: "#334155", padding: 16 } },
      doughnutCenterText: {
        title: "Present rate",
        value: `${presentPct}%`,
        subtitle: `${presentToday}/${Math.max(1, activeEmployees)}`,
      } as any,
    } as any,
  }), [presentPct, presentToday, activeEmployees]);

  function runQuickTour() {
    setTourFocus("kpi");
    setTimeout(() => setTourFocus("chip"), 1800);
    setTimeout(() => setTourFocus("chart"), 3600);
    setTimeout(() => setTourFocus(null), 5600);
    setShowWelcome(false);
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-7xl rounded-3xl border border-slate-200/70 bg-white/75 p-5 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/50">
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
            <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 text-[rgb(var(--muted))]">
              <p>Priority: <span className="font-semibold text-[rgb(var(--text))]">{selectedNotice.priority}</span></p>
              <p>Starts: {selectedNotice.starts_at ? new Date(selectedNotice.starts_at).toLocaleString() : "-"}</p>
              <p>Ends: {selectedNotice.ends_at ? new Date(selectedNotice.ends_at).toLocaleString() : "-"}</p>
            </div>
          </div>
        ) : null}
      </Modal>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }}>
        <Card className="bg-white/75 backdrop-blur dark:bg-slate-900/45">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-900 text-sky-200 shadow-sm">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">IVS</div>
                <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[rgb(var(--text))]">Admin Dashboard</h1>
                <p className="mt-1 text-sm text-[rgb(var(--muted))]">Quick actions, attendance health, and audit visibility.</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <ClickableChip
                pulse={tourFocus === "chip"}
                tooltip="Open audit logs"
                label="System Online"
                icon={<Activity className="h-4 w-4" />}
                className="border-sky-200/60 bg-sky-50/70 text-sky-900 dark:border-sky-400/30 dark:bg-sky-900/30 dark:text-sky-100"
                onClick={() => safeNavigate("/admin/audit-logs")}
              />
              <ClickableChip
                pulse={tourFocus === "chip"}
                tooltip="View all today's attendance"
                label={`Present rate: ${presentPct}%`}
                icon={<TrendingUp className="h-4 w-4" />}
                className="border-slate-200/70 bg-slate-50/70 text-slate-700 dark:border-slate-600/60 dark:bg-slate-800/60 dark:text-slate-200"
                onClick={() => safeNavigate(routeWithQuery("/admin/all-attendance", { filter: "today" }))}
              />
              <ClickableChip
                pulse={tourFocus === "chip"}
                tooltip="Sort attendance by highest fines"
                label={`Fine Today/Month: PKR ${totalFineToday.toFixed(2)} / ${monthFineTotal.toFixed(2)}`}
                icon={<Wallet className="h-4 w-4" />}
                className="border-rose-200/70 bg-rose-50/70 text-rose-700 dark:border-rose-500/40 dark:bg-rose-950/30 dark:text-rose-200"
                onClick={() => safeNavigate(routeWithQuery("/admin/all-attendance", { filter: "month", sort: "fine_desc" }))}
              />
            </div>
          </div>
        </Card>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ClickableStatCard
          pulse={tourFocus === "kpi"}
          title="Total Staff"
          value={employees.length}
          subtitle="All employees"
          icon={<Users className="h-5 w-5" />}
          gradient="bg-gradient-to-br from-sky-600 via-blue-600 to-indigo-700"
          onClick={() => safeNavigate("/admin/employees")}
        />
        <ClickableStatCard
          pulse={tourFocus === "kpi"}
          title="Present Today"
          value={presentToday}
          subtitle="Marked present"
          icon={<ShieldCheck className="h-5 w-5" />}
          gradient="bg-gradient-to-br from-emerald-500 via-green-600 to-teal-700"
          onClick={() => safeNavigate(routeWithQuery("/admin/all-attendance", { filter: "today", status: "present" }))}
        />
        <ClickableStatCard
          pulse={tourFocus === "kpi"}
          title="Late Arrivals"
          value={lateToday}
          subtitle="Late records today"
          icon={<Clock3 className="h-5 w-5" />}
          gradient="bg-gradient-to-br from-amber-500 via-orange-600 to-rose-600"
          onClick={() => safeNavigate(routeWithQuery("/admin/all-attendance", { filter: "today", lateness: "late" }))}
        />
        <ClickableStatCard
          pulse={tourFocus === "kpi"}
          title="Absent"
          value={absentToday}
          subtitle="Not checked in yet"
          icon={<UserX className="h-5 w-5" />}
          gradient="bg-gradient-to-br from-rose-500 via-red-600 to-fuchsia-700"
          onClick={() => safeNavigate(routeWithQuery("/admin/all-attendance", { filter: "today", status: "absent" }))}
        />
      </div>

      <Card
        title="Latest Notices"
        subtitle="Top 3 active notices"
        actions={<Button variant="secondary" size="sm" onClick={() => safeNavigate("/admin/notices")}>Manage Notices</Button>}
      >
        <ul className="space-y-2">
          {notices.slice(0, 3).length ? (
            notices.slice(0, 3).map((notice) => (
              <li key={notice.id}>
                <button
                  type="button"
                  onClick={() => setSelectedNotice(notice)}
                  className="group w-full rounded-2xl border border-slate-200/70 bg-white/60 px-4 py-3 text-left transition hover:border-sky-300 hover:bg-sky-50/50 dark:border-slate-700/60 dark:bg-slate-900/40 dark:hover:border-sky-500/50 dark:hover:bg-sky-950/25"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-[rgb(var(--text))]">{notice.title}</p>
                    <Bell className="h-4 w-4 text-[rgb(var(--muted))] group-hover:text-sky-500" />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-[rgb(var(--muted))]">{notice.body}</p>
                </button>
              </li>
            ))
          ) : (
            <li className="text-sm text-[rgb(var(--muted))]">No active notices.</li>
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
            "lg:col-span-2 cursor-pointer rounded-3xl border border-slate-200/70 bg-white/75 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 dark:border-slate-700/60 dark:bg-slate-900/45",
            tourFocus === "chart" && "animate-pulse",
          )}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[rgb(var(--text))]">Weekly Attendance</h3>
              <p className="text-xs text-[rgb(var(--muted))]">Attendance trend across recent dates</p>
            </div>
            <span className="text-sm font-medium text-sky-600">View details</span>
          </div>
          <div className="h-72 rounded-2xl border border-slate-200/70 bg-white/60 p-3 dark:border-slate-700/60 dark:bg-slate-900/50">
            <Line data={lineData as any} options={lineOptions} />
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => safeNavigate(routeWithQuery("/admin/all-attendance", { filter: "today" }))}
          onKeyDown={(event) => onCardKeyDown(event, () => safeNavigate(routeWithQuery("/admin/all-attendance", { filter: "today" })))}
          className={classNames(
            "cursor-pointer rounded-3xl border border-slate-200/70 bg-white/75 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 dark:border-slate-700/60 dark:bg-slate-900/45",
            tourFocus === "chart" && "animate-pulse",
          )}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[rgb(var(--text))]">Daily Breakdown</h3>
              <p className="text-xs text-[rgb(var(--muted))]">Present vs late vs absent</p>
            </div>
            <span className="text-sm font-medium text-sky-600">View details</span>
          </div>
          <div className="h-72 rounded-2xl border border-slate-200/70 bg-white/60 p-3 dark:border-slate-700/60 dark:bg-slate-900/50">
            <Doughnut data={doughnutData as any} options={doughnutOptions} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Department Performance" subtitle="Present rate by department">
          <ul className="space-y-2">
            {departmentStats.length ? (
              departmentStats.map((d) => (
                <li key={d.name} className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/60 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-900/40">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-[rgb(var(--text))]">
                    <Building2 className="h-4 w-4 text-[rgb(var(--muted))]" />
                    {d.name}
                  </span>
                  <span className="text-sm font-extrabold text-[rgb(var(--text))]">{d.rate}%</span>
                </li>
              ))
            ) : (
              <li className="text-sm text-[rgb(var(--muted))]">No department data.</li>
            )}
          </ul>
        </Card>

        <Card
          title="Recent Activity"
          subtitle="Last 6 audit events"
          actions={<Button variant="ghost" size="sm" onClick={() => safeNavigate("/admin/audit-logs")}>Open Logs</Button>}
        >
          <ul className="space-y-2">
            {logs.length ? (
              logs.slice(0, 6).map((log) => (
                <li key={log.id}>
                  <button
                    type="button"
                    onClick={() => safeNavigate("/admin/audit-logs")}
                    className="group w-full rounded-2xl border border-slate-200/70 bg-white/60 px-4 py-3 text-left transition hover:border-sky-300 hover:bg-sky-50/50 dark:border-slate-700/60 dark:bg-slate-900/40 dark:hover:border-sky-500/50 dark:hover:bg-sky-950/25"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[rgb(var(--text))]">{log.action}</p>
                      <ChevronRight className="h-4 w-4 text-[rgb(var(--muted))] group-hover:text-sky-500" />
                    </div>
                    <p className="mt-1 text-xs text-[rgb(var(--muted))]">{new Date(log.ts).toLocaleString()}</p>
                  </button>
                </li>
              ))
            ) : (
              <li className="text-sm text-[rgb(var(--muted))]">No activity logs.</li>
            )}
          </ul>
        </Card>

        <Card title="Top Latecomers" subtitle="Today">
          <ul className="space-y-2">
            {topLatecomers.length ? (
              topLatecomers.map((row) => (
                <li key={`${row.employeeId}-${row.checkInTime || "na"}`}>
                  <button
                    type="button"
                    onClick={() => safeNavigate(routeWithQuery("/admin/all-attendance", { filter: "today", lateness: "late" }))}
                    className="w-full rounded-2xl border border-slate-200/70 bg-white/60 px-4 py-3 text-left transition hover:border-sky-300 hover:bg-sky-50/50 dark:border-slate-700/60 dark:bg-slate-900/40 dark:hover:border-sky-500/50 dark:hover:bg-sky-950/25"
                  >
                    <p className="text-sm font-semibold text-[rgb(var(--text))]">{row.name}</p>
                    <p className="mt-1 text-xs text-[rgb(var(--muted))]">
                      {row.employeeId} • {row.checkInTime || "-"}
                    </p>
                  </button>
                </li>
              ))
            ) : (
              <li className="text-sm text-[rgb(var(--muted))]">No late arrivals.</li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
