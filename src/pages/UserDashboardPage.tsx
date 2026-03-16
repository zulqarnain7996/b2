import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CalendarDays, History, PlayCircle, Bell, TrendingUp, ShieldCheck, ChevronRight } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { apiClient } from "@/services/apiClient";
import type { AttendanceRecord, Notice } from "@/types";

import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

/* ---------------- utils ---------------- */

function classNames(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(" ");
}

function safePct(n: number, d: number) {
  if (!d) return 0;
  return Math.max(0, Math.min(100, Math.round((n / d) * 100)));
}

function niceDate(d: string) {
  // expect YYYY-MM-DD
  try {
    const dt = new Date(d);
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit" }).format(dt);
  } catch {
    return d;
  }
}

/* ---------------- UI blocks ---------------- */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate overflow-hidden rounded-3xl px-4 py-4 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-slate-50 via-sky-50/50 to-slate-100" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.18),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(148,163,184,0.10)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.10)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_top,black_40%,transparent_78%)]" />
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </div>
  );
}

function SurfaceCard(props: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white/75 shadow-sm backdrop-blur ring-1 ring-slate-900/5">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200/60 px-5 py-4">
        <div className="flex items-start gap-3">
          {props.icon ? (
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-900 text-sky-200 shadow-sm">
              {props.icon}
            </span>
          ) : null}
          <div>
            <div className="text-sm font-semibold text-slate-900">{props.title}</div>
            {props.subtitle ? <div className="mt-0.5 text-xs text-slate-500">{props.subtitle}</div> : null}
          </div>
        </div>
        {props.right ? <div className="shrink-0">{props.right}</div> : null}
      </div>
      <div className="px-5 py-5">{props.children}</div>
    </div>
  );
}

function GradientActionCard({
  to,
  title,
  subtitle,
  icon: Icon,
  gradient,
}: {
  to: string;
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  gradient: string;
}) {
  return (
    <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.18 }}>
      <Link
        to={to}
        className={classNames(
          "group relative block overflow-hidden rounded-3xl border border-white/40 shadow-sm",
          gradient,
        )}
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />

        <div className="relative p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-white/80">{title}</div>
              <div className="mt-2 text-base font-bold text-white">{subtitle}</div>
              <div className="mt-2 text-xs text-white/75">Open</div>
            </div>

            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20">
              <Icon className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-white/90">
            Go
            <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="grid h-full place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500">
      {text}
    </div>
  );
}

/* ---------------- Page ---------------- */

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

  const latest7 = useMemo(() => {
    // records might be newest-first. We want oldest->newest for chart.
    const subset = records.slice(0, 7).reverse();
    return subset;
  }, [records]);

  const weeklyConfidence = useMemo(() => {
    const labels = latest7.map((r) => niceDate(r.date));
    const data = latest7.map((r) => {
      const c = Number(((r.confidence ?? 0) * 100).toFixed(1));
      return Number.isFinite(c) ? c : 0;
    });
    return { labels, data };
  }, [latest7]);

  const presentCount = useMemo(
    () => records.filter((r) => String(r.status || "").toLowerCase() === "present").length,
    [records],
  );

  const presentRate = useMemo(() => safePct(presentCount, records.length || 1), [presentCount, records.length]);
  const lateCount = useMemo(() => records.filter((r) => Number(r.fineAmount || 0) > 0).length, [records]);
  const currentMonthFine = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return records
      .filter((r) => String(r.date || "").startsWith(monthKey))
      .reduce((sum, r) => sum + Number(r.fineAmount || 0), 0);
  }, [records]);

  const lineData = useMemo(() => {
    return {
      labels: weeklyConfidence.labels,
      datasets: [
        {
          label: "Confidence %",
          data: weeklyConfidence.data,
          tension: 0.35,
          borderWidth: 3,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderColor: "#0284c7",
          backgroundColor: (ctx: any) => {
            const { chart } = ctx;
            const { ctx: c, chartArea } = chart;
            if (!chartArea) return "rgba(2,132,199,0.12)";
            const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, "rgba(2,132,199,0.22)");
            g.addColorStop(1, "rgba(2,132,199,0.04)");
            return g;
          },
          fill: true,
        },
      ],
    };
  }, [weeklyConfidence.labels, weeklyConfidence.data]);

  const lineOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "bottom" as const,
          labels: { usePointStyle: true, boxWidth: 10, color: "#334155" },
        },
        tooltip: { enabled: true },
      },
      scales: {
        x: { ticks: { color: "#64748b" }, grid: { display: false } },
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { color: "#64748b", callback: (v: any) => `${v}%` },
          grid: { color: "rgba(148,163,184,0.25)" },
        },
      },
    };
  }, []);

  if (!user) return null;

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <div className="rounded-3xl border border-slate-200/70 bg-white/75 p-6 shadow-sm backdrop-blur ring-1 ring-slate-900/5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-900 text-sky-200 shadow-sm">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Face Attendance</div>
                  <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">User Dashboard</h1>
                  <p className="mt-1 text-sm text-slate-500">
                    Quick access to check-in, history, and your confidence trend.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-2xl border border-sky-200/60 bg-sky-50/70 px-4 py-2 text-sm font-semibold text-sky-900">
                  <TrendingUp className="h-4 w-4" />
                  Present rate: {presentRate}%
                </span>
                <span className="inline-flex items-center gap-2 rounded-2xl border border-slate-200/70 bg-slate-50/70 px-4 py-2 text-sm font-semibold text-slate-700">
                  Late/Fine: {lateCount} | Month Fine: PKR {currentMonthFine.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="grid gap-4 md:grid-cols-3"
        >
          <GradientActionCard
            to="/checkin"
            title="Check-in"
            subtitle="Start camera check-in"
            icon={PlayCircle}
            gradient="bg-gradient-to-br from-sky-600 via-blue-600 to-indigo-700"
          />
          <GradientActionCard
            to="/history"
            title="History"
            subtitle="View recent entries"
            icon={History}
            gradient="bg-gradient-to-br from-emerald-500 via-green-600 to-teal-700"
          />
          <GradientActionCard
            to="/monthly-attendance"
            title="Monthly"
            subtitle="Manual attendance"
            icon={CalendarDays}
            gradient="bg-gradient-to-br from-amber-500 via-orange-600 to-rose-600"
          />
        </motion.div>

        {/* Notices + Tips */}
        <div className="grid gap-6 lg:grid-cols-3">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.08 }} className="lg:col-span-2">
            <SurfaceCard
              title="Latest Notices"
              subtitle="Top 3 active notices"
              icon={<Bell className="h-5 w-5" />}
              right={
                <Link
                  to="/notices"
                  className="inline-flex items-center gap-1 rounded-2xl border border-slate-200/70 bg-slate-50/70 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  View all <ChevronRight className="h-4 w-4" />
                </Link>
              }
            >
              {loading ? (
                <div className="space-y-2">
                  <div className="h-16 rounded-2xl bg-slate-200/40" />
                  <div className="h-16 rounded-2xl bg-slate-200/30" />
                  <div className="h-16 rounded-2xl bg-slate-200/25" />
                </div>
              ) : (
                <ul className="space-y-2">
                  {notices.slice(0, 3).length ? (
                    notices.slice(0, 3).map((notice) => (
                      <li
                        key={notice.id}
                        className="group rounded-2xl border border-slate-200/70 bg-white/60 px-4 py-3 transition hover:border-sky-200 hover:bg-sky-50/40"
                      >
                        <p className="text-sm font-semibold text-slate-900">{notice.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">{notice.body}</p>
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-slate-500">No active notices.</li>
                  )}
                </ul>
              )}
            </SurfaceCard>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.1 }}>
            <SurfaceCard title="Tips" subtitle="Better check-in results" icon={<ShieldCheck className="h-5 w-5" />}>
              <ul className="space-y-2 text-sm text-slate-700">
                <li className="rounded-2xl border border-slate-200/70 bg-white/60 px-4 py-3">
                  Keep your face centered and well-lit during check-in.
                </li>
                <li className="rounded-2xl border border-slate-200/70 bg-white/60 px-4 py-3">
                  If camera check-in fails, use Monthly Attendance (manual fallback).
                </li>
                <li className="rounded-2xl border border-slate-200/70 bg-white/60 px-4 py-3">
                  Open History to confirm your entry was recorded.
                </li>
              </ul>
            </SurfaceCard>
          </motion.div>
        </div>

        {/* Chart */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.12 }}>
          <SurfaceCard
            title="Weekly Attendance Confidence"
            subtitle="Based on your last 7 attendance records."
            icon={<TrendingUp className="h-5 w-5" />}
            right={
              <span className="inline-flex items-center gap-2 rounded-2xl border border-sky-200/60 bg-sky-50/70 px-3 py-2 text-xs font-semibold text-sky-900">
                Avg:{" "}
                {weeklyConfidence.data.length
                  ? `${Math.round(
                      weeklyConfidence.data.reduce((a, b) => a + b, 0) / weeklyConfidence.data.length,
                    )}%`
                  : "0%"}
              </span>
            }
          >
            <div className="relative h-80">
              {weeklyConfidence.labels.length ? (
                <div className="h-full rounded-2xl border border-slate-200/70 bg-white/60 p-3">
                  <Line data={lineData as any} options={lineOptions as any} />
                </div>
              ) : (
                <EmptyBox text="No attendance data yet." />
              )}
            </div>
          </SurfaceCard>
        </motion.div>
      </div>
    </Shell>
  );
}
