import { FormEvent, useMemo, useState } from "react";
import { Building2, PencilLine, Plus, Power, Trash2 } from "lucide-react";
import { useToast } from "@/components/feedback/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Table } from "@/components/ui/Table";
import { apiClient } from "@/services/apiClient";
import type { Department } from "@/types";

type DepartmentManagerCardProps = {
  departments: Department[];
  loading: boolean;
  onRefresh: () => void | Promise<void>;
};

type DepartmentFormState = {
  name: string;
  is_active: boolean;
};

const initialForm: DepartmentFormState = {
  name: "",
  is_active: true,
};

export function DepartmentManagerCard({ departments, loading, onRefresh }: DepartmentManagerCardProps) {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [form, setForm] = useState<DepartmentFormState>(initialForm);
  const [saving, setSaving] = useState(false);

  const activeCount = useMemo(() => departments.filter((department) => department.is_active).length, [departments]);

  function openCreateModal() {
    setEditingDepartment(null);
    setForm(initialForm);
    setModalOpen(true);
  }

  function openEditModal(department: Department) {
    setEditingDepartment(department);
    setForm({
      name: department.name,
      is_active: department.is_active,
    });
    setModalOpen(true);
  }

  async function submitDepartment(event: FormEvent) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      toast.error("Department name is required.");
      return;
    }

    setSaving(true);
    try {
      if (editingDepartment) {
        await apiClient.updateDepartment(editingDepartment.id, {
          name,
          is_active: form.is_active,
        });
        toast.success("Department updated.");
      } else {
        await apiClient.createDepartment({
          name,
          is_active: form.is_active,
        });
        toast.success("Department created.");
      }
      setModalOpen(false);
      setEditingDepartment(null);
      setForm(initialForm);
      await onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save department");
    } finally {
      setSaving(false);
    }
  }

  async function toggleDepartmentStatus(department: Department) {
    try {
      await apiClient.updateDepartment(department.id, {
        name: department.name,
        is_active: !department.is_active,
      });
      toast.success(`Department ${department.is_active ? "deactivated" : "activated"}.`);
      await onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update department");
    }
  }

  async function deleteDepartment(department: Department) {
    const confirmed = window.confirm(`Delete department "${department.name}"? This only works if it is not in use.`);
    if (!confirmed) return;
    try {
      await apiClient.deleteDepartment(department.id);
      toast.success("Department deleted.");
      await onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete department");
    }
  }

  return (
    <>
      <Card
        title="Department Management"
        subtitle="One shared department source for employees, attendance filters, and notice targeting."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => void onRefresh()} disabled={loading}>
              Refresh
            </Button>
            <Button onClick={openCreateModal}>
              <Plus className="h-4 w-4" />
              Add Department
            </Button>
          </div>
        }
      >
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <div className="theme-surface-muted rounded-2xl border p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--text-soft))]">Total Departments</p>
            <p className="mt-2 text-2xl font-bold text-[rgb(var(--text))]">{departments.length}</p>
          </div>
          <div className="theme-surface-muted rounded-2xl border p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--text-soft))]">Active</p>
            <p className="mt-2 text-2xl font-bold text-[rgb(var(--text))]">{activeCount}</p>
          </div>
          <div className="theme-surface-muted rounded-2xl border p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--text-soft))]">Protected Deletes</p>
            <p className="mt-2 text-sm font-medium text-[rgb(var(--text))]">In-use departments can be deactivated, not deleted.</p>
          </div>
        </div>

        {loading ? <p className="text-sm text-[rgb(var(--text-soft))]">Loading departments...</p> : null}
        {!loading && departments.length === 0 ? (
          <EmptyState
            title="No departments yet"
            message="Create the first department before enrolling employees."
            action={<Button onClick={openCreateModal}>Add Department</Button>}
          />
        ) : null}
        {!loading && departments.length > 0 ? (
          <Table stickyHeader zebra hoverRows>
            <thead>
              <tr>
                <th>Department</th>
                <th>Status</th>
                <th>Employees</th>
                <th>Notices</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((department) => (
                <tr key={department.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-2xl border border-sky-200/50 bg-sky-500/10 text-sky-700 dark:border-sky-400/20 dark:text-sky-200">
                        <Building2 className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-medium text-[rgb(var(--text))]">{department.name}</p>
                        <p className="text-xs text-[rgb(var(--text-soft))]">Updated {department.updated_at ? new Date(department.updated_at).toLocaleString() : "-"}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge variant={department.is_active ? "success" : "warn"}>
                      {department.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td>{department.employee_count}</td>
                  <td>{department.notice_count}</td>
                  <td>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openEditModal(department)}>
                        <PencilLine className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => void toggleDepartmentStatus(department)}>
                        <Power className="h-4 w-4" />
                        {department.is_active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={department.employee_count > 0 || department.notice_count > 0}
                        onClick={() => void deleteDepartment(department)}
                        title={department.employee_count > 0 || department.notice_count > 0 ? "Department is in use" : "Delete department"}
                      >
                        <Trash2 className="h-4 w-4" />
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
        title={editingDepartment ? `Edit Department #${editingDepartment.id}` : "Add Department"}
        onClose={() => {
          if (saving) return;
          setModalOpen(false);
          setEditingDepartment(null);
          setForm(initialForm);
        }}
        width="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setModalOpen(false);
                setEditingDepartment(null);
                setForm(initialForm);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" form="department-form" disabled={saving}>
              {saving ? "Saving..." : editingDepartment ? "Save Changes" : "Create Department"}
            </Button>
          </>
        }
      >
        <form id="department-form" onSubmit={(event) => void submitDepartment(event)} className="space-y-4">
          <Input
            label="Department Name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="e.g. Student Affairs"
            maxLength={255}
            required
          />
          <label className="inline-flex items-center gap-2 text-sm text-[rgb(var(--text))]">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
            />
            Keep this department active for dropdowns and new assignments
          </label>
        </form>
      </Modal>
    </>
  );
}
