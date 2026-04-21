import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Table } from "@/components/ui/Table";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { NoticeDetailModal } from "@/components/notices/NoticeDetailModal";
import { useDepartments } from "@/hooks/useDepartments";
import { apiClient } from "@/services/apiClient";
import type { AdminNotice, NoticeAudience, NoticePriority } from "@/types";

type NoticeFormState = {
  title: string;
  body: string;
  priority: NoticePriority;
  is_active: boolean;
  is_sticky: boolean;
  show_on_login: boolean;
  show_on_refresh: boolean;
  repeat_every_login: boolean;
  is_dismissible: boolean;
  requires_acknowledgement: boolean;
  target_audience: NoticeAudience;
  target_department: string;
  target_role: string;
  starts_at: string;
  ends_at: string;
};

const initialForm: NoticeFormState = {
  title: "",
  body: "",
  priority: "normal",
  is_active: true,
  is_sticky: false,
  show_on_login: false,
  show_on_refresh: false,
  repeat_every_login: false,
  is_dismissible: false,
  requires_acknowledgement: false,
  target_audience: "all",
  target_department: "",
  target_role: "",
  starts_at: "",
  ends_at: "",
};

function toDateTimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export function AdminNoticesPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const { departments: departmentRecords } = useDepartments({ admin: isAdmin, includeInactive: isAdmin });
  const [notices, setNotices] = useState<AdminNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailNotice, setDetailNotice] = useState<AdminNotice | null>(null);
  const [editingNoticeId, setEditingNoticeId] = useState<number | null>(null);
  const [form, setForm] = useState<NoticeFormState>(initialForm);

  const editingNotice = useMemo(
    () => notices.find((notice) => notice.id === editingNoticeId) ?? null,
    [notices, editingNoticeId],
  );

  async function loadNotices() {
    setLoading(true);
    try {
      const res = await apiClient.getAdminNotices();
      setNotices(res.notices);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load notices");
      setNotices([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadNotices();
  }, []);

  function openCreateModal() {
    setEditingNoticeId(null);
    setForm(initialForm);
    setModalOpen(true);
  }

  function openEditModal(notice: AdminNotice) {
    setEditingNoticeId(notice.id);
    setForm({
      title: notice.title,
      body: notice.body,
      priority: notice.priority,
      is_active: notice.is_active,
      is_sticky: notice.is_sticky,
      show_on_login: notice.show_on_login,
      show_on_refresh: notice.show_on_refresh,
      repeat_every_login: notice.repeat_every_login,
      is_dismissible: notice.is_dismissible,
      requires_acknowledgement: notice.requires_acknowledgement,
      target_audience: notice.target_audience,
      target_department: notice.target_department || "",
      target_role: notice.target_role || "",
      starts_at: toDateTimeLocal(notice.starts_at),
      ends_at: toDateTimeLocal(notice.ends_at),
    });
    setModalOpen(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim() || !form.body.trim()) {
      toast.error("Title and body are required.");
      return;
    }
    if (form.starts_at && form.ends_at && form.starts_at > form.ends_at) {
      toast.error("Start date must be before or equal to end date.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        body: form.body.trim(),
        priority: form.priority,
        is_active: form.is_active,
        is_sticky: form.is_sticky,
        show_on_login: form.show_on_login || form.repeat_every_login || form.requires_acknowledgement,
        show_on_refresh: form.show_on_refresh,
        repeat_every_login: form.repeat_every_login,
        is_dismissible: form.is_dismissible,
        requires_acknowledgement: form.requires_acknowledgement,
        target_audience: form.target_audience,
        target_department: form.target_department.trim() || null,
        target_role: form.target_role.trim() || null,
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
      };
      if (editingNoticeId) {
        await apiClient.updateAdminNotice(editingNoticeId, payload);
        toast.success("Notice updated.");
      } else {
        await apiClient.createAdminNotice(payload);
        toast.success("Notice created.");
      }
      setModalOpen(false);
      setForm(initialForm);
      setEditingNoticeId(null);
      await loadNotices();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save notice");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteNotice(noticeId: number) {
    const ok = window.confirm("Delete this notice?");
    if (!ok) return;
    try {
      await apiClient.deleteAdminNotice(noticeId);
      toast.success("Notice deleted.");
      await loadNotices();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  }

  async function onToggleActive(notice: AdminNotice) {
    try {
      await apiClient.updateAdminNotice(notice.id, {
        title: notice.title,
        body: notice.body,
        priority: notice.priority,
        is_active: !notice.is_active,
        is_sticky: notice.is_sticky,
        show_on_login: notice.show_on_login,
        show_on_refresh: notice.show_on_refresh,
        repeat_every_login: notice.repeat_every_login,
        is_dismissible: notice.is_dismissible,
        requires_acknowledgement: notice.requires_acknowledgement,
        target_audience: notice.target_audience,
        target_department: notice.target_department,
        target_role: notice.target_role,
        starts_at: toDateTimeLocal(notice.starts_at) || null,
        ends_at: toDateTimeLocal(notice.ends_at) || null,
      });
      await loadNotices();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update status");
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <PageHeader
        title="Manage Notices"
        subtitle="Create and manage system-wide announcements."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => void loadNotices()}>
              Refresh
            </Button>
            <Button onClick={openCreateModal}>Create Notice</Button>
          </div>
        }
      />

      <Card>
        {loading ? <p className="text-sm text-slate-500">Loading notices...</p> : null}

        {!loading && notices.length === 0 ? (
          <EmptyState title="No notices yet" message="Create the first notice for your users." />
        ) : null}

        {!loading && notices.length > 0 ? (
          <Table stickyHeader zebra hoverRows>
            <thead>
              <tr>
                <th>Title</th>
                <th>Priority</th>
                <th>Behavior</th>
                <th>Active</th>
                <th>Starts</th>
                <th>Ends</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {notices.map((notice) => (
                <tr key={notice.id}>
                  <td>
                    <button type="button" className="text-left" onClick={() => setDetailNotice(notice)}>
                      <p className="font-medium text-slate-900">{notice.title}</p>
                      <p className="line-clamp-2 text-xs text-slate-500">{notice.body}</p>
                    </button>
                  </td>
                  <td>
                    <Badge variant={notice.priority}>{notice.priority}</Badge>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      {notice.is_sticky ? <Badge variant="important">Sticky</Badge> : null}
                      {notice.show_on_login ? <Badge variant="default">Login</Badge> : null}
                      {notice.show_on_refresh ? <Badge variant="normal">Refresh</Badge> : null}
                      {notice.repeat_every_login ? <Badge variant="warn">Repeat</Badge> : null}
                      {notice.is_dismissible ? <Badge variant="normal">Dismiss</Badge> : null}
                      {notice.requires_acknowledgement ? <Badge variant="urgent">Ack</Badge> : null}
                    </div>
                  </td>
                  <td>
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={notice.is_active}
                        onChange={() => void onToggleActive(notice)}
                      />
                      <span className="text-xs text-slate-600">{notice.is_active ? "Active" : "Inactive"}</span>
                    </label>
                  </td>
                  <td>{formatDate(notice.starts_at)}</td>
                  <td>{formatDate(notice.ends_at)}</td>
                  <td>{formatDate(notice.created_at)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setDetailNotice(notice)}>
                        View
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => openEditModal(notice)}>
                        Edit
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => void onDeleteNotice(notice.id)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Card>

      <Modal
        isOpen={modalOpen}
        title={editingNotice ? `Edit Notice #${editingNotice.id}` : "Create Notice"}
        onClose={() => {
          if (saving) return;
          setModalOpen(false);
        }}
        footer={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setModalOpen(false);
                setEditingNoticeId(null);
                setForm(initialForm);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" form="notice-form" disabled={saving}>
              {saving ? "Saving..." : editingNotice ? "Update Notice" : "Create Notice"}
            </Button>
          </div>
        }
      >
        <form id="notice-form" onSubmit={(event) => void onSubmit(event)} className="space-y-3">
          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            maxLength={200}
            required
          />
          <Textarea
            label="Body"
            value={form.body}
            onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
            rows={5}
            required
          />
          <div className="grid gap-3 md:grid-cols-2">
            <Select
              label="Priority"
              value={form.priority}
              onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value as NoticePriority }))}
            >
              <option value="normal">Normal</option>
              <option value="important">Important</option>
              <option value="urgent">Urgent</option>
            </Select>
            <Select
              label="Status"
              value={String(form.is_active)}
              onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.value === "true" }))}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Select
              label="Target Audience"
              value={form.target_audience}
              onChange={(e) => setForm((prev) => ({ ...prev, target_audience: e.target.value as NoticeAudience }))}
            >
              <option value="all">All users</option>
              <option value="admins_only">Admins only</option>
              <option value="users_only">Normal users only</option>
            </Select>
            <Select
              label="Target Department"
              value={form.target_department}
              onChange={(e) => setForm((prev) => ({ ...prev, target_department: e.target.value }))}
            >
              <option value="">All departments</option>
              {departmentRecords.map((department) => (
                <option key={department.id} value={department.name}>
                  {department.name}{department.is_active ? "" : " (inactive)"}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="Target Role"
              value={form.target_role}
              onChange={(e) => setForm((prev) => ({ ...prev, target_role: e.target.value }))}
              placeholder="Optional employee role"
            />
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[rgb(var(--muted))]">Behavior</p>
              <div className="mt-3 grid gap-2 text-sm text-[rgb(var(--text))]">
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.is_sticky} onChange={(e) => setForm((prev) => ({ ...prev, is_sticky: e.target.checked }))} />Sticky in notice list</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.show_on_login} onChange={(e) => setForm((prev) => ({ ...prev, show_on_login: e.target.checked }))} />Show on login</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.show_on_refresh} onChange={(e) => setForm((prev) => ({ ...prev, show_on_refresh: e.target.checked }))} />Show on each refresh</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.repeat_every_login} onChange={(e) => setForm((prev) => ({ ...prev, repeat_every_login: e.target.checked, show_on_login: e.target.checked ? true : prev.show_on_login }))} />Repeat on every login</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.is_dismissible} onChange={(e) => setForm((prev) => ({ ...prev, is_dismissible: e.target.checked }))} />Dismissible by user</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.requires_acknowledgement} onChange={(e) => setForm((prev) => ({ ...prev, requires_acknowledgement: e.target.checked, show_on_login: e.target.checked ? true : prev.show_on_login }))} />Require acknowledgement</label>
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="Starts At"
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) => setForm((prev) => ({ ...prev, starts_at: e.target.value }))}
            />
            <Input
              label="Ends At"
              type="datetime-local"
              value={form.ends_at}
              onChange={(e) => setForm((prev) => ({ ...prev, ends_at: e.target.value }))}
            />
          </div>
        </form>
      </Modal>

      <NoticeDetailModal
        notice={detailNotice}
        isOpen={!!detailNotice}
        onClose={() => setDetailNotice(null)}
      />
    </div>
  );
}
