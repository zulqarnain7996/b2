import { useEffect, useMemo, useState } from "react";
import { Download, Search, Users, ShieldCheck, Clock3, Wallet, UserX } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useDepartments } from "@/hooks/useDepartments";
import { AttendanceDetailsDrawer } from "@/components/attendance/AttendanceDetailsDrawer";
import { AttendanceEditModal } from "@/components/attendance/AttendanceEditModal";
import { Avatar } from "@/components/Avatar";
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
import type { AdminAttendanceItem, AdminAttendanceSummary } from "@/types";

type SourceFilter = "all" | "face" | "manual";
type LateFilter = "all" | "late" | "on_time";
type StatusFilter = "all" | "present" | "absent";

function format12HourTime(value?: string | null) {
  if (!value) return "-";
  const str = String(value).trim();
  const parts = str.split(":");
  if (parts.length < 2) return str;
  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return str;
  const ampm = hh >= 12 ? "PM" : "AM";
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${hour12}:${String(mm).padStart(2, "0")} ${ampm}`;
}

function toIsoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfWeek(d: Date) {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? 6 : day - 1;
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function csvEscape(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  return `"${raw.split('"').join('""')}"`;
}

function SummaryCard({
  title,
  value,
  icon,
  gradient,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  gradient: string;
}) {
  return (
    <div className={`rounded-2xl p-4 text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${gradient}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-white/85">{title}</p>
          <p className="mt-2 text-2xl font-extrabold">{value}</p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20">{icon}</div>
      </div>
    </div>
  );
}

export function AdminAllAttendancePage() {
  const { isAdmin, getAllowedDepartments } = useAuth();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const allowedDepartments = useMemo(
    () => getAllowedDepartments("can_view_all_attendance"),
    [getAllowedDepartments],
  );
  const { departments: departmentRecords } = useDepartments({
    admin: isAdmin,
    includeInactive: isAdmin,
  });
  const [items, setItems] = useState<AdminAttendanceItem[]>([]);
  const [summary, setSummary] = useState<AdminAttendanceSummary>({
    records: 0,
    present: 0,
    late: 0,
    absent: 0,
    totalFine: 0,
  });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [department, setDepartment] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [lateFilter, setLateFilter] = useState<LateFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortByFineDesc, setSortByFineDesc] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedRow, setSelectedRow] = useState<AdminAttendanceItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<AdminAttendanceItem | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const departments = useMemo(() => {
    const base = departmentRecords.map((departmentRecord) => departmentRecord.name);
    if (isAdmin) return base;
    const allowed = new Set(allowedDepartments || []);
    return base.filter((departmentName) => allowed.has(departmentName));
  }, [allowedDepartments, departmentRecords, isAdmin]);
  const scopedDepartment = !isAdmin && allowedDepartments?.length === 1 ? allowedDepartments[0] : "";

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (scopedDepartment && department !== scopedDepartment) {
      setDepartment(scopedDepartment);
    }
  }, [department, scopedDepartment]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, fromDate, toDate, department, sourceFilter, lateFilter, statusFilter, sortByFineDesc]);

  const selectedEmployeeStats = useMemo(() => {
    if (!selectedRow) return { presentDays: 0, lateDays: 0, totalFine: 0 };
    const rows = items.filter((r) => r.employee.id === selectedRow.employee.id);
    return {
      presentDays: rows.filter((r) => ["present", "late"].includes(String(r.status || "").toLowerCase())).length,
      lateDays: rows.filter((r) => String(r.status || "").toLowerCase() === "late" || Number(r.fine_amount || 0) > 0).length,
      totalFine: rows.reduce((sum, r) => sum + Number(r.fine_amount || 0), 0),
    };
  }, [items, selectedRow]);

  async function loadAttendance() {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.getAdminAttendance({
        from: fromDate || undefined,
        to: toDate || undefined,
        department: department || undefined,
        q: debouncedSearch || undefined,
        source: sourceFilter,
        lateness: lateFilter,
        status: statusFilter,
        sort: sortByFineDesc ? "fine_desc" : "recent",
        page,
        limit,
      });
      setItems(res.items);
      setTotal(res.total);
      setSummary(res.summary);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load attendance";
      setError(msg);
      toast.error(msg);
      setItems([]);
      setTotal(0);
      setSummary({ records: 0, present: 0, late: 0, absent: 0, totalFine: 0 });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAttendance();
  }, [page, limit, fromDate, toDate, department, debouncedSearch, sourceFilter, lateFilter, statusFilter, sortByFineDesc]);

  useEffect(() => {
    const filter = searchParams.get("filter");
    const lateness = searchParams.get("lateness");
    const status = searchParams.get("status");
    const sort = searchParams.get("sort");

    if (filter === "today") applyToday();
    if (filter === "week") applyWeek();
    if (filter === "month") applyMonth();

    setLateFilter(lateness === "late" ? "late" : lateness === "on_time" ? "on_time" : "all");
    setStatusFilter(status === "present" ? "present" : status === "absent" ? "absent" : "all");
    setSortByFineDesc(sort === "fine_desc");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function applyToday() {
    const today = toIsoDate(new Date());
    setFromDate(today);
    setToDate(today);
  }

  function applyWeek() {
    const now = new Date();
    setFromDate(toIsoDate(startOfWeek(now)));
    setToDate(toIsoDate(now));
  }

  function applyMonth() {
    const now = new Date();
    setFromDate(toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)));
    setToDate(toIsoDate(now));
  }

  function resetFilters() {
    setFromDate("");
    setToDate("");
    setDepartment(scopedDepartment || "");
    setSourceFilter("all");
    setLateFilter("all");
    setStatusFilter("all");
    setSortByFineDesc(false);
    setSearch("");
  }

  async function exportCsv() {
    const header = [
      "AttendanceId",
      "EmployeeId",
      "Name",
      "Email",
      "Department",
      "Role",
      "Date",
      "CheckinTime",
      "Status",
      "LateMinutes",
      "FineAmountPKR",
      "Source",
      "ConfidencePercent",
      "EvidenceUrl",
      "CreatedAt",
    ];
    try {
      const exportRows: AdminAttendanceItem[] = [];
      let exportPage = 1;
      let fetched = 0;
      let exportTotal = 0;
      do {
        const res = await apiClient.getAdminAttendance({
          from: fromDate || undefined,
          to: toDate || undefined,
          department: department || undefined,
          q: debouncedSearch || undefined,
          source: sourceFilter,
          lateness: lateFilter,
          status: statusFilter,
          sort: sortByFineDesc ? "fine_desc" : "recent",
          page: exportPage,
          limit: 100,
        });
        exportRows.push(...res.items);
        exportTotal = res.total;
        fetched += res.items.length;
        exportPage += 1;
      } while (fetched < exportTotal);

      const rows = exportRows.map((r) =>
      [
        r.id,
        r.employee.id,
        r.employee.name,
        r.employee.email,
        r.employee.department,
        r.employee.role,
        r.date,
        format12HourTime(r.checkin_time),
        r.status,
        Number(r.late_minutes ?? 0),
        Number(r.fine_amount || 0).toFixed(2),
        r.source || "",
        (Number(r.confidence || 0) * 100).toFixed(1),
        r.evidence_photo_url ? toFileUrl(r.evidence_photo_url) : "",
        r.created_at || "",
      ]
        .map(csvEscape)
        .join(","),
      );
      const content = [header.join(","), ...rows].join("\n");
      const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `admin-attendance-${toIsoDate(new Date())}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to export attendance");
    }
  }

  function openDrawer(row: AdminAttendanceItem) {
    setSelectedRow(row);
    setDrawerOpen(true);
  }

  function openEditModal(row: AdminAttendanceItem) {
    setEditError("");
    setEditingRow(row);
  }

  async function saveAttendanceEdit(payload: {
    status: "Present" | "Late" | "Absent" | "Leave";
    checkin_time: string | null;
    source: "face" | "manual";
    note: string;
  }) {
    if (!editingRow) return;
    setEditSaving(true);
    setEditError("");
    try {
      await apiClient.updateAdminAttendance(editingRow.id, payload);
      setEditingRow(null);
      setDrawerOpen(false);
      setSelectedRow(null);
      await loadAttendance();
      toast.success("Attendance updated successfully.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update attendance";
      setEditError(msg);
      toast.error(msg);
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <PageHeader title="All Attendance" subtitle="Clean, filterable attendance view for admins." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard title="Records" value={summary.records} icon={<Users className="h-5 w-5" />} gradient="bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700" />
        <SummaryCard title="Present" value={summary.present} icon={<ShieldCheck className="h-5 w-5" />} gradient="bg-gradient-to-br from-emerald-500 via-green-600 to-teal-700" />
        <SummaryCard title="Late" value={summary.late} icon={<Clock3 className="h-5 w-5" />} gradient="bg-gradient-to-br from-amber-500 via-orange-600 to-yellow-700" />
        <SummaryCard title="Absent" value={summary.absent} icon={<UserX className="h-5 w-5" />} gradient="bg-gradient-to-br from-rose-500 via-red-600 to-pink-700" />
        <SummaryCard title="Total Fine" value={`PKR ${summary.totalFine.toFixed(2)}`} icon={<Wallet className="h-5 w-5" />} gradient="bg-gradient-to-br from-rose-500 via-red-600 to-pink-700" />
      </div>

      <Card>
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={applyToday}>Today</Button>
              <Button size="sm" variant="secondary" onClick={applyWeek}>This Week</Button>
              <Button size="sm" variant="secondary" onClick={applyMonth}>This Month</Button>
              <Button size="sm" variant="ghost" onClick={resetFilters}>Reset</Button>
            </div>
            <Button size="sm" variant="secondary" onClick={() => void exportCsv()} disabled={!summary.records}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-7">
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            <Select value={department} onChange={(e) => setDepartment(e.target.value)} disabled={!isAdmin && !!scopedDepartment}>
              {isAdmin || !scopedDepartment ? <option value="">All departments</option> : null}
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </Select>
            <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}>
              <option value="all">All sources</option>
              <option value="face">Face</option>
              <option value="manual">Manual</option>
            </Select>
            <Select value={lateFilter} onChange={(e) => setLateFilter(e.target.value as LateFilter)}>
              <option value="all">All lateness</option>
              <option value="late">Late only</option>
              <option value="on_time">On time</option>
            </Select>
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--muted))]" />
                <Input className="pl-9" placeholder="Search name/email/employee id" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        {loading && (
          <div className="inline-flex items-center gap-2 text-sm text-[rgb(var(--muted))]">
            <Spinner /> Loading attendance...
          </div>
        )}
        {error && <Alert variant="error">{error}</Alert>}
        {!loading && !error && !items.length && (
          <EmptyState title="No attendance found" message="Adjust filters or try a different date range." />
        )}

        {!!items.length && (
          <>
            <Table stickyHeader zebra hoverRows>
              <thead>
                <tr>
                  <th>Photo</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Role</th>
                  <th>Date</th>
                  <th>Check-in</th>
                  <th>Status</th>
                  <th>Late</th>
                  <th>Fine (PKR)</th>
                  <th>Evidence</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const late = String(row.status || "").toLowerCase() === "late" || Number(row.fine_amount || 0) > 0;
                  return (
                    <tr key={row.id}>
                      <td><Avatar name={row.employee.name} src={row.employee.photo_url || ""} /></td>
                      <td>{row.employee.name}</td>
                      <td>{row.employee.email}</td>
                      <td>{row.employee.department}</td>
                      <td><Badge variant={row.employee.role === "admin" ? "admin" : "user"}>{row.employee.role}</Badge></td>
                      <td>{row.date}</td>
                      <td>{format12HourTime(row.checkin_time)}</td>
                      <td><Badge variant={["present", "late"].includes(String(row.status || "").toLowerCase()) ? (late ? "warn" : "success") : "default"}>{row.status}</Badge></td>
                      <td>{late ? <Badge variant="warn">{Number(row.late_minutes ?? 0)} min</Badge> : <span className="text-xs text-[rgb(var(--muted))]">On time</span>}</td>
                      <td>{Number(row.fine_amount || 0).toFixed(2)}</td>
                      <td>
                        {row.evidence_photo_url ? (
                          <img
                            src={toFileUrl(row.evidence_photo_url)}
                            alt="Evidence"
                            className="h-10 w-10 rounded-md border border-[rgb(var(--border))] object-cover"
                          />
                        ) : (
                          <span className="text-xs text-[rgb(var(--muted))]">No image</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="secondary" onClick={() => openDrawer(row)}>
                            View
                          </Button>
                          {isAdmin ? (
                            <Button size="sm" onClick={() => openEditModal(row)}>
                              Edit
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <div className="mt-3 flex items-center justify-between text-sm text-[rgb(var(--muted))]">
              <span>Page {page} of {totalPages} ({total} total)</span>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <AttendanceDetailsDrawer
        open={drawerOpen}
        row={selectedRow}
        onClose={() => setDrawerOpen(false)}
        quickStats={selectedEmployeeStats}
      />
      {isAdmin ? (
        <AttendanceEditModal
          isOpen={!!editingRow}
          row={editingRow}
          saving={editSaving}
          error={editError}
          onClose={() => {
            if (editSaving) return;
            setEditingRow(null);
            setEditError("");
          }}
          onSave={saveAttendanceEdit}
        />
      ) : null}
    </div>
  );
}
