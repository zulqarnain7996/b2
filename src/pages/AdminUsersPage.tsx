import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { useToast } from "@/components/feedback/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { Table } from "@/components/ui/Table";
import { apiClient } from "@/services/apiClient";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { Employee, SystemUser } from "@/types";

function fmtDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const toast = useToast();

  const [users, setUsers] = useState<SystemUser[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    role: "user" as "admin" | "user",
    employeeId: "",
    resetPassword: false,
    newPassword: "",
  });
  const pageSize = 10;

  const debouncedSearch = useDebouncedValue(search, 250);
  const myUserId = currentUser?.id ?? -1;

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const [usersRes, employeesRes] = await Promise.all([apiClient.getUsers(), apiClient.getEmployees()]);
      setUsers(usersRes.users);
      setEmployees(employeesRes.employees);
      setSelectedIds((prev) => prev.filter((id) => usersRes.users.some((u) => u.id === id) && id !== myUserId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load users";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredUsers = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return users.filter((u) => {
      const matchesSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      const matchesRole = roleFilter === "all" || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, debouncedSearch, roleFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const pagedUsers = useMemo(
    () => filteredUsers.slice((page - 1) * pageSize, page * pageSize),
    [filteredUsers, page],
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, roleFilter]);

  const visibleSelectableIds = useMemo(
    () => pagedUsers.filter((u) => u.id !== myUserId).map((u) => u.id),
    [pagedUsers, myUserId],
  );

  const allVisibleSelected =
    visibleSelectableIds.length > 0 && visibleSelectableIds.every((id) => selectedIds.includes(id));

  const editingUser = useMemo(
    () => users.find((u) => u.id === editUserId) ?? null,
    [users, editUserId],
  );

  const linkedEmployeeByUser = useMemo(() => {
    const map = new Map<string, number>();
    users.forEach((u) => {
      if (u.employeeId) {
        map.set(String(u.employeeId), u.id);
      }
    });
    return map;
  }, [users]);

  function toggleSelectAllVisible() {
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleSelectableIds.includes(id)));
      return;
    }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleSelectableIds])));
  }

  function toggleRow(id: number) {
    if (id === myUserId) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function askDelete(ids: number[]) {
    const valid = ids.filter((id) => id !== myUserId);
    if (!valid.length) return;
    setPendingDeleteIds(valid);
    setConfirmOpen(true);
  }

  async function confirmDelete() {
    if (!pendingDeleteIds.length) return;
    setBusy(true);
    try {
      const res =
        pendingDeleteIds.length === 1
          ? await apiClient.deleteUser(pendingDeleteIds[0])
          : await apiClient.bulkDeleteUsers(pendingDeleteIds);
      toast.success(res.message);
      setConfirmOpen(false);
      setPendingDeleteIds([]);
      setSelectedIds([]);
      await loadUsers();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  function openEdit(user: SystemUser) {
    setEditUserId(user.id);
    setEditForm({
      name: user.name,
      email: user.email,
      role: user.role,
      employeeId: user.employeeId ? String(user.employeeId) : "",
      resetPassword: false,
      newPassword: "",
    });
  }

  async function saveEdit() {
    if (!editUserId) return;
    setBusy(true);
    try {
      await apiClient.updateUser(editUserId, {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        role: editForm.role,
        employee_id: editForm.employeeId ? Number(editForm.employeeId) : null,
        password: editForm.resetPassword ? editForm.newPassword : undefined,
      });
      toast.success("User updated successfully.");
      setEditUserId(null);
      await loadUsers();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "User update failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  function resetFilters() {
    setSearch("");
    setRoleFilter("all");
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <PageHeader
        title="Users"
        subtitle="Manage login accounts"
        actions={(
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => void loadUsers()}>
              Refresh
            </Button>
            <Button
              variant="danger"
              onClick={() => askDelete(selectedIds)}
              disabled={!selectedIds.length}
            >
              Delete Selected ({selectedIds.length})
            </Button>
          </div>
        )}
      />

      <Card>
        <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
          <Input
            placeholder="Search name/email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as "all" | "admin" | "user")}
          >
            <option value="all">All roles</option>
            <option value="admin">Admin</option>
            <option value="user">User</option>
          </Select>
          <Button variant="ghost" onClick={resetFilters}>
            Reset
          </Button>
        </div>
      </Card>

      {error ? <Alert>{error}</Alert> : null}

      <Card>
        {loading ? (
          <div className="inline-flex items-center gap-2 text-sm text-[rgb(var(--muted))]">
            <Spinner /> Loading users...
          </div>
        ) : null}

        {!loading && !users.length ? (
          <EmptyState title="No users found" message="No login accounts are available." />
        ) : null}

        {!loading && !!users.length && !filteredUsers.length ? (
          <EmptyState title="No users match filters" message="Try clearing search or role filter." />
        ) : null}

        {!loading && !!filteredUsers.length ? (
          <>
            <Table stickyHeader zebra hoverRows>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all visible users"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      disabled={!visibleSelectableIds.length}
                    />
                  </th>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Employee ID</th>
                  <th>Created At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedUsers.map((u) => {
                  const isMe = u.id === myUserId;
                  return (
                    <tr key={u.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select user ${u.id}`}
                          checked={selectedIds.includes(u.id)}
                          onChange={() => toggleRow(u.id)}
                          disabled={isMe}
                        />
                      </td>
                      <td>{u.id}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span>{u.name}</span>
                          {isMe ? <Badge variant="default">You</Badge> : null}
                        </div>
                      </td>
                      <td>{u.email}</td>
                      <td>
                        <Badge variant={u.role === "admin" ? "admin" : "user"}>{u.role}</Badge>
                      </td>
                      <td>{u.employeeId || "-"}</td>
                      <td>{fmtDate(u.createdAt)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openEdit(u)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={isMe}
                            onClick={() => askDelete([u.id])}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <div className="mt-3 flex items-center justify-between text-sm text-[rgb(var(--muted))]">
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
        ) : null}
      </Card>

      <Modal
        isOpen={!!editUserId}
        onClose={() => setEditUserId(null)}
        title={editingUser ? `Edit User #${editingUser.id}` : "Edit User"}
        width="lg"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setEditUserId(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={() => void saveEdit()}
              disabled={editForm.resetPassword && editForm.newPassword.trim().length < 6}
            >
              Save Changes
            </Button>
          </>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label="Name"
            placeholder="Name"
            value={editForm.name}
            onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <Input
            label="Email"
            placeholder="Email"
            value={editForm.email}
            onChange={(event) => setEditForm((prev) => ({ ...prev, email: event.target.value }))}
          />
          <Select
            label="Role"
            value={editForm.role}
            onChange={(event) => setEditForm((prev) => ({ ...prev, role: event.target.value as "admin" | "user" }))}
          >
            <option value="admin">admin</option>
            <option value="user">user</option>
          </Select>
          <Select
            label="Employee Link"
            value={editForm.employeeId}
            onChange={(event) => setEditForm((prev) => ({ ...prev, employeeId: event.target.value }))}
          >
            <option value="">Unlinked</option>
            {employees.map((emp) => {
              const linkedTo = linkedEmployeeByUser.get(String(emp.id));
              const disabled = !!linkedTo && linkedTo !== editUserId;
              return (
                <option key={emp.id} value={String(emp.id)} disabled={disabled}>
                  {emp.id} - {emp.name}{disabled ? " (already linked)" : ""}
                </option>
              );
            })}
          </Select>
        </div>
        <div className="mt-4 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={editForm.resetPassword}
              onChange={(event) => setEditForm((prev) => ({ ...prev, resetPassword: event.target.checked, newPassword: "" }))}
            />
            <span className="text-sm text-[rgb(var(--muted))]">Reset password</span>
          </label>
          {editForm.resetPassword ? (
            <div className="mt-3">
              <Input
                label="New Password"
                type="password"
                placeholder="At least 6 characters"
                value={editForm.newPassword}
                onChange={(event) => setEditForm((prev) => ({ ...prev, newPassword: event.target.value }))}
              />
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={pendingDeleteIds.length > 1 ? "Delete selected users?" : "Delete this user?"}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void confirmDelete()}>
              Delete
            </Button>
          </>
        )}
        width="md"
      >
        <p className="text-sm text-[rgb(var(--muted))]">
          This will permanently delete account(s) and linked employee attendance data via cascade delete.
        </p>
      </Modal>
    </div>
  );
}
