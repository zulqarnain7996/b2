import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, Download, ShieldCheck, Wallet } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { Avatar } from "@/components/history/Avatar";
import { HistoryDetailsModal } from "@/components/history/HistoryDetailsModal";
import { StatCard } from "@/components/history/StatCard";
import { useToast } from "@/components/feedback/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { Table } from "@/components/ui/Table";
import { apiClient, toFileUrl } from "@/services/apiClient";
import type { AttendanceRecord, Employee } from "@/types";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatCheckInTime(v: unknown) {
  if (v === null || v === undefined) return "-";
  if (typeof v === "number" && Number.isFinite(v)) {
    const totalSeconds = Math.max(0, Math.floor(v));
    const hours24 = Math.floor(totalSeconds / 3600) % 24;
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const ampm = hours24 >= 12 ? "PM" : "AM";
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    return `${hours12}:${pad2(minutes)} ${ampm}`;
  }
  const s = String(v).trim();
  if (!s) return "-";
  if (/^\d+$/.test(s)) return formatCheckInTime(Number(s));
  const parts = s.split(":");
  if (parts.length >= 2) {
    const hh = Number(parts[0]);
    const mm = Number(parts[1]);
    if (Number.isFinite(hh) && Number.isFinite(mm)) {
      const ampm = hh >= 12 ? "PM" : "AM";
      const hours12 = hh % 12 === 0 ? 12 : hh % 12;
      return `${hours12}:${pad2(mm)} ${ampm}`;
    }
  }
  return s;
}

function formatDate(v: unknown) {
  if (!v) return "-";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [yy, mm, dd] = s.split("-").map(Number);
    const d = new Date(yy, (mm || 1) - 1, dd || 1);
    return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function toMonthKey(value?: string | null) {
  if (!value) return "";
  const s = String(value);
  const isoMatch = s.match(/^(\d{4})-(\d{2})-/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function csvEscape(input: string | number | null | undefined) {
  const raw = input === null || input === undefined ? "" : String(input);
  return `"${raw.split('"').join('""')}"`;
}

function statusVariant(status: string) {
  const s = status.toLowerCase();
  if (s === "present") return "success" as const;
  if (s === "late") return "warn" as const;
  return "default" as const;
}

export function MyHistoryPage() {
  const { user } = useAuth();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "face" | "manual">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "present">("all");
  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  });

  const todayKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }, []);

  const sortedRecords = useMemo(() => {
    return [...records].sort((a, b) => {
      const da = String(a.date || "");
      const db = String(b.date || "");
      if (da < db) return 1;
      if (da > db) return -1;
      return 0;
    });
  }, [records]);

  const monthOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const row of sortedRecords) {
      const key = toMonthKey(row.date);
      if (key) keys.add(key);
    }
    return Array.from(keys).sort((a, b) => (a < b ? 1 : -1));
  }, [sortedRecords]);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortedRecords.filter((row) => {
      if (monthFilter && toMonthKey(row.date) !== monthFilter) return false;
      if (sourceFilter !== "all" && (row.source || "") !== sourceFilter) return false;
      if (statusFilter === "present" && String(row.status || "").toLowerCase() !== "present") return false;
      if (!q) return true;
      const hay = [
        row.date,
        row.status,
        row.source || "",
        row.note || "",
        row.checkInTime || "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [monthFilter, search, sortedRecords, sourceFilter, statusFilter]);

  const summary = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
    const thisMonthRows = records.filter((r) => toMonthKey(r.date) === thisMonth);
    const presentDays = thisMonthRows.filter((r) => {
      const s = String(r.status || "").toLowerCase();
      return s === "present" || s === "late";
    }).length;
    const lateDays = thisMonthRows.filter((r) => Number(r.fineAmount ?? 0) > 0).length;
    const totalFine = thisMonthRows.reduce((sum, r) => sum + Number(r.fineAmount ?? 0), 0);
    const last = sortedRecords[0];

    return {
      presentDays,
      lateDays,
      totalFine,
      lastCheckIn: last ? `${formatDate(last.date)} ${formatCheckInTime(last.checkInTime)}` : "-",
    };
  }, [records, sortedRecords]);

  async function fetchHistory() {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.getMyHistory();
      setRecords(res.records || []);
      setEmployee((res.employee as Employee | null | undefined) || null);
      if (!(res.records || []).length) toast.info("No attendance records found.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load history";
      setError(msg);
      setRecords([]);
      setEmployee(null);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    const header = ["Date", "CheckIn", "Status", "Source", "LateMinutes", "Confidence", "Fine", "EvidencePhotoUrl", "Note"];
    const lines = filteredRecords.map((r) =>
      [
        r.date,
        formatCheckInTime(r.checkInTime),
        r.status,
        r.source || "",
        Number(r.lateMinutes ?? 0),
        Number(r.confidence ?? 0).toFixed(3),
        Number(r.fineAmount ?? 0).toFixed(2),
        r.evidencePhotoUrl || "",
        r.note || "",
      ]
        .map(csvEscape)
        .join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-attendance-${monthFilter || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    if (!user) return;
    if (!user.employeeId) {
      const msg = "Your account is not linked to an employee ID. Ask admin to link your account.";
      setError(msg);
      setRecords([]);
      toast.error(msg);
      return;
    }
    void fetchHistory();
  }, [toast, user]);

  const fallbackEmployee: Employee = {
    id: user?.employeeId || "",
    name: user?.name || "Employee",
    email: user?.email || "-",
    department: "-",
    role: user?.role || "user",
    isActive: true,
    photoUrl: undefined,
  };
  const profile = employee || fallbackEmployee;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <PageHeader
        title="My Attendance History"
        subtitle="Track your daily check-ins, evidence photos, and attendance source records."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={loading || !filteredRecords.length}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-4 xl:grid-cols-[1.3fr_2fr]">
        <Card className="h-full">
          <div className="flex items-start gap-4">
            <Avatar name={profile.name} photoUrl={profile.photoUrl} size="lg" />
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Employee Profile</div>
              <h2 className="truncate text-lg font-bold text-[rgb(var(--text))]">{profile.name}</h2>
              <p className="truncate text-sm text-[rgb(var(--muted))]">{profile.email}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="default">{profile.department || "No department"}</Badge>
                <Badge variant={profile.role === "admin" ? "admin" : "user"}>{profile.role}</Badge>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Present Days" value={summary.presentDays} hint="This month" icon={<CalendarDays className="h-5 w-5 text-[rgb(var(--text))]" />} tone="green" />
          <StatCard label="Late Days" value={summary.lateDays} hint="fine > 0 this month" icon={<ShieldCheck className="h-5 w-5 text-[rgb(var(--text))]" />} tone="amber" />
          <StatCard label="Total Fine (PKR)" value={`PKR ${summary.totalFine.toFixed(2)}`} hint="This month" icon={<Wallet className="h-5 w-5 text-[rgb(var(--text))]" />} tone="blue" />
          <StatCard label="Last Check-in" value={summary.lastCheckIn} hint="Latest attendance entry" icon={<Clock3 className="h-5 w-5 text-[rgb(var(--text))]" />} tone="slate" />
        </div>
      </div>

      <Card title="Filters" subtitle="Search and narrow down your history quickly.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by date, status, source..."
            className="xl:col-span-2"
          />
          <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as "all" | "face" | "manual")}>
            <option value="all">All Sources</option>
            <option value="face">Face</option>
            <option value="manual">Manual</option>
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | "present")}>
            <option value="all">All Status</option>
            <option value="present">Present only</option>
          </Select>
          <Select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
            {monthOptions.length ? null : <option value={monthFilter}>{monthFilter}</option>}
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card title="Attendance History" subtitle={`Showing ${filteredRecords.length} records`}>
        {loading ? (
          <div className="inline-flex items-center gap-2 text-sm text-[rgb(var(--muted))]">
            <Spinner /> Loading history...
          </div>
        ) : !filteredRecords.length ? (
          <EmptyState title="No matching records" message="Try adjusting filters or check in to create your first record." />
        ) : (
          <Table stickyHeader zebra hoverRows>
            <thead>
              <tr>
                <th>
                  <div className="flex items-center gap-2">
                    <Avatar name={profile.name} photoUrl={profile.photoUrl} size="sm" />
                    Date
                  </div>
                </th>
                <th>Check-in</th>
                <th>Status</th>
                <th>Source</th>
                <th>Late Mins</th>
                <th>Confidence</th>
                <th>Fine (PKR)</th>
                <th>Evidence</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((row) => {
                const isToday = String(row.date || "") === todayKey;
                const evidenceSrc = row.evidencePhotoUrl ? toFileUrl(row.evidencePhotoUrl) : "";

                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer"
                    style={
                      isToday
                        ? { background: "color-mix(in srgb, rgb(var(--surface)) 75%, rgb(var(--primary)) 25%)" }
                        : undefined
                    }
                    onClick={() => setSelectedRecord(row)}
                  >
                    <td>
                      <div className="flex items-center gap-2">
                        <span>{formatDate(row.date)}</span>
                        {isToday ? <Badge variant="important">Today</Badge> : null}
                      </div>
                    </td>
                    <td>{formatCheckInTime(row.checkInTime)}</td>
                    <td>
                      <Badge variant={statusVariant(String(row.status || ""))}>{row.status}</Badge>
                    </td>
                    <td>
                      <Badge variant={row.source === "manual" ? "important" : "normal"}>{row.source || "unknown"}</Badge>
                    </td>
                    <td>{Number(row.lateMinutes ?? 0)}</td>
                    <td>{Number(row.confidence ?? 0).toFixed(3)}</td>
                    <td>PKR {Number(row.fineAmount ?? 0).toFixed(2)}</td>
                    <td>
                      {evidenceSrc ? (
                        <img
                          src={evidenceSrc}
                          alt="Evidence"
                          className="h-10 w-12 rounded-lg border border-[rgb(var(--border))] object-cover"
                        />
                      ) : row.source === "face" ? (
                        <Badge variant="default">Face</Badge>
                      ) : (
                        <span className="text-xs text-[rgb(var(--muted))]">N/A</span>
                      )}
                    </td>
                    <td className="max-w-[220px] truncate">{row.note || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <HistoryDetailsModal isOpen={!!selectedRecord} row={selectedRecord} onClose={() => setSelectedRecord(null)} />
    </div>
  );
}
