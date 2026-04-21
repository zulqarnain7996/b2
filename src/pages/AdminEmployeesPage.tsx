import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Avatar } from "../components/Avatar";
import { CameraAutoCaptureModal } from "../components/CameraAutoCaptureModal";
import { DepartmentManagerCard } from "@/components/departments/DepartmentManagerCard";
import { useToast } from "../components/feedback/ToastProvider";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { Table } from "../components/ui/Table";
import { useDepartments } from "@/hooks/useDepartments";
import { apiClient } from "../services/apiClient";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { compressImage, elapsedMs, nowMs } from "../services/imageUtils";
import type { Employee } from "../types";

type EmployeeForm = {
  name: string;
  email: string;
  department: string;
  role: string;
  shift_start_time: string;
  grace_period_mins: number;
  late_fine_pkr: number;
  absent_fine_pkr: number;
  not_marked_fine_pkr: number;
  off_days: string[];
  password: string;
  resetPassword: boolean;
};

const OFF_DAY_OPTIONS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

function formatOffDays(days?: string[] | null) {
  return days && days.length ? days.map((day) => day[0].toUpperCase() + day.slice(1)).join(", ") : "Not Set";
}

const initialForm: EmployeeForm = {
  name: "",
  email: "",
  department: "",
  role: "user",
  shift_start_time: "09:00",
  grace_period_mins: 30,
  late_fine_pkr: 50,
  absent_fine_pkr: 100,
  not_marked_fine_pkr: 10,
  off_days: [],
  password: "",
  resetPassword: false,
};

export function AdminEmployeesPage() {
  const { isAdmin, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const {
    departments: departmentRecords,
    loading: departmentsLoading,
    error: departmentsError,
    reload: reloadDepartments,
  } = useDepartments({ admin: isAdmin, includeInactive: isAdmin });
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [usersCount, setUsersCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [captureMode, setCaptureMode] = useState<"add" | "edit" | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [enrolledEmployeeId, setEnrolledEmployeeId] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeeForm>(initialForm);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Employee>>({});
  const [reenrollImage, setReenrollImage] = useState<string | null>(null);
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const debouncedSearch = useDebouncedValue(search, 250);
  const isBlurryError = !!error && error.toLowerCase().includes("blurry");

  const hasCapture = useMemo(() => !!capturedImage, [capturedImage]);
  const currentEditEmployee = useMemo(
    () => employees.find((e) => e.id === editId) || null,
    [employees, editId],
  );
  const activeDepartmentOptions = useMemo(
    () => departmentRecords.filter((department) => department.is_active).map((department) => department.name),
    [departmentRecords],
  );
  const filterDepartmentOptions = useMemo(
    () => ["all", ...departmentRecords.map((department) => department.name)],
    [departmentRecords],
  );
  const editDepartmentOptions = useMemo(() => {
    const values = new Set(activeDepartmentOptions);
    if (editForm.department) {
      values.add(editForm.department);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [activeDepartmentOptions, editForm.department]);
  const filteredEmployees = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return employees.filter((emp) => {
      const matchesSearch =
        !q ||
        emp.name.toLowerCase().includes(q) ||
        emp.email.toLowerCase().includes(q) ||
        String(emp.id).toLowerCase().includes(q);
      const matchesRole = roleFilter === "all" || emp.role === roleFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? emp.isActive : !emp.isActive);
      const matchesDepartment = departmentFilter === "all" || emp.department === departmentFilter;
      return matchesSearch && matchesRole && matchesStatus && matchesDepartment;
    });
  }, [employees, debouncedSearch, roleFilter, statusFilter, departmentFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / pageSize));
  const pagedEmployees = useMemo(
    () => filteredEmployees.slice((page - 1) * pageSize, page * pageSize),
    [filteredEmployees, page],
  );

  const visibleEmployeeIds = useMemo(() => pagedEmployees.map((e) => e.id), [pagedEmployees]);
  const allVisibleSelected =
    visibleEmployeeIds.length > 0 && visibleEmployeeIds.every((id) => selectedEmployeeIds.includes(id));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, roleFilter, statusFilter, departmentFilter]);

  useEffect(() => {
    if (!form.department && activeDepartmentOptions.length) {
      setForm((prev) => ({ ...prev, department: activeDepartmentOptions[0] }));
    }
  }, [activeDepartmentOptions, form.department]);

  async function loadEmployees() {
    setLoading(true);
    setError("");
    try {
      const employeesPromise = apiClient.getEmployees();
      const usersPromise = isAdmin || hasPermission("can_manage_users")
        ? apiClient.getUsers()
        : Promise.resolve({ ok: true, users: [] });
      const [employeesRes, usersRes] = await Promise.all([
        employeesPromise,
        usersPromise,
      ]);
      setEmployees(employeesRes.employees);
      setUsersCount(usersRes.users.length);
      setSelectedEmployeeIds((prev) => prev.filter((id) => employeesRes.employees.some((emp) => emp.id === id)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load employees";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEmployees();
  }, [hasPermission, isAdmin]);

  function openEditModal(emp: Employee) {
    setEditId(emp.id);
    setEditForm({
      ...emp,
      shiftStartTime: emp.shiftStartTime || "09:00",
      gracePeriodMins: Number(emp.gracePeriodMins ?? 15),
      lateFinePkr: Number(emp.lateFinePkr ?? 0),
      absentFinePkr: Number(emp.absentFinePkr ?? 0),
      notMarkedFinePkr: Number(emp.notMarkedFinePkr ?? 0),
      offDays: emp.offDays || [],
    });
  }

  function toggleOffDay(days: string[], value: string) {
    return days.includes(value) ? days.filter((day) => day !== value) : [...days, value];
  }

  useEffect(() => {
    const editTarget = searchParams.get("edit");
    if (!editTarget || !employees.length) return;
    const target = employees.find((emp) => emp.id === editTarget);
    if (!target) return;
    openEditModal(target);
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
  }, [employees, searchParams, setSearchParams]);

  async function onEnrollSubmit(event: FormEvent) {
    event.preventDefault();
    if (!capturedImage) return;
    setSaving(true);
    setError("");

    const t0 = nowMs();
    try {
      const compressed = await compressImage(capturedImage, 920, 0.8);
      console.log("[timing] enroll compress(ms)", elapsedMs(t0));
      const t1 = nowMs();
      const enrollRes = await apiClient.enrollEmployee({ ...form, imageBase64: compressed });
      console.log("[timing] enroll request(ms)", elapsedMs(t1));

      setEnrolledEmployeeId(String(enrollRes.employee.id));
      setForm(initialForm);
      setCapturedImage(null);
      await loadEmployees();
      toast.success("Employee enrolled successfully.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Enrollment failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function performUpdateEmployee() {
    if (!editId) return;
    setSaving(true);
    setError("");
    try {
      let imageBase64: string | undefined;
      if (reenrollImage) {
        const t0 = nowMs();
        imageBase64 = await compressImage(reenrollImage, 920, 0.8);
        console.log("[timing] update compress(ms)", elapsedMs(t0));
      }
      const t1 = nowMs();
      await apiClient.updateEmployee(editId, {
        name: editForm.name,
        email: editForm.email,
        department: editForm.department,
        role: editForm.role,
        shift_start_time: (editForm.shiftStartTime || "") as string,
        grace_period_mins: Number(editForm.gracePeriodMins ?? 15),
        late_fine_pkr: Number(editForm.lateFinePkr ?? 0),
        absent_fine_pkr: Number(editForm.absentFinePkr ?? 0),
        not_marked_fine_pkr: Number(editForm.notMarkedFinePkr ?? 0),
        off_days: Array.isArray(editForm.offDays) ? editForm.offDays : [],
        is_active: editForm.isActive,
        imageBase64,
      });
      console.log("[timing] update request(ms)", elapsedMs(t1));
      setEditId(null);
      setReenrollImage(null);
      await loadEmployees();
      toast.success("Employee updated.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Update failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function onUpdateEmployee() {
    if (!editId) return;
    const wasActive = currentEditEmployee?.isActive ?? true;
    const nextActive = editForm.isActive ?? true;
    if (wasActive && !nextActive) {
      setConfirmDeactivateOpen(true);
      return;
    }
    void performUpdateEmployee();
  }

  function toggleSelectAllVisibleEmployees() {
    if (allVisibleSelected) {
      setSelectedEmployeeIds((prev) => prev.filter((id) => !visibleEmployeeIds.includes(id)));
      return;
    }
    setSelectedEmployeeIds((prev) => Array.from(new Set([...prev, ...visibleEmployeeIds])));
  }

  function toggleEmployeeSelection(id: string) {
    setSelectedEmployeeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function openDeleteConfirm(ids: string[]) {
    if (!ids.length) return;
    setPendingDeleteIds(ids);
    setConfirmDeleteOpen(true);
  }

  async function confirmDeleteEmployees() {
    if (!pendingDeleteIds.length) return;
    try {
      const res =
        pendingDeleteIds.length === 1
          ? await apiClient.deleteEmployee(pendingDeleteIds[0])
          : await apiClient.bulkDeleteEmployees(pendingDeleteIds.map((id) => Number(id)));
      toast.success(res.message);
      setConfirmDeleteOpen(false);
      setPendingDeleteIds([]);
      setSelectedEmployeeIds([]);
      await loadEmployees();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      toast.error(msg);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <PageHeader
        title="Employee Administration"
        subtitle="Capture face first, then complete enrollment details."
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={() => {
              if (!activeDepartmentOptions.length) {
                toast.error("Create at least one active department before enrolling an employee.");
                return;
              }
              setEnrolledEmployeeId(null);
              setCaptureMode("add");
            }}>Add Employee</Button>
            <Button variant="secondary" onClick={loadEmployees}>Refresh</Button>
          </div>
        }
      />

      {isAdmin ? (
        <DepartmentManagerCard
          departments={departmentRecords}
          loading={departmentsLoading}
          onRefresh={async () => {
            await reloadDepartments();
            await loadEmployees();
          }}
        />
      ) : null}

      <Card
        title="Enroll With Face Capture"
        subtitle="Capture and register a new employee identity."
      >
        {departmentsError ? <Alert variant="error">{departmentsError}</Alert> : null}
        {enrolledEmployeeId && (
          <Alert variant="success">
            Employee enrolled successfully. Assigned Employee ID: <strong>{enrolledEmployeeId}</strong>
          </Alert>
        )}
        {error && <Alert variant="error">{error}</Alert>}
        {isBlurryError && (
          <p className="mt-2 text-sm text-[rgb(var(--muted))]">
            Tips: use more light, hold steady, and move a bit closer to the camera.
          </p>
        )}

        <CameraAutoCaptureModal
          isOpen={captureMode === "add"}
          title="Capture Employee Face"
          scanContext="enroll"
          onClose={() => setCaptureMode(null)}
          onCapture={(img) => setCapturedImage(img)}
        />

        {hasCapture && (
          <Card title="Complete Enrollment" className="theme-surface-muted border">
            <form onSubmit={onEnrollSubmit} className="grid gap-3" autoComplete="off">
              <input type="text" name="fake-username" autoComplete="username" className="hidden" tabIndex={-1} />
              <input type="password" name="fake-password" autoComplete="new-password" className="hidden" tabIndex={-1} />
              <img src={capturedImage ?? undefined} alt="Captured" className="h-28 w-28 rounded-xl border border-[rgb(var(--border))] object-cover" />
              <div className="grid gap-3 md:grid-cols-2">
                <Input label="Full Name" placeholder="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                <Input label="Email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                <Select
                  label="Department"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  disabled={!activeDepartmentOptions.length}
                  required
                >
                  {!activeDepartmentOptions.length ? <option value="">No active departments</option> : null}
                  {activeDepartmentOptions.map((dep) => (
                    <option key={dep} value={dep}>
                      {dep}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Role"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value.toLowerCase() })}
                  required
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </Select>
                <Input
                  label="Login Password"
                  type="password"
                  placeholder="Login Password (min 6 chars)"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
                <p className="mb-3 text-sm font-semibold text-[rgb(var(--text))]">Shift & Fine Settings</p>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <Input
                    label="Shift Start Time"
                    type="time"
                    value={form.shift_start_time}
                    onChange={(e) => setForm({ ...form, shift_start_time: e.target.value })}
                    required
                  />
                  <Input
                    label="Grace Period (mins)"
                    type="number"
                    min={0}
                    step={1}
                    value={String(form.grace_period_mins)}
                    onChange={(e) => setForm({ ...form, grace_period_mins: Number(e.target.value || 0) })}
                    required
                  />
                  <Input
                    label="Late Fine (PKR)"
                    type="number"
                    min={0}
                    step="0.01"
                    value={String(form.late_fine_pkr)}
                    onChange={(e) => setForm({ ...form, late_fine_pkr: Number(e.target.value || 0) })}
                    required
                  />
                  <Input
                    label="Absent Fine (PKR)"
                    type="number"
                    min={0}
                    step="0.01"
                    value={String(form.absent_fine_pkr)}
                    onChange={(e) => setForm({ ...form, absent_fine_pkr: Number(e.target.value || 0) })}
                    required
                  />
                  <Input
                    label="Not Marked Fine (PKR)"
                    type="number"
                    min={0}
                    step="0.01"
                    value={String(form.not_marked_fine_pkr)}
                    onChange={(e) => setForm({ ...form, not_marked_fine_pkr: Number(e.target.value || 0) })}
                    required
                  />
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Off Days</p>
                  <div className="flex flex-wrap gap-2">
                    {OFF_DAY_OPTIONS.map((day) => {
                      const active = form.off_days.includes(day);
                      return (
                        <label
                          key={day}
                          className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                            active
                              ? "border-sky-400/35 bg-sky-500/12 text-sky-700 dark:text-sky-200"
                              : "border-[rgb(var(--border))] bg-[rgb(var(--surface-elevated))] text-[rgb(var(--text-soft))]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={active}
                            onChange={() => setForm((prev) => ({ ...prev, off_days: toggleOffDay(prev.off_days, day) }))}
                          />
                          <span className="capitalize">{day}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
              {!activeDepartmentOptions.length ? (
                <Alert variant="info">Create an active department first. Employee enrollment is blocked until one exists.</Alert>
              ) : null}
              <p className="text-sm text-[rgb(var(--muted))]">This password is for employee login.</p>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.resetPassword}
                  onChange={(e) => setForm({ ...form, resetPassword: e.target.checked })}
                />
                <span className="text-sm text-[rgb(var(--muted))]">Reset existing user password if this email already exists</span>
              </label>
              <div className="flex items-center gap-2">
                <Button type="submit" loading={saving} disabled={!activeDepartmentOptions.length}>{saving ? "Saving..." : "Enroll Employee"}</Button>
                <Button variant="secondary" type="button" onClick={() => setCapturedImage(null)}>Discard Capture</Button>
              </div>
            </form>
          </Card>
        )}
      </Card>

      <Card
        title="Employee Directory"
        actions={
          <Button
            variant="danger"
            disabled={!selectedEmployeeIds.length}
            onClick={() => openDeleteConfirm(selectedEmployeeIds)}
            title="Delete selected employees"
          >
            Delete Selected ({selectedEmployeeIds.length})
          </Button>
        }
      >
        <div className="mb-3 grid gap-3 md:grid-cols-4">
          <Input placeholder="Search name/email/id" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as "all" | "admin" | "user")}>
            <option value="all">All roles</option>
            <option value="admin">Admin</option>
            <option value="user">User</option>
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}>
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
          <Select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
            {filterDepartmentOptions.map((d) => (
              <option key={d} value={d}>
                {d === "all" ? "All departments" : d}
              </option>
            ))}
          </Select>
        </div>

        {loading && (
          <div className="inline-flex items-center gap-2 text-sm text-[rgb(var(--muted))]">
            <Spinner /> Loading employees...
          </div>
        )}

        {!loading && !employees.length && (
          <EmptyState
            title={usersCount > 0 ? "No employees enrolled yet" : "No employees yet"}
            message={
              usersCount > 0
                ? "Users exist, but no employee records were found. Enroll employees from Admin Add Employees."
                : "Add your first employee to start attendance tracking."
            }
            action={<Button onClick={() => setCaptureMode("add")}>Enroll Employee</Button>}
          />
        )}

        {!loading && !!employees.length && !filteredEmployees.length && (
          <EmptyState title="No employees match filters" message="Try clearing search or filters." />
        )}

        {!!filteredEmployees.length && (
          <>
            <Table stickyHeader zebra hoverRows>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisibleEmployees}
                      aria-label="Select all visible employees"
                    />
                  </th>
                  <th>Avatar</th>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Off Days</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedEmployees.map((emp) => (
                  <tr
                    key={emp.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/admin/employees/${encodeURIComponent(emp.id)}`)}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedEmployeeIds.includes(emp.id)}
                        onChange={() => toggleEmployeeSelection(emp.id)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Select employee ${emp.id}`}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="rounded-full transition-transform duration-200 hover:scale-[1.03]"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/admin/employees/${encodeURIComponent(emp.id)}`);
                        }}
                        aria-label={`Open employee ${emp.name}`}
                      >
                        <Avatar name={emp.name} src={emp.photoUrl} />
                      </button>
                    </td>
                    <td>{emp.id}</td>
                    <td>
                      <button
                        type="button"
                        className="text-left font-medium text-[rgb(var(--text))] transition-colors duration-200 hover:text-sky-700 dark:hover:text-sky-300"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/admin/employees/${encodeURIComponent(emp.id)}`);
                        }}
                      >
                        {emp.name}
                      </button>
                    </td>
                    <td>{emp.email}</td>
                    <td>{emp.department}</td>
                    <td><Badge variant={emp.role === "admin" ? "admin" : "user"}>{emp.role}</Badge></td>
                      <td>
                        <Badge variant={emp.isActive ? "success" : "warn"}>
                          {emp.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="text-sm text-[rgb(var(--text-soft))]">{formatOffDays(emp.offDays)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditModal(emp);
                          }}
                          title="Edit employee"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            openDeleteConfirm([emp.id]);
                          }}
                          title="Delete employee"
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="mt-3 flex items-center justify-between text-sm text-[rgb(var(--text-soft))]">
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
      </Card>

      <Modal
        isOpen={!!editId}
        title={editId ? `Edit Employee #${editId}` : "Edit Employee"}
        onClose={() => {
          setEditId(null);
          setReenrollImage(null);
        }}
        width="lg"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setCaptureMode("edit")}>Capture New Face</Button>
            <Button variant="ghost" onClick={() => {
              setEditId(null);
              setReenrollImage(null);
            }}>
              Cancel
            </Button>
            <Button loading={saving} onClick={onUpdateEmployee}>{saving ? "Saving..." : "Save Changes"}</Button>
          </>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="Name" value={editForm.name || ""} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name" />
          <Input label="Email" value={editForm.email || ""} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="Email" />
          <Select
            label="Department"
            value={editForm.department || ""}
            onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
            disabled={!editDepartmentOptions.length}
          >
            {!editDepartmentOptions.length ? <option value="">No available departments</option> : null}
            {editDepartmentOptions.map((dep) => (
              <option key={dep} value={dep}>
                {dep}
              </option>
            ))}
          </Select>
          <Select
            label="Role"
            value={(editForm.role || "user").toLowerCase()}
            onChange={(e) => setEditForm({ ...editForm, role: e.target.value.toLowerCase() })}
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </Select>
          <Select label="Status" value={String(editForm.isActive ?? true)} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.value === "true" })}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
          <Input
            label="Shift Start Time"
            type="time"
            value={String(editForm.shiftStartTime || "09:00").slice(0, 5)}
            onChange={(e) => setEditForm({ ...editForm, shiftStartTime: e.target.value })}
          />
          <Input
            label="Grace Period (mins)"
            type="number"
            min={0}
            step={1}
            value={String(editForm.gracePeriodMins ?? 15)}
            onChange={(e) => setEditForm({ ...editForm, gracePeriodMins: Number(e.target.value || 0) })}
          />
          <Input
            label="Late Fine (PKR)"
            type="number"
            min={0}
            step="0.01"
            value={String(editForm.lateFinePkr ?? 0)}
            onChange={(e) => setEditForm({ ...editForm, lateFinePkr: Number(e.target.value || 0) })}
          />
          <Input
            label="Absent Fine (PKR)"
            type="number"
            min={0}
            step="0.01"
            value={String(editForm.absentFinePkr ?? 0)}
            onChange={(e) => setEditForm({ ...editForm, absentFinePkr: Number(e.target.value || 0) })}
          />
          <Input
            label="Not Marked Fine (PKR)"
            type="number"
            min={0}
            step="0.01"
            value={String(editForm.notMarkedFinePkr ?? 0)}
            onChange={(e) => setEditForm({ ...editForm, notMarkedFinePkr: Number(e.target.value || 0) })}
          />
        </div>
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Off Days</p>
          <div className="flex flex-wrap gap-2">
            {OFF_DAY_OPTIONS.map((day) => {
              const active = Array.isArray(editForm.offDays) && editForm.offDays.includes(day);
              return (
                <label
                  key={day}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "border-sky-400/35 bg-sky-500/12 text-sky-700 dark:text-sky-200"
                      : "border-[rgb(var(--border))] bg-[rgb(var(--surface-elevated))] text-[rgb(var(--text-soft))]"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={active}
                    onChange={() =>
                      setEditForm((prev) => ({
                        ...prev,
                        offDays: toggleOffDay(Array.isArray(prev.offDays) ? prev.offDays : [], day),
                      }))
                    }
                  />
                  <span className="capitalize">{day}</span>
                </label>
              );
            })}
          </div>
        </div>
        {reenrollImage && <img src={reenrollImage} alt="Re-enroll" className="mt-3 h-28 w-28 rounded-xl border border-[rgb(var(--border))] object-cover" />}
      </Modal>

      <CameraAutoCaptureModal
        isOpen={captureMode === "edit" && !!editId}
        title="Re-enroll Face"
        scanContext="enroll"
        onClose={() => setCaptureMode(null)}
        onCapture={(img) => setReenrollImage(img)}
      />

      <Modal
        isOpen={confirmDeactivateOpen}
        title="Confirm status change"
        onClose={() => setConfirmDeactivateOpen(false)}
        width="md"
        footer={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setConfirmDeactivateOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmDeactivateOpen(false);
                void performUpdateEmployee();
              }}
            >
              Deactivate
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[rgb(var(--muted))]">This employee will be marked inactive. Continue?</p>
      </Modal>

      <Modal
        isOpen={confirmDeleteOpen}
        title="Confirm employee deletion"
        onClose={() => {
          setConfirmDeleteOpen(false);
          setPendingDeleteIds([]);
        }}
        width="md"
        footer={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setConfirmDeleteOpen(false);
                setPendingDeleteIds([]);
              }}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDeleteEmployees}>
              Delete {pendingDeleteIds.length > 1 ? `${pendingDeleteIds.length} Employees` : "Employee"}
            </Button>
          </div>
        }
      >
        {pendingDeleteIds.length === 1 ? (
          <p className="text-sm text-[rgb(var(--muted))]">Delete this employee? This will remove attendance + face embeddings.</p>
        ) : (
          <p className="text-sm text-[rgb(var(--muted))]">
            Delete {pendingDeleteIds.length} employees? This will remove attendance + face embeddings.
          </p>
        )}
      </Modal>
    </div>
  );
}
