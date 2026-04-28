import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Clock3, FilePenLine, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import type { AdminAttendanceItem } from "@/types";

type AttendanceEditModalProps = {
  isOpen: boolean;
  row: AdminAttendanceItem | null;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (payload: {
    status: "Present" | "Late" | "Absent" | "Leave";
    checkin_time: string | null;
    source: "face" | "manual";
    note: string;
  }) => void | Promise<void>;
};

type EditFormState = {
  status: "Present" | "Late" | "Absent" | "Leave";
  checkin_time: string;
  source: "face" | "manual";
  note: string;
};

function normalizeTimeForInput(value?: string | null) {
  const raw = String(value || "").trim();
  return raw ? raw.slice(0, 5) : "";
}

function inferStatus(row: AdminAttendanceItem): "Present" | "Late" | "Absent" | "Leave" {
  const raw = String(row.status || "").trim().toLowerCase();
  if (raw === "absent") return "Absent";
  if (raw === "leave") return "Leave";
  return Number(row.late_minutes || 0) > 0 || Number(row.fine_amount || 0) > 0 ? "Late" : "Present";
}

export function AttendanceEditModal({
  isOpen,
  row,
  saving,
  error,
  onClose,
  onSave,
}: AttendanceEditModalProps) {
  const [form, setForm] = useState<EditFormState>({
    status: "Present",
    checkin_time: "",
    source: "manual",
    note: "",
  });

  useEffect(() => {
    if (!row || !isOpen) return;
    setForm({
      status: inferStatus(row),
      checkin_time: normalizeTimeForInput(row.checkin_time),
      source: row.source === "face" ? "face" : "manual",
      note: row.note || "",
    });
  }, [isOpen, row]);

  const checkinDisabled = form.status === "Absent" || form.status === "Leave";
  const recalculationSummary = useMemo(() => {
    if (form.status === "Absent") {
      return "Saving as Absent will clear check-in time and apply the employee's absent fine.";
    }
    if (form.status === "Leave") {
      return "Saving as Leave will clear check-in time, remove fines, and keep the day out of absence totals.";
    }
    if (!form.checkin_time) {
      return "Present or Late requires a check-in time. Late minutes and fine are recalculated on save.";
    }
    return "Late minutes and fine will be recalculated from check-in time using the employee's shift and grace settings.";
  }, [form.checkin_time, form.status]);

  async function handleSubmit() {
    await onSave({
      status: form.status,
      checkin_time: form.status === "Absent" || form.status === "Leave" ? null : form.checkin_time || null,
      source: form.source,
      note: form.note,
    });
  }

  return (
    <Modal
      isOpen={isOpen}
      title={row ? `Edit Attendance · ${row.employee.name}` : "Edit Attendance"}
      onClose={saving ? () => {} : onClose}
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} loading={saving}>
            {saving ? "Saving..." : "Save Update"}
          </Button>
        </>
      }
    >
      {!row ? null : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="theme-surface-muted rounded-2xl border p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--text-soft))]">Employee</p>
              <p className="mt-2 text-sm font-semibold text-[rgb(var(--text))]">{row.employee.name}</p>
              <p className="mt-1 text-xs text-[rgb(var(--text-soft))]">#{row.employee.id} · {row.employee.department}</p>
            </div>
            <div className="theme-surface-muted rounded-2xl border p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--text-soft))]">Date</p>
              <p className="mt-2 text-sm font-semibold text-[rgb(var(--text))]">{row.date}</p>
              <p className="mt-1 text-xs text-[rgb(var(--text-soft))]">Attendance ID {row.id}</p>
            </div>
            <div className="theme-surface-muted rounded-2xl border p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--text-soft))]">Current Late</p>
              <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[rgb(var(--text))]">
                <Clock3 className="h-4 w-4 text-amber-500" />
                {Number(row.late_minutes || 0)} min
              </p>
            </div>
            <div className="theme-surface-muted rounded-2xl border p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--text-soft))]">Current Fine</p>
              <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[rgb(var(--text))]">
                <ShieldCheck className="h-4 w-4 text-sky-500" />
                PKR {Number(row.fine_amount || 0).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="Status"
              value={form.status}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  status: event.target.value as "Present" | "Late" | "Absent" | "Leave",
                  checkin_time: ["Absent", "Leave"].includes(event.target.value) ? "" : prev.checkin_time,
                }))
              }
            >
              <option value="Present">Present</option>
              <option value="Late">Late</option>
              <option value="Absent">Absent</option>
              <option value="Leave">Leave</option>
            </Select>

            <Input
              label="Check-in Time"
              type="time"
              value={form.checkin_time}
              disabled={checkinDisabled}
              onChange={(event) => setForm((prev) => ({ ...prev, checkin_time: event.target.value }))}
            />

            <Select
              label="Source"
              value={form.source}
              onChange={(event) => setForm((prev) => ({ ...prev, source: event.target.value as "face" | "manual" }))}
            >
              <option value="manual">manual</option>
              <option value="face">face</option>
            </Select>

            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--text-soft))]">Protected Fields</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="default">Late minutes: recalculated</Badge>
                <Badge variant="default">Fine: recalculated</Badge>
                <Badge variant="default">Evidence: preserved</Badge>
              </div>
            </div>
          </div>

          <Textarea
            label="Admin Note"
            rows={4}
            value={form.note}
            onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
            placeholder="Optional note for this attendance record"
          />

          <div className="rounded-2xl border border-sky-200/70 bg-sky-50/80 p-4 text-sm text-sky-900 dark:border-sky-400/20 dark:bg-sky-500/12 dark:text-sky-100">
            <div className="flex items-start gap-2">
              <FilePenLine className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{recalculationSummary}</p>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-300/70 bg-rose-50/90 p-4 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-500/12 dark:text-rose-100">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
