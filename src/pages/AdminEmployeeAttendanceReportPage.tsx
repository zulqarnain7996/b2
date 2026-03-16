import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Avatar } from "@/components/Avatar";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { Table } from "@/components/ui/Table";
import { useToast } from "@/components/feedback/ToastProvider";
import { apiClient, toFileUrl } from "@/services/apiClient";
import type { AdminAttendanceEmployeeReport } from "@/types";

function format12HourTime(value?: string | null) {
  if (!value) return "-";
  const str = String(value).trim();
  if (!str) return "-";
  const parts = str.split(":");
  if (parts.length < 2) return str;
  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return str;
  const ampm = hh >= 12 ? "PM" : "AM";
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${hour12}:${String(mm).padStart(2, "0")} ${ampm}`;
}

export function AdminEmployeeAttendanceReportPage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const toast = useToast();
  const [data, setData] = useState<AdminAttendanceEmployeeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const targetId: string = employeeId ?? "";
    if (!targetId) return;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await apiClient.getAdminAttendanceEmployeeReport(targetId);
        setData(res);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load employee attendance report";
        setError(msg);
        toast.error(msg);
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [employeeId, toast]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <PageHeader title="Employee Attendance Report" subtitle="Detailed employee attendance summary and history." />

      {loading && (
        <Card>
          <div className="inline-flex items-center gap-2 text-sm text-[rgb(var(--muted))]">
            <Spinner /> Loading report...
          </div>
        </Card>
      )}
      {error && (
        <Card>
          <Alert variant="error">{error}</Alert>
        </Card>
      )}

      {!loading && !error && data && (
        <>
          <Card title="Employee Details">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name={data.employee.name} src={data.employee.photo_url || ""} size={56} />
              <div>
                <p className="text-base font-semibold text-slate-900">{data.employee.name}</p>
                <p className="text-sm text-slate-600">{data.employee.email}</p>
                <p className="text-sm text-slate-600">
                  {data.employee.department} | {data.employee.role}
                </p>
              </div>
            </div>
          </Card>

          <Card title="Summary">
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">Present Days: {data.summary.present_days}</Badge>
              <Badge variant="warn">Late Days: {data.summary.late_days}</Badge>
              <Badge variant="default">Total Fine (PKR): {Number(data.summary.total_fine || 0).toFixed(2)}</Badge>
              <Badge variant="default">Last Check-in: {data.summary.last_checkin ? new Date(data.summary.last_checkin).toLocaleString() : "-"}</Badge>
            </div>
          </Card>

          <Card title="Attendance History">
            {!data.history.length && (
              <EmptyState title="No history found" message="This employee has no attendance records yet." />
            )}
            {!!data.history.length && (
              <Table stickyHeader zebra hoverRows>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Late Mins</th>
                    <th>Fine (PKR)</th>
                    <th>Source</th>
                    <th>Evidence</th>
                    <th>Confidence</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((row) => (
                    <tr key={row.id}>
                      <td>{row.date}</td>
                      <td>{format12HourTime(row.checkin_time)}</td>
                      <td>{row.status}</td>
                      <td>{Number(row.late_minutes ?? 0)}</td>
                      <td>{Number(row.fine_amount || 0).toFixed(2)}</td>
                      <td>{row.source || "-"}</td>
                      <td>
                        {row.evidence_photo_url ? (
                          <a href={toFileUrl(row.evidence_photo_url)} target="_blank" rel="noreferrer">
                            <img
                              src={toFileUrl(row.evidence_photo_url)}
                              alt="Evidence"
                              className="h-10 w-10 rounded-md border border-[rgb(var(--border))] object-cover"
                            />
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{Number(row.confidence || 0).toFixed(3)}</td>
                      <td>{row.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
