import { useEffect, useState } from "react";
import { Avatar } from "../components/Avatar";
import { useToast } from "../components/feedback/ToastProvider";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { Table } from "../components/ui/Table";
import { apiClient } from "../services/apiClient";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { AttendanceRecord } from "../types";

export function AdminTodayAttendancePage() {
  const toast = useToast();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [historyEmployeeId, setHistoryEmployeeId] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<AttendanceRecord[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const debouncedSearch = useDebouncedValue(search, 250);
  const filteredRecords = records.filter((r) => {
    const q = debouncedSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (r.name || "").toLowerCase().includes(q) ||
      r.employeeId.toLowerCase().includes(q) ||
      (r.department || "").toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || r.status.toLowerCase() === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const pagedRecords = filteredRecords.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.getTodayAttendance();
      setRecords(res.records);
      setPage(1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadEmployeeHistory() {
    if (!historyEmployeeId.trim()) return;
    setHistoryLoading(true);
    try {
      const res = await apiClient.getHistory(historyEmployeeId.trim());
      setHistoryRecords(res.records);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load history";
      toast.error(msg);
      setHistoryRecords([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <PageHeader
        title="Today Attendance"
        subtitle="Daily attendance results and confidence levels."
        actions={<Button variant="secondary" onClick={load}>Refresh</Button>}
      />

      <Card className="app-toolbar">
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee or department"
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All status</option>
            <option value="present">Present</option>
            <option value="failed">Failed</option>
            <option value="busy">Busy</option>
          </Select>
        </div>
      </Card>

      <Card>
      {loading && (
        <div className="inline-flex items-center gap-2 text-sm text-[rgb(var(--muted))]">
          <Spinner /> Loading today's attendance...
        </div>
      )}
      {error && <Alert variant="error">{error}</Alert>}
      {!loading && !error && !records.length && (
        <EmptyState title="No attendance records yet" message="Records will appear after employees check in." />
      )}

      {!!filteredRecords.length && (
        <>
          <Table stickyHeader zebra hoverRows>
            <thead>
              <tr>
                <th>Avatar</th>
                <th>Employee</th>
                <th>Department</th>
                <th>Time</th>
                <th>Status</th>
                <th>Late Mins</th>
                <th>Confidence</th>
                <th>Fine (PKR)</th>
              </tr>
            </thead>
            <tbody>
              {pagedRecords.map((r) => (
                <tr key={r.id}>
                  <td><Avatar name={r.name || r.employeeId} src={r.photoUrl} /></td>
                  <td>{r.name || r.employeeId}</td>
                  <td>{r.department || "-"}</td>
                  <td>{r.checkInTime}</td>
                  <td>{r.status}</td>
                  <td>{Number(r.lateMinutes ?? 0)}</td>
                  <td>{r.confidence.toFixed(3)}</td>
                  <td>{r.fineAmount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Prev
              </Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
      {!loading && !!records.length && !filteredRecords.length && (
        <div className="mt-4">
          <EmptyState title="No matching records" message="Try adjusting search or status filters." />
        </div>
      )}
      </Card>

      <Card
        title="Attendance History Lookup"
        subtitle="Admins can fetch detailed history by employee ID."
      >
        <h3 className="text-base font-semibold text-slate-800">Attendance History Lookup</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={historyEmployeeId}
            onChange={(e) => setHistoryEmployeeId(e.target.value)}
            placeholder="Employee ID"
            className="w-56"
          />
          <Button onClick={loadEmployeeHistory} title="Fetch employee history">
            {historyLoading ? "Loading..." : "Load History"}
          </Button>
        </div>

        {!!historyRecords.length && (
          <Table className="mt-4">
            <thead>
              <tr>
                <th>Date</th>
                <th>Check-in</th>
                <th>Status</th>
                <th>Late Mins</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {historyRecords.slice(0, 40).map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.checkInTime}</td>
                  <td>{r.status}</td>
                  <td>{Number(r.lateMinutes ?? 0)}</td>
                  <td>{r.confidence.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
