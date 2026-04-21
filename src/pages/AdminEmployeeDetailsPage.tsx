import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarClock,
  Copy,
  KeyRound,
  Mail,
  PencilLine,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { useToast } from "@/components/feedback/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient } from "@/services/apiClient";
import type { AdminEmployeeDetail } from "@/types";

function formatDateTime(value?: string | null) {
  if (!value) return "Not available";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatTime(value?: string | null) {
  if (!value) return "Not set";
  return String(value).slice(0, 5);
}

function formatOffDays(days?: string[] | null) {
  return days && days.length ? days.map((day) => day[0].toUpperCase() + day.slice(1)).join(", ") : "Not Set";
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="theme-surface rounded-2xl border px-4 py-3 transition-all duration-200 hover:-translate-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--muted))]">{label}</p>
      <p className="mt-2 text-sm font-medium text-[rgb(var(--text))]">{value}</p>
    </div>
  );
}

export function AdminEmployeeDetailsPage() {
  const { employeeId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState<AdminEmployeeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [forcePasswordChange, setForcePasswordChange] = useState(true);
  const [resetSaving, setResetSaving] = useState(false);
  const [resetResult, setResetResult] = useState<{ password: string; forcePasswordChange: boolean } | null>(null);

  async function load() {
    if (!employeeId) return;
    setLoading(true);
    setError("");
    setNotFound(false);
    try {
      const res = await apiClient.getEmployeeDetail(employeeId);
      setData(res);
      setForcePasswordChange(Boolean(res.employee.forcePasswordChange));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load employee details";
      setError(msg);
      setData(null);
      setNotFound(msg.toLowerCase().includes("employee not found") || msg.toLowerCase().includes("not found"));
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [employeeId]);

  const employee = data?.employee;
  const summary = data?.attendanceSummary;
  const recentAttendance = data?.recentAttendance || [];

  const headerActions = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => navigate("/admin/employees")}>
          <ArrowLeft className="h-4 w-4" />
          Back To List
        </Button>
        {employee ? (
          <Button variant="secondary" onClick={() => navigate(`/admin/employees?edit=${encodeURIComponent(employee.id)}`)}>
            <PencilLine className="h-4 w-4" />
            Edit Employee
          </Button>
        ) : null}
        <Button onClick={() => setResetOpen(true)} disabled={!employee}>
          <KeyRound className="h-4 w-4" />
          Reset Password
        </Button>
      </div>
    ),
    [employee, navigate],
  );

  async function submitResetPassword() {
    if (!employee) return;
    setResetSaving(true);
    try {
      const res = await apiClient.resetEmployeePassword(employee.id, {
        temporaryPassword: temporaryPassword.trim() || undefined,
        forcePasswordChange,
      });
      setResetResult({ password: res.temporaryPassword, forcePasswordChange: res.forcePasswordChange });
      setTemporaryPassword("");
      await load();
      toast.success(res.message);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to reset password";
      toast.error(msg);
    } finally {
      setResetSaving(false);
    }
  }

  async function copyTemporaryPassword() {
    if (!resetResult?.password) return;
    try {
      await navigator.clipboard.writeText(resetResult.password);
      toast.success("Temporary password copied.");
    } catch {
      toast.error("Failed to copy temporary password.");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <Card>
          <div className="inline-flex items-center gap-2 text-sm text-[rgb(var(--muted))]">
            <Spinner /> Loading employee details...
          </div>
        </Card>
      </div>
    );
  }

  if (!data || !employee) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <PageHeader title="Employee Details" subtitle="Profile, account, and attendance overview." actions={headerActions} />
        {error ? <Alert variant="error">{error}</Alert> : null}
        <EmptyState
          title={notFound ? "Employee not found" : "Employee details unavailable"}
          message={
            notFound
              ? "This employee record could not be loaded."
              : "The details request failed. Please refresh or check the employee details API route."
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <PageHeader
        title="Employee Details"
        subtitle="Profile, attendance summary, and secure account actions."
        actions={headerActions}
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden">
          <div className="theme-surface rounded-[28px] border p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <Avatar name={employee.name} src={employee.photoUrl} size={92} />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-[rgb(var(--text))]">{employee.name}</h1>
                    <Badge variant={employee.isActive ? "success" : "warn"}>
                      {employee.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm font-medium text-sky-700 dark:text-sky-300">{employee.department}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-[rgb(var(--muted))]">
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="h-4 w-4" />
                      {employee.email}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <UserRound className="h-4 w-4" />
                      Employee ID #{employee.id}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <InfoItem label="Role" value={employee.role} />
                <InfoItem label="Linked User ID" value={employee.userId ? String(employee.userId) : "Not linked"} />
              </div>
            </div>
          </div>
        </Card>

        <Card title="Attendance Summary" subtitle="Latest totals already stored in the system.">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoItem label="Total Records" value={String(summary?.totalRecords ?? 0)} />
            <InfoItem label="Present Days" value={String(summary?.presentDays ?? 0)} />
            <InfoItem label="Late Days" value={String(summary?.lateDays ?? 0)} />
            <InfoItem label="Total Fine" value={`PKR ${(summary?.totalFine ?? 0).toFixed(2)}`} />
          </div>
          <div className="mt-4">
            <InfoItem label="Last Check-In" value={formatDateTime(summary?.lastCheckin)} />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Employee Information" subtitle="Operational details used for attendance rules.">
          <div className="grid gap-3 md:grid-cols-2">
            <InfoItem label="Shift Start Time" value={formatTime(employee.shiftStartTime)} />
            <InfoItem label="Grace Period" value={`${Number(employee.gracePeriodMins ?? 0)} mins`} />
            <InfoItem label="Late Fine" value={`PKR ${Number(employee.lateFinePkr ?? 0).toFixed(2)}`} />
            <InfoItem label="Absent Fine" value={`PKR ${Number(employee.absentFinePkr ?? 0).toFixed(2)}`} />
            <InfoItem label="Not Marked Fine" value={`PKR ${Number(employee.notMarkedFinePkr ?? 0).toFixed(2)}`} />
            <InfoItem label="Off Days" value={formatOffDays(employee.offDays)} />
            <InfoItem label="Face Embeddings" value={String(employee.faceEmbeddingsCount ?? 0)} />
          </div>
        </Card>

        <Card title="Account & Timeline" subtitle="Safe account metadata only. Existing passwords are never shown.">
          <div className="grid gap-3 md:grid-cols-2">
            <InfoItem label="Created Date" value={formatDateTime(employee.createdAt)} />
            <InfoItem label="Updated Date" value={formatDateTime(employee.updatedAt)} />
            <InfoItem label="Linked Account Created" value={formatDateTime(employee.userCreatedAt)} />
            <InfoItem label="Force Password Change" value={employee.forcePasswordChange ? "Yes" : "No"} />
          </div>
          <div className="mt-4">
            <Alert variant="info">
              Passwords remain hashed and unrecoverable. Admin can only set a new temporary password.
            </Alert>
          </div>
        </Card>
      </div>

      <Card
        title="Recent Attendance"
        subtitle="Latest five attendance entries for quick review."
        actions={
          <Link
            to={`/admin/attendance/employee/${encodeURIComponent(employee.id)}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 transition-colors duration-200 hover:text-sky-600 dark:text-sky-300 dark:hover:text-sky-200"
          >
            Full attendance report
          </Link>
        }
      >
        {!recentAttendance.length ? (
          <EmptyState title="No attendance history yet" message="Attendance records will appear here after this employee checks in." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[rgb(var(--border))]">
            <table className="ui-data-table min-w-full text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Time</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Source</th>
                  <th className="px-3 py-3 font-medium">Fine</th>
                </tr>
              </thead>
              <tbody>
                {recentAttendance.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-3">{row.date}</td>
                    <td className="px-3 py-3">{row.checkInTime || "-"}</td>
                    <td className="px-3 py-3">{row.status}</td>
                    <td className="px-3 py-3 capitalize">{row.source || "-"}</td>
                    <td className="px-3 py-3">PKR {Number(row.fineAmount || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        isOpen={resetOpen}
        title="Reset Employee Password"
        onClose={() => {
          if (resetSaving) return;
          setResetOpen(false);
          setResetResult(null);
          setTemporaryPassword("");
        }}
        width="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setResetOpen(false);
                setResetResult(null);
                setTemporaryPassword("");
              }}
              disabled={resetSaving}
            >
              Close
            </Button>
            {!resetResult ? (
              <Button onClick={submitResetPassword} loading={resetSaving}>
                {resetSaving ? "Saving..." : "Set Temporary Password"}
              </Button>
            ) : (
              <Button onClick={copyTemporaryPassword}>
                <Copy className="h-4 w-4" />
                Copy Temporary Password
              </Button>
            )}
          </>
        }
      >
        {!resetResult ? (
          <div className="space-y-4">
            <Alert variant="info">
              This action replaces the existing password with a new temporary password. The old password remains hidden and cannot be viewed.
            </Alert>
            <Input
              label="New Temporary Password"
              type="password"
              placeholder="Leave blank to auto-generate"
              value={temporaryPassword}
              onChange={(event) => setTemporaryPassword(event.target.value)}
            />
            <label className="flex items-center gap-2 text-sm text-[rgb(var(--text-soft))]">
              <input
                type="checkbox"
                checked={forcePasswordChange}
                onChange={(event) => setForcePasswordChange(event.target.checked)}
              />
              Force password change on next login
            </label>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert variant="success">
              Temporary password created successfully. This is the only time it will be shown.
            </Alert>
            <div className="rounded-2xl border border-emerald-300/60 bg-emerald-500/12 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-200">Temporary Password</p>
              <p className="mt-2 break-all font-mono text-base font-semibold text-emerald-900 dark:text-emerald-100">{resetResult.password}</p>
              <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">
                Force password change: {resetResult.forcePasswordChange ? "Enabled" : "Disabled"}
              </p>
            </div>
            <div className="theme-surface-muted rounded-2xl border px-4 py-4 text-sm text-[rgb(var(--text-soft))]">
              The existing password was not revealed or decrypted. Only a new hashed password was stored.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
