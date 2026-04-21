import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import type { Notice } from "@/types";

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString();
}

function resolveStatus(notice: Notice): string {
  const now = Date.now();
  const starts = notice.starts_at ? new Date(notice.starts_at).getTime() : null;
  const ends = notice.ends_at ? new Date(notice.ends_at).getTime() : null;
  if (notice.closed_at || notice.is_active === false) return "Inactive";
  if (starts && starts > now) return "Upcoming";
  if (ends && ends < now) return "Expired";
  return "Active";
}

export function NoticeDetailModal({
  notice,
  isOpen,
  onClose,
  footer,
}: {
  notice: Notice | null;
  isOpen: boolean;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  if (!notice) return null;

  return (
    <Modal isOpen={isOpen} title={notice.title} onClose={onClose} width="lg" footer={footer}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={notice.priority}>{notice.priority}</Badge>
          <Badge variant={resolveStatus(notice) === "Active" ? "success" : resolveStatus(notice) === "Upcoming" ? "warn" : "default"}>
            {resolveStatus(notice)}
          </Badge>
          {notice.is_sticky ? <Badge variant="important">Sticky</Badge> : null}
          {notice.show_on_login ? <Badge variant="default">Login Popup</Badge> : null}
          {notice.show_on_refresh ? <Badge variant="normal">Refresh Popup</Badge> : null}
          {notice.repeat_every_login ? <Badge variant="warn">Every Login</Badge> : null}
          {notice.requires_acknowledgement ? <Badge variant="urgent">Acknowledgement</Badge> : null}
        </div>

        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-4">
          <p className="whitespace-pre-wrap text-sm leading-7 text-[rgb(var(--text))]">{notice.body}</p>
        </div>

        <div className="grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[rgb(var(--text-soft))]">Schedule</p>
            <div className="mt-3 space-y-2 text-[rgb(var(--text-soft))]">
              <p>Created: <span className="text-[rgb(var(--text))]">{formatDate(notice.created_at)}</span></p>
              <p>Starts: <span className="text-[rgb(var(--text))]">{formatDate(notice.starts_at)}</span></p>
              <p>Ends: <span className="text-[rgb(var(--text))]">{formatDate(notice.ends_at)}</span></p>
              <p>Status: <span className="text-[rgb(var(--text))]">{resolveStatus(notice)}</span></p>
            </div>
          </div>

          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[rgb(var(--text-soft))]">Delivery</p>
            <div className="mt-3 space-y-2 text-[rgb(var(--text-soft))]">
              <p>Created by: <span className="text-[rgb(var(--text))]">{notice.created_by_name || "-"}</span></p>
              <p>Audience: <span className="text-[rgb(var(--text))]">{notice.target_audience || "all"}</span></p>
              <p>Department: <span className="text-[rgb(var(--text))]">{notice.target_department || "-"}</span></p>
              <p>Role: <span className="text-[rgb(var(--text))]">{notice.target_role || "-"}</span></p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
