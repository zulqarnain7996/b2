import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { toFileUrl } from "@/services/apiClient";
import type { AttendanceRecord } from "@/types";

type HistoryDetailsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  row: AttendanceRecord | null;
};

function formatDate(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatCheckInTime(v: unknown) {
  if (v === null || v === undefined) return "-";
  const s = String(v).trim();
  if (!s) return "-";
  const parts = s.split(":");
  if (parts.length >= 2) {
    const hh = Number(parts[0]);
    const mm = Number(parts[1]);
    if (Number.isFinite(hh) && Number.isFinite(mm)) {
      const ampm = hh >= 12 ? "PM" : "AM";
      const h12 = hh % 12 === 0 ? 12 : hh % 12;
      return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
    }
  }
  return s;
}

export function HistoryDetailsModal({ isOpen, onClose, row }: HistoryDetailsModalProps) {
  const evidenceSrc = row?.evidencePhotoUrl ? toFileUrl(row.evidencePhotoUrl) : "";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Attendance Details" width="lg">
      {!row ? null : (
        <div className="grid gap-5 md:grid-cols-[1.2fr_1fr]">
          <div>
            {evidenceSrc ? (
              <img
                src={evidenceSrc}
                alt="Evidence"
                className="h-64 w-full rounded-2xl border border-[rgb(var(--border))] object-cover"
              />
            ) : (
              <div className="grid h-64 place-items-center rounded-2xl border border-dashed border-[rgb(var(--border))] text-sm text-[rgb(var(--muted))]">
                {row.source === "face" ? "Face attendance (no selfie evidence)" : "No evidence photo"}
              </div>
            )}
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant={String(row.status).toLowerCase() === "present" ? "success" : "warn"}>{row.status}</Badge>
              <Badge variant={row.source === "manual" ? "important" : "normal"}>{row.source || "unknown"}</Badge>
            </div>
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between gap-4 border-b border-[rgb(var(--border))] py-1">
                <span className="text-[rgb(var(--muted))]">Date</span>
                <span className="font-medium text-[rgb(var(--text))]">{formatDate(row.date)}</span>
              </div>
              <div className="flex justify-between gap-4 border-b border-[rgb(var(--border))] py-1">
                <span className="text-[rgb(var(--muted))]">Check-in</span>
                <span className="font-medium text-[rgb(var(--text))]">{formatCheckInTime(row.checkInTime)}</span>
              </div>
              <div className="flex justify-between gap-4 border-b border-[rgb(var(--border))] py-1">
                <span className="text-[rgb(var(--muted))]">Confidence</span>
                <span className="font-medium text-[rgb(var(--text))]">{Number(row.confidence ?? 0).toFixed(3)}</span>
              </div>
              <div className="flex justify-between gap-4 border-b border-[rgb(var(--border))] py-1">
                <span className="text-[rgb(var(--muted))]">Late Minutes</span>
                <span className="font-medium text-[rgb(var(--text))]">{Number(row.lateMinutes ?? 0)}</span>
              </div>
              <div className="flex justify-between gap-4 border-b border-[rgb(var(--border))] py-1">
                <span className="text-[rgb(var(--muted))]">Fine (PKR)</span>
                <span className="font-medium text-[rgb(var(--text))]">{Number(row.fineAmount ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between gap-4 py-1">
                <span className="text-[rgb(var(--muted))]">Created</span>
                <span className="font-medium text-[rgb(var(--text))]">{formatDate(row.createdAt || "")}</span>
              </div>
            </div>
            {row.note ? (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Note</div>
                <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 text-sm text-[rgb(var(--text))]">
                  {row.note}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}
