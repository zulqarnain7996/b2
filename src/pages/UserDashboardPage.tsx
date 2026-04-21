import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChevronRight,
  Clock3,
  History,
  PlayCircle,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { apiClient } from "@/services/apiClient";
import type { AttendanceRecord, Notice } from "@/types";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function safePct(n: number, d: number) {
  if (!d) return 0;
  return Math.max(0, Math.min(100, Math.round((n / d) * 100)));
}

function niceDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
  } catch {
    return value;
  }
}

function niceDateTime(value?: string | null) {
  if (!value) return "No recent activity";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function statusLabel(value?: string | null) {
  if (!value) return "Pending";
  const normalized = String(value).replace(/[_-]/g, " ").trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-surface relative isolate overflow-hidden rounded-[36px] border px-5 py-5 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.10),transparent_34%),radial-gradient(circle_at_92%_0%,rgba(16,185,129,0.08),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,250,255,0.98))] dark:bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_38%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.10),transparent_34%),linear-gradient(180deg,rgba(var(--surface-elevated),0.94),rgba(var(--surface),0.98))]" />
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  icon,
  right,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={classNames(
        "rounded-[28px] border border-slate-200/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,249,255,0.96))] ring-1 ring-slate-100/90 shadow-[0_22px_48px_rgba(148,163,184,0.12)] backdrop-blur transition-all duration-200 dark:border-[rgb(var(--border))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-elevated),0.98),rgba(var(--surface),0.98))] dark:ring-white/5 dark:shadow-none",
        "hover:-translate-y-0.5 hover:shadow-[0_24px_52px_rgba(148,163,184,0.16)] dark:hover:shadow-[0_22px_46px_rgba(var(--shadow-color),0.18)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[rgb(var(--border))] px-5 py-4">
        <div className="flex items-start gap-3">
          {icon ? (
            <span className="grid h-11 w-11 place-items-center rounded-2xl border border-white/80 bg-[linear-gradient(135deg,#f8fbff,#eef4ff)] text-sky-700 shadow-[0_14px_24px_rgba(148,163,184,0.12)] dark:border-[rgb(var(--border))] dark:bg-[rgb(var(--surface-strong))] dark:text-sky-200 dark:shadow-sm">
              {icon}
            </span>
          ) : null}
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-[rgb(var(--text))]">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm leading-6 text-[rgb(var(--text-soft))]">{subtitle}</p> : null}
          </div>
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function MetricChip({
  label,
  value,
  hint,
  tone = "sky",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "sky" | "mint" | "amber" | "rose";
}) {
  const toneStyles = {
    sky: "border-sky-200/80 bg-[linear-gradient(180deg,rgba(243,248,255,0.98),rgba(235,244,255,0.92))]",
    mint: "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(242,252,247,0.98),rgba(235,249,243,0.92))]",
    amber: "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,250,240,0.98),rgba(255,245,228,0.92))]",
    rose: "border-violet-200/80 bg-[linear-gradient(180deg,rgba(249,245,255,0.98),rgba(244,238,255,0.92))]",
  }[tone];

  return (
    <div
      className={classNames(
        "rounded-[22px] border px-4 py-3.5 shadow-[0_14px_30px_rgba(148,163,184,0.10)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(148,163,184,0.14)] dark:border-[rgb(var(--border))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-elevated),0.98),rgba(var(--surface),0.98))] dark:shadow-none",
        toneStyles,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgb(var(--text-soft))]">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-[rgb(var(--text))]">{value}</p>
      <p className="mt-1 text-xs leading-5 text-[rgb(var(--text-soft))]">{hint}</p>
    </div>
  );
}

function SummaryStat({
  title,
  value,
  subtitle,
  tone,
}: {
  title: string;
  value: string;
  subtitle: string;
  tone: "sky" | "emerald" | "amber" | "violet";
}) {
  const toneStyles = {
    sky: "border-sky-200/80 bg-[linear-gradient(180deg,rgba(239,246,255,0.98),rgba(246,250,255,0.94))] dark:border-sky-500/30 dark:bg-[linear-gradient(180deg,rgba(14,116,144,0.18),rgba(var(--surface),0.98))]",
    emerald: "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(240,253,244,0.98),rgba(246,252,248,0.94))] dark:border-emerald-500/30 dark:bg-[linear-gradient(180deg,rgba(5,150,105,0.16),rgba(var(--surface),0.98))]",
    amber: "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(255,247,236,0.94))] dark:border-amber-500/30 dark:bg-[linear-gradient(180deg,rgba(217,119,6,0.18),rgba(var(--surface),0.98))]",
    violet: "border-violet-200/80 bg-[linear-gradient(180deg,rgba(247,244,255,0.98),rgba(251,248,255,0.94))] dark:border-[rgb(var(--border))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-strong),0.76),rgba(var(--surface),0.98))]",
  }[tone];

  return (
    <div
      className={classNames(
        "rounded-[24px] border px-4 py-4 shadow-[0_16px_34px_rgba(148,163,184,0.12)] transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-[0_22px_40px_rgba(148,163,184,0.16)] dark:shadow-none",
        toneStyles,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgb(var(--text-soft))]">{title}</p>
      <p className="mt-2.5 text-[1.65rem] font-semibold tracking-tight text-[rgb(var(--text))]">{value}</p>
      <p className="mt-1 text-sm text-[rgb(var(--text-soft))]">{subtitle}</p>
    </div>
  );
}

function ActionCard({
  to,
  title,
  subtitle,
  icon: Icon,
  accent,
}: {
  to: string;
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  accent: "sky" | "emerald" | "amber";
}) {
  const accentStyles = {
    sky: "from-sky-500/28 via-sky-500/12 to-transparent text-sky-200",
    emerald: "from-emerald-500/28 via-emerald-500/12 to-transparent text-emerald-200",
    amber: "from-amber-500/28 via-amber-500/12 to-transparent text-amber-200",
  }[accent];

  return (
    <Link
      to={to}
      className={classNames(
        "group block rounded-[26px] border border-slate-200/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,249,255,0.95))] p-5 ring-1 ring-slate-100/90 shadow-[0_18px_40px_rgba(148,163,184,0.12)] transition-all duration-200 dark:border-[rgb(var(--border))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-elevated),0.98),rgba(var(--surface),0.98))] dark:ring-white/5 dark:shadow-none",
        "hover:-translate-y-1 hover:shadow-[0_24px_44px_rgba(148,163,184,0.16)] dark:hover:shadow-[0_24px_44px_rgba(var(--shadow-color),0.18)]",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className={classNames("inline-flex rounded-2xl bg-gradient-to-br p-[1px]", accentStyles)}>
            <span className="grid h-11 w-11 place-items-center rounded-2xl border border-white/80 bg-white/88 shadow-[0_12px_24px_rgba(148,163,184,0.12)] dark:border-[rgb(var(--border))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-strong),0.92),rgba(var(--surface-elevated),0.98))] dark:shadow-sm">
              <Icon className="h-5 w-5" />
            </span>
          </div>
          <h3 className="mt-4 text-[1.02rem] font-semibold tracking-tight text-[rgb(var(--text))]">{title}</h3>
          <p className="mt-1.5 text-sm leading-6 text-[rgb(var(--text-soft))]">{subtitle}</p>
        </div>
        <span className="rounded-full border border-slate-200/80 bg-white/84 p-2 text-[rgb(var(--text-soft))] transition-all duration-200 group-hover:border-slate-300/80 group-hover:text-[rgb(var(--text))] dark:border-[rgb(var(--border))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-strong),0.72),rgba(var(--surface-muted),0.98))]">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[rgb(var(--text-soft))] transition-colors group-hover:text-[rgb(var(--text))]">
        Open
        <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function NoticeItem({ notice }: { notice: Notice }) {
  return (
    <li className="rounded-[22px] border border-slate-200/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,250,255,0.9))] px-4 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(148,163,184,0.12)] dark:border-[rgb(var(--border))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-muted),0.98),rgba(var(--surface),0.98))] dark:hover:bg-[linear-gradient(180deg,rgba(var(--surface-strong),0.7),rgba(var(--surface-elevated),0.98))]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight text-[rgb(var(--text))]">{notice.title}</p>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-[rgb(var(--text-soft))]">{notice.body}</p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-200/80 bg-white/84 px-2.5 py-1 text-[11px] font-medium text-[rgb(var(--text-soft))] dark:border-[rgb(var(--border))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-strong),0.7),rgba(var(--surface-muted),0.98))]">
          Notice
        </span>
      </div>
    </li>
  );
}

function ActivityItem({ record }: { record: AttendanceRecord }) {
  return (
    <li className="rounded-[22px] border border-slate-200/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,250,255,0.9))] px-4 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(148,163,184,0.12)] dark:border-[rgb(var(--border))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-muted),0.98),rgba(var(--surface),0.98))] dark:hover:bg-[linear-gradient(180deg,rgba(var(--surface-strong),0.7),rgba(var(--surface-elevated),0.98))]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-tight text-[rgb(var(--text))]">{statusLabel(record.status)}</p>
          <p className="mt-1 text-sm text-[rgb(var(--text-soft))]">
            {record.checkInTime || "No check-in time"} on {niceDate(record.date)}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-200/80 bg-white/84 px-2.5 py-1 text-[11px] font-medium text-[rgb(var(--text-soft))] dark:border-[rgb(var(--border))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-strong),0.7),rgba(var(--surface-muted),0.98))]">
          {record.fineAmount > 0 ? `PKR ${record.fineAmount.toFixed(0)}` : "On time"}
        </span>
      </div>
    </li>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="grid h-full min-h-[260px] place-items-center rounded-[24px] border border-dashed border-slate-200/90 bg-white/68 text-sm text-[rgb(var(--text-soft))] dark:border-[rgb(var(--border))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-muted),0.98),rgba(var(--surface),0.98))]">
      {text}
    </div>
  );
}

export function UserDashboardPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const [hist, ntc] = await Promise.all([
          apiClient.getMyHistory().catch(() => ({ records: [] as AttendanceRecord[] })),
          apiClient.getNotices().catch(() => ({ notices: [] as Notice[] })),
        ]);
        if (!mounted) return;
        setRecords(hist.records || []);
        setNotices(ntc.notices || []);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [user]);

  const presentCount = useMemo(
    () => records.filter((row) => String(row.status || "").toLowerCase() === "present").length,
    [records],
  );
  const lateCount = useMemo(() => records.filter((row) => Number(row.fineAmount || 0) > 0).length, [records]);
  const presentRate = useMemo(() => safePct(presentCount, records.length || 1), [presentCount, records.length]);
  const currentMonthFine = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return records
      .filter((row) => String(row.date || "").startsWith(monthKey))
      .reduce((sum, row) => sum + Number(row.fineAmount || 0), 0);
  }, [records]);
  const latestRecord = records[0] ?? null;
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayRecord = useMemo(() => records.find((row) => row.date === todayKey) ?? null, [records, todayKey]);
  const todayStatus = todayRecord ? statusLabel(todayRecord.status) : "Pending";
  const recentActivity = useMemo(() => records.slice(0, 4), [records]);
  const attendanceRate = `${presentRate}%`;
  const lastCheckInValue = latestRecord?.checkInTime || "No record";
  const helpfulLine = todayRecord
    ? "Your latest attendance details are ready. Use the quick actions below for the next step."
    : "You have not checked in today yet. Start from the quick actions below when you're ready.";

  if (!user) return null;

  return (
    <Shell>
      <div className="space-y-5">
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24 }}
          className="relative overflow-hidden rounded-[32px] border border-slate-200/85 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(244,248,255,0.95))] p-5 ring-1 ring-slate-100/90 shadow-[0_24px_56px_rgba(148,163,184,0.14)] dark:border-[rgb(var(--border))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-elevated),0.98),rgba(var(--surface),0.98))] dark:ring-white/5 dark:shadow-none sm:p-6"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_34%),radial-gradient(circle_at_92%_8%,rgba(16,185,129,0.10),transparent_24%)] dark:hidden" />
          <div className="relative grid gap-5 xl:grid-cols-[1.25fr_0.95fr] xl:items-stretch">
            <div className="flex flex-col justify-between">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-sky-300/45 bg-sky-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-200">
                <Sparkles className="h-3.5 w-3.5" />
                Daily workspace
              </div>
              <div className="mt-4">
                <p className="text-sm font-medium text-[rgb(var(--text-soft))]">Welcome back, {user.name}</p>
                <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.04em] text-[rgb(var(--text))]">Your workday overview</h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-[rgb(var(--text-soft))]">{helpfulLine}</p>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <MetricChip
                  label="Last Check-In"
                  value={lastCheckInValue}
                  hint={latestRecord ? niceDateTime(latestRecord.createdAt) : "No recent activity"}
                  tone="sky"
                />
                <MetricChip
                  label="Month Fine"
                  value={`PKR ${currentMonthFine.toFixed(2)}`}
                  hint="Current month's fixed fine total"
                  tone="amber"
                />
                <MetricChip
                  label="Attendance Rate"
                  value={attendanceRate}
                  hint={`${presentCount} present out of ${records.length} records`}
                  tone="mint"
                />
              </div>
            </div>

            <div className="rounded-[28px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(244,248,255,0.92))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_18px_36px_rgba(148,163,184,0.10)] dark:border-[rgb(var(--border))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-muted),0.98),rgba(var(--surface),0.98))] dark:shadow-none">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgb(var(--text-soft))]">Today Status</p>
                  <p className="mt-2 text-[1.9rem] font-semibold tracking-[-0.04em] text-[rgb(var(--text))]">{todayStatus}</p>
                  <p className="mt-2 text-sm leading-6 text-[rgb(var(--text-soft))]">
                    {todayRecord ? `Recorded on ${niceDate(todayRecord.date)}` : "No attendance recorded for today yet."}
                  </p>
                </div>
                <span className="grid h-14 w-14 place-items-center rounded-[20px] border border-sky-200/80 bg-[linear-gradient(135deg,#eef4ff,#dbeafe)] text-sky-700 shadow-[0_14px_28px_rgba(148,163,184,0.12)] dark:border-[rgb(var(--border))] dark:bg-[rgb(var(--surface-strong))] dark:text-sky-200 dark:shadow-none">
                  <Clock3 className="h-6 w-6" />
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[22px] border border-emerald-200/80 bg-[linear-gradient(180deg,rgba(240,253,244,0.98),rgba(246,252,248,0.92))] px-4 py-3 dark:border-[rgb(var(--border))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-strong),0.76),rgba(var(--surface),0.98))]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgb(var(--text-soft))]">Last Check-In</p>
                  <p className="mt-2 text-lg font-semibold text-[rgb(var(--text))]">{lastCheckInValue}</p>
                </div>
                <div className="rounded-[22px] border border-violet-200/80 bg-[linear-gradient(180deg,rgba(247,244,255,0.98),rgba(251,248,255,0.92))] px-4 py-3 dark:border-[rgb(var(--border))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-strong),0.76),rgba(var(--surface),0.98))]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgb(var(--text-soft))]">Records</p>
                  <p className="mt-2 text-lg font-semibold text-[rgb(var(--text))]">{records.length}</p>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.04 }}
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
        >
          <SummaryStat title="Today Status" value={todayStatus} subtitle={todayRecord ? `Checked in ${todayRecord.checkInTime || "today"}` : "Not checked in yet"} tone="sky" />
          <SummaryStat title="Last Check-In" value={lastCheckInValue} subtitle={latestRecord ? niceDate(latestRecord.date) : "No history yet"} tone="emerald" />
          <SummaryStat title="Month Fine" value={`PKR ${currentMonthFine.toFixed(0)}`} subtitle="Current month total" tone="amber" />
          <SummaryStat title="Attendance Rate" value={attendanceRate} subtitle={`${presentCount} present records`} tone="violet" />
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.08 }}
          className="grid gap-4 lg:grid-cols-3"
        >
          <ActionCard
            to="/checkin"
            title="Start Check-In"
            subtitle="Open the current camera workflow and record today's attendance."
            icon={PlayCircle}
            accent="sky"
          />
          <ActionCard
            to="/history"
            title="Review History"
            subtitle="Review recent entries, attendance status, evidence, and fines."
            icon={History}
            accent="emerald"
          />
          <ActionCard
            to="/monthly-attendance"
            title="Monthly Attendance"
            subtitle="Open your calendar view and review the month's attendance records."
            icon={CalendarDays}
            accent="amber"
          />
        </motion.section>

        <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, delay: 0.12 }}>
            <Panel
              title="Latest Notices"
              subtitle="Current announcements relevant to your day-to-day work."
              icon={<Bell className="h-5 w-5" />}
              right={
                <Link
                  to="/notices"
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/84 px-3 py-2 text-xs font-medium text-[rgb(var(--text-soft))] transition-all duration-200 hover:-translate-y-0.5 hover:text-[rgb(var(--text))] dark:border-[rgb(var(--border))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-strong),0.7),rgba(var(--surface-muted),0.98))]"
                >
                  View all
                  <ChevronRight className="h-4 w-4" />
                </Link>
              }
            >
              {loading ? (
                <div className="space-y-3">
                  <div className="h-[76px] rounded-[22px] bg-slate-100/90 dark:bg-[linear-gradient(180deg,rgba(var(--surface-strong),0.74),rgba(var(--surface-muted),0.98))]" />
                  <div className="h-[76px] rounded-[22px] bg-slate-100/80 dark:bg-[linear-gradient(180deg,rgba(var(--surface-strong),0.68),rgba(var(--surface-muted),0.96))]" />
                  <div className="h-[76px] rounded-[22px] bg-slate-100/70 dark:bg-[linear-gradient(180deg,rgba(var(--surface-strong),0.62),rgba(var(--surface-muted),0.94))]" />
                </div>
              ) : notices.slice(0, 3).length ? (
                <ul className="space-y-3">
                  {notices.slice(0, 3).map((notice) => (
                    <NoticeItem key={notice.id} notice={notice} />
                  ))}
                </ul>
              ) : (
                <EmptyBox text="No active notices right now." />
              )}
            </Panel>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, delay: 0.16 }}>
            <Panel
              title="Recent Activity"
              subtitle="Your latest recorded attendance actions."
              icon={<Activity className="h-5 w-5" />}
              right={
                <span className="inline-flex items-center gap-2 rounded-full border border-violet-200/75 bg-violet-50/85 px-3 py-2 text-xs font-medium text-violet-900 dark:border-[rgb(var(--border))] dark:bg-[linear-gradient(180deg,rgba(var(--surface-strong),0.7),rgba(var(--surface-muted),0.98))] dark:text-[rgb(var(--text-soft))]">
                  <WalletCards className="h-3.5 w-3.5" />
                  {lateCount} with fines
                </span>
              }
            >
              {recentActivity.length ? (
                <ul className="space-y-3">
                  {recentActivity.map((record) => (
                    <ActivityItem key={record.id} record={record} />
                  ))}
                </ul>
              ) : (
                <EmptyBox text="No recent attendance activity yet." />
              )}
            </Panel>
          </motion.div>
        </div>
      </div>
    </Shell>
  );
}
