import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { toFileUrl } from "@/services/apiClient";
import type { AdminAttendanceItem } from "@/types";

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

type Props = {
  open: boolean;
  row: AdminAttendanceItem | null;
  onClose: () => void;
  quickStats: {
    presentDays: number;
    lateDays: number;
    totalFine: number;
  };
};

export function AttendanceDetailsDrawer({ open, row, onClose, quickStats }: Props) {
  if (!open || !row || typeof document === "undefined") return null;
  const evidenceUrl = row.evidence_photo_url ? toFileUrl(row.evidence_photo_url) : "";
  const isLate = Number(row.fine_amount || 0) > 0;

  return createPortal(
    <div className="fixed inset-0 z-[95]">
      <button className="absolute inset-0 bg-black/40" aria-label="Close details" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-screen w-full sm:w-[460px] xl:w-[520px] overflow-y-auto border-l border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[rgb(var(--text))]">Attendance Details</h3>
            <p className="text-xs text-[rgb(var(--muted))]">ID: {row.id}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Card title="Employee">
          <div className="flex items-center gap-3">
            {row.employee.photo_url ? (
              <img
                src={toFileUrl(row.employee.photo_url)}
                alt={row.employee.name}
                className="h-12 w-12 rounded-full border border-[rgb(var(--border))] object-cover"
              />
            ) : (
              <div className="grid h-12 w-12 place-items-center rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-sm font-semibold text-[rgb(var(--text))]">
                {(row.employee.name || "?").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[rgb(var(--text))]">{row.employee.name}</p>
              <p className="truncate text-xs text-[rgb(var(--muted))]">{row.employee.email}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="default">{row.employee.department}</Badge>
                <Badge variant={row.employee.role === "admin" ? "admin" : "user"}>{row.employee.role}</Badge>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Attendance">
          <div className="grid gap-1 text-sm">
            <p><span className="text-[rgb(var(--muted))]">Date:</span> {row.date}</p>
            <p><span className="text-[rgb(var(--muted))]">Check-in:</span> {format12HourTime(row.checkin_time)}</p>
            <p><span className="text-[rgb(var(--muted))]">Source:</span> {row.source || "-"}</p>
            <p><span className="text-[rgb(var(--muted))]">Confidence:</span> {(Number(row.confidence || 0) * 100).toFixed(1)}%</p>
            <p><span className="text-[rgb(var(--muted))]">Created:</span> {row.created_at ? new Date(row.created_at).toLocaleString() : "-"}</p>
            <p><span className="text-[rgb(var(--muted))]">Note:</span> {row.note || "-"}</p>
          </div>
        </Card>

        <Card title="Late / Fine">
          <div className="grid gap-2 text-sm">
            <p><span className="text-[rgb(var(--muted))]">Late Minutes:</span> {Number(row.late_minutes ?? 0)}</p>
            <p className={isLate ? "font-semibold text-rose-600" : "text-[rgb(var(--text))]"}>
              <span className="text-[rgb(var(--muted))]">Fine:</span> PKR {Number(row.fine_amount || 0).toFixed(2)}
            </p>
          </div>
        </Card>

        <Card title="Evidence">
          {evidenceUrl ? (
            <img
              src={evidenceUrl}
              alt="Evidence"
              className="h-64 w-full rounded-xl border border-[rgb(var(--border))] object-cover"
            />
          ) : (
            <p className="text-sm text-[rgb(var(--muted))]">No evidence</p>
          )}
        </Card>

        <Card title="Quick Stats (Filtered)">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-[rgb(var(--border))] p-2">
              <p className="text-xs text-[rgb(var(--muted))]">Present</p>
              <p className="text-lg font-bold text-[rgb(var(--text))]">{quickStats.presentDays}</p>
            </div>
            <div className="rounded-xl border border-[rgb(var(--border))] p-2">
              <p className="text-xs text-[rgb(var(--muted))]">Late</p>
              <p className="text-lg font-bold text-[rgb(var(--text))]">{quickStats.lateDays}</p>
            </div>
            <div className="rounded-xl border border-[rgb(var(--border))] p-2">
              <p className="text-xs text-[rgb(var(--muted))]">Fine</p>
              <p className="text-lg font-bold text-[rgb(var(--text))]">PKR {quickStats.totalFine.toFixed(2)}</p>
            </div>
          </div>
        </Card>
      </aside>
    </div>,
    document.body,
  );
}

