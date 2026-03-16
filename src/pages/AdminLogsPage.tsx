import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, Copy, Download, FilterX, RefreshCcw, Search, ShieldCheck, UserRound } from "lucide-react";
import { useToast } from "@/components/feedback/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { apiClient } from "@/services/apiClient";
import type { AuditLog } from "@/types";

type DatePreset = "today" | "7d" | "30d";

const PAGE_SIZE = 14;
const DETAILS_KEY_ORDER = ["employeeId", "noticeId", "confidence", "lateMinutes", "fineAmount"];

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: "-", time: "-" };
  return {
    date: parsed.toLocaleDateString(),
    time: parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

function toComparableDay(value: Date) {
  return `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
}

function parseLogDetails(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function toCsv(logs: AuditLog[]) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = ["id,timestamp,actor,action,details"];
  for (const log of logs) {
    lines.push([esc(log.id), esc(log.ts), esc(log.actor), esc(log.action), esc(log.details)].join(","));
  }
  return lines.join("\n");
}

function downloadCsv(name: string, data: string) {
  const blob = new Blob([data], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone: "blue" | "emerald" | "amber" | "violet";
}) {
  const toneClass =
    tone === "blue"
      ? "from-blue-500/10 to-cyan-500/10 border-blue-200/70 dark:border-blue-400/20"
      : tone === "emerald"
        ? "from-emerald-500/10 to-lime-500/10 border-emerald-200/70 dark:border-emerald-400/20"
        : tone === "amber"
          ? "from-amber-500/10 to-orange-500/10 border-amber-200/70 dark:border-amber-400/20"
          : "from-violet-500/10 to-indigo-500/10 border-violet-200/70 dark:border-violet-400/20";

  return (
    <Card className={`bg-gradient-to-br ${toneClass}`}>
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[rgb(var(--muted))]">{label}</p>
        <p className="text-2xl font-bold text-[rgb(var(--text))]">{value}</p>
        {hint ? <p className="text-xs text-[rgb(var(--muted))]">{hint}</p> : null}
      </div>
    </Card>
  );
}

function LogDetailsChip({ label, value }: { label: string; value: unknown }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2.5 py-1 text-xs text-[rgb(var(--text))]">
      <span className="font-semibold text-[rgb(var(--muted))]">{label}:</span>
      <span className="font-medium">{String(value)}</span>
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-blue-200/80 bg-blue-100/70 px-2.5 py-1 text-xs font-semibold text-blue-800 dark:border-blue-400/30 dark:bg-blue-900/40 dark:text-blue-100">
      {action}
    </span>
  );
}

function LogDetailsCell({ details }: { details: string }) {
  const toast = useToast();
  const parsed = parseLogDetails(details);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(parsed ? JSON.stringify(parsed, null, 2) : details);
      toast.success("Details copied.");
    } catch {
      toast.error("Copy failed.");
    }
  }

  if (!parsed) {
    return (
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-[rgb(var(--text))]">{details}</p>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-lg p-1.5 text-[rgb(var(--muted))] hover:bg-[color-mix(in_srgb,rgb(var(--surface))_88%,rgb(var(--text)))]"
          aria-label="Copy details"
          title="Copy details"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const orderedKeys = [
    ...DETAILS_KEY_ORDER.filter((k) => Object.prototype.hasOwnProperty.call(parsed, k)),
    ...Object.keys(parsed).filter((k) => !DETAILS_KEY_ORDER.includes(k)),
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {orderedKeys.slice(0, 7).map((key) => (
            <LogDetailsChip key={key} label={key} value={parsed[key]} />
          ))}
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-lg p-1.5 text-[rgb(var(--muted))] hover:bg-[color-mix(in_srgb,rgb(var(--surface))_88%,rgb(var(--text)))]"
          aria-label="Copy details JSON"
          title="Copy details JSON"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
      <pre className="overflow-x-auto rounded-xl border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--surface))_92%,rgb(var(--text)))] p-2 text-xs text-[rgb(var(--muted))]">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    </div>
  );
}

export function AdminLogsPage() {
  const toast = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("30d");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const debouncedSearch = useDebouncedValue(search, 250);

  const actionOptions = useMemo(() => {
    return Array.from(new Set(logs.map((log) => log.action).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayKey = toComparableDay(now);

    return logs.filter((log) => {
      if (q) {
        const source = `${log.actor} ${log.action} ${log.details}`.toLowerCase();
        if (!source.includes(q)) return false;
      }

      if (actionFilter !== "all" && log.action !== actionFilter) return false;

      const ts = new Date(log.ts);
      if (Number.isNaN(ts.getTime())) return false;
      if (datePreset === "today") return toComparableDay(ts) === todayKey;
      if (datePreset === "7d") return ts >= new Date(startToday.getTime() - 6 * 24 * 60 * 60 * 1000);
      return ts >= new Date(startToday.getTime() - 29 * 24 * 60 * 60 * 1000);
    });
  }, [actionFilter, datePreset, debouncedSearch, logs]);

  const visibleLogs = useMemo(() => filteredLogs.slice(0, visibleCount), [filteredLogs, visibleCount]);
  const hasMore = visibleCount < filteredLogs.length;

  const summary = useMemo(() => {
    const uniqueActors = new Set(logs.map((log) => log.actor.trim().toLowerCase()).filter(Boolean)).size;
    const lastTs = logs
      .map((log) => new Date(log.ts))
      .filter((d) => !Number.isNaN(d.getTime()))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    const now = new Date();
    const todayKey = toComparableDay(now);
    const todayActions = logs.filter((log) => {
      const ts = new Date(log.ts);
      return !Number.isNaN(ts.getTime()) && toComparableDay(ts) === todayKey;
    }).length;

    return {
      totalEvents: logs.length,
      uniqueActors,
      lastEvent: lastTs ? lastTs.toLocaleString() : "-",
      actionsToday: todayActions,
      showActionsToday: logs.some((log) => !Number.isNaN(new Date(log.ts).getTime())),
    };
  }, [logs]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedSearch, actionFilter, datePreset, logs.length]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.getLogs();
      setLogs(res.logs);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load logs";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setActionFilter("all");
    setDatePreset("30d");
  }

  function exportCsv() {
    const csv = toCsv(filteredLogs);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadCsv(`audit-logs-${stamp}.csv`, csv);
    toast.success(`Exported ${filteredLogs.length} rows.`);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <PageHeader
        title="Audit Logs"
        subtitle="Security & activity timeline"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={load}>
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
            <Button variant="secondary" onClick={exportCsv} disabled={!filteredLogs.length}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        }
      />

      <div className={`grid gap-3 ${summary.showActionsToday ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        <StatCard label="Total events" value={summary.totalEvents} hint="Current loaded" tone="blue" />
        <StatCard label="Unique actors" value={summary.uniqueActors} hint="Distinct users" tone="emerald" />
        <StatCard label="Last event" value={summary.lastEvent} hint="Most recent timestamp" tone="amber" />
        {summary.showActionsToday ? <StatCard label="Actions today" value={summary.actionsToday} tone="violet" /> : null}
      </div>

      <Card>
        <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_220px_220px_auto] lg:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--muted))]" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search actor, action, details"
              className="pl-9"
            />
          </div>

          <select
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value)}
            className="h-10 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 text-sm text-[rgb(var(--text))] shadow-sm outline-none transition focus:border-[rgb(var(--primary))] focus:ring-4 focus:ring-[rgb(var(--primary))]/20"
          >
            <option value="all">All actions</option>
            {actionOptions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>

          <select
            value={datePreset}
            onChange={(event) => setDatePreset(event.target.value as DatePreset)}
            className="h-10 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 text-sm text-[rgb(var(--text))] shadow-sm outline-none transition focus:border-[rgb(var(--primary))] focus:ring-4 focus:ring-[rgb(var(--primary))]/20"
          >
            <option value="today">Today</option>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
          </select>

          <Button variant="ghost" onClick={clearFilters}>
            <FilterX className="h-4 w-4" />
            Clear filters
          </Button>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="inline-flex items-center gap-2 text-sm text-[rgb(var(--muted))]">
            <Spinner /> Loading logs...
          </div>
        ) : null}

        {error ? <Alert variant="error">{error}</Alert> : null}

        {!loading && !error && !logs.length ? (
          <EmptyState title="No logs available" message="Logs will appear as actions are performed in the system." />
        ) : null}

        {!loading && !!logs.length && !filteredLogs.length ? (
          <EmptyState title="No matching logs" message="Adjust filters to see activity entries." />
        ) : null}

        {!!visibleLogs.length ? (
          <div className="space-y-3">
            {visibleLogs.map((log) => {
              const stamp = formatDateTime(log.ts);
              return (
                <article
                  key={log.id}
                  className="grid gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 transition hover:border-[rgb(var(--primary))]/40 hover:bg-[color-mix(in_srgb,rgb(var(--surface))_90%,rgb(var(--text)))] md:grid-cols-[180px_minmax(180px,240px)_1fr]"
                >
                  <div className="space-y-1 rounded-xl border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--surface))_92%,rgb(var(--text)))] px-3 py-2">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
                      <Clock3 className="h-3.5 w-3.5" />
                      Event time
                    </div>
                    <p className="text-sm font-semibold text-[rgb(var(--text))]">{stamp.date}</p>
                    <p className="text-xs text-[rgb(var(--muted))]">{stamp.time}</p>
                  </div>

                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--surface))_92%,rgb(var(--text)))] px-2.5 py-1 text-xs text-[rgb(var(--muted))]">
                      <UserRound className="h-3.5 w-3.5" />
                      Actor
                    </div>
                    <p className="break-all text-sm font-semibold text-[rgb(var(--text))]">{log.actor}</p>
                    <ActionBadge action={log.action} />
                  </div>

                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--surface))_92%,rgb(var(--text)))] px-2.5 py-1 text-xs text-[rgb(var(--muted))]">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Details
                    </div>
                    <LogDetailsCell details={log.details} />
                  </div>
                </article>
              );
            })}

            <div className="flex items-center justify-between rounded-xl border border-[rgb(var(--border))] px-3 py-2 text-sm text-[rgb(var(--muted))]">
              <div className="inline-flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                Showing {visibleLogs.length} of {filteredLogs.length} events
              </div>
              {hasMore ? (
                <Button variant="secondary" size="sm" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
                  Load more
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
