import { Suspense, lazy } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { LoginNoticeGate } from "@/components/notices/LoginNoticeGate";
import type { PermissionKey } from "@/types";

const AdminDashboardPage = lazy(() => import("@/pages/AdminDashboardPage").then((m) => ({ default: m.AdminDashboardPage })));
const AdminAllAttendancePage = lazy(() => import("@/pages/AdminAllAttendancePage").then((m) => ({ default: m.AdminAllAttendancePage })));
const AdminEmployeeAttendanceReportPage = lazy(() => import("@/pages/AdminEmployeeAttendanceReportPage").then((m) => ({ default: m.AdminEmployeeAttendanceReportPage })));
const AdminEmployeesPage = lazy(() => import("@/pages/AdminEmployeesPage").then((m) => ({ default: m.AdminEmployeesPage })));
const AdminEmployeeDetailsPage = lazy(() => import("@/pages/AdminEmployeeDetailsPage").then((m) => ({ default: m.AdminEmployeeDetailsPage })));
const AdminUsersPage = lazy(() => import("@/pages/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })));
const AdminLogsPage = lazy(() => import("@/pages/AdminLogsPage").then((m) => ({ default: m.AdminLogsPage })));
const AdminNoticesPage = lazy(() => import("@/pages/AdminNoticesPage").then((m) => ({ default: m.AdminNoticesPage })));
const AdminBackupRestorePage = lazy(() => import("@/pages/AdminBackupRestorePage").then((m) => ({ default: m.AdminBackupRestorePage })));
const AdminTodayAttendancePage = lazy(() => import("@/pages/AdminTodayAttendancePage").then((m) => ({ default: m.AdminTodayAttendancePage })));
const EmployeeCheckInPage = lazy(() => import("@/pages/EmployeeCheckInPage").then((m) => ({ default: m.EmployeeCheckInPage })));
const ChangePasswordPage = lazy(() => import("@/pages/ChangePasswordPage").then((m) => ({ default: m.ChangePasswordPage })));
const LoginPage = lazy(() => import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const MonthlyAttendancePage = lazy(() => import("@/pages/MonthlyAttendancePage").then((m) => ({ default: m.MonthlyAttendancePage })));
const MyHistoryPage = lazy(() => import("@/pages/MyHistoryPage").then((m) => ({ default: m.MyHistoryPage })));
const NotAuthorizedPage = lazy(() => import("@/pages/NotAuthorizedPage").then((m) => ({ default: m.NotAuthorizedPage })));
const NoticesPage = lazy(() => import("@/pages/NoticesPage").then((m) => ({ default: m.NoticesPage })));
const UserDashboardPage = lazy(() => import("@/pages/UserDashboardPage").then((m) => ({ default: m.UserDashboardPage })));

function RequireAuth() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="px-6 py-10 text-sm text-slate-500">Loading session...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RequireAdmin() {
  const { isAdmin, loading } = useAuth();
  if (loading) return <div className="px-6 py-10 text-sm text-slate-500">Loading session...</div>;
  if (!isAdmin) return <NotAuthorizedPage />;
  return <Outlet />;
}

function RequirePermission({ permission }: { permission: PermissionKey }) {
  const { loading, hasPermission } = useAuth();
  if (loading) return <div className="px-6 py-10 text-sm text-slate-500">Loading session...</div>;
  if (!hasPermission(permission)) return <NotAuthorizedPage />;
  return <Outlet />;
}

function RequireUser() {
  const { isAdmin, loading } = useAuth();
  if (loading) return <div className="px-6 py-10 text-sm text-slate-500">Loading session...</div>;
  if (isAdmin) return <Navigate to="/admin/dashboard" replace />;
  return <Outlet />;
}

function ProtectedLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  if (!user) return null;
  if (user.forcePasswordChange && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }
  return (
    <>
      <AppShell user={user} onLogout={logout} />
      <LoginNoticeGate />
    </>
  );
}

export function App() {
  const { isAuthenticated, isAdmin } = useAuth();
  const homeRoute = isAuthenticated ? (isAdmin ? "/admin/dashboard" : "/user/dashboard") : "/login";

  return (
    <Suspense fallback={<div className="px-6 py-10 text-sm text-slate-500">Loading page...</div>}>
      <Routes>
      <Route
        path="/"
        element={<Navigate to={homeRoute} replace />}
      />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<ProtectedLayout />}>
          <Route path="/dashboard" element={<Navigate to={isAdmin ? "/admin/dashboard" : "/user/dashboard"} replace />} />
          <Route element={<RequireUser />}>
            <Route path="/user/dashboard" element={<UserDashboardPage />} />
          </Route>
          <Route path="/checkin" element={<EmployeeCheckInPage />} />
          <Route path="/history" element={<MyHistoryPage />} />
          <Route path="/monthly-attendance" element={<MonthlyAttendancePage />} />
          <Route path="/notices" element={<NoticesPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/employee/checkin" element={<Navigate to="/checkin" replace />} />
          <Route path="/employee/history" element={<Navigate to="/history" replace />} />

          <Route element={<RequirePermission permission="can_view_all_attendance" />}>
            <Route path="/admin/attendance" element={<AdminAllAttendancePage />} />
            <Route path="/admin/all-attendance" element={<AdminAllAttendancePage />} />
            <Route path="/admin/attendance/employee/:employeeId" element={<AdminEmployeeAttendanceReportPage />} />
          </Route>

          <Route element={<RequirePermission permission="can_manage_notices" />}>
            <Route path="/admin/notices" element={<AdminNoticesPage />} />
          </Route>

          <Route element={<RequirePermission permission="can_manage_employees" />}>
            <Route path="/admin/employees" element={<AdminEmployeesPage />} />
            <Route path="/admin/employees/:employeeId" element={<AdminEmployeeDetailsPage />} />
          </Route>

          <Route element={<RequirePermission permission="can_manage_users" />}>
            <Route path="/admin/users" element={<AdminUsersPage />} />
          </Route>

          <Route element={<RequirePermission permission="can_view_audit_logs" />}>
            <Route path="/admin/logs" element={<AdminLogsPage />} />
            <Route path="/admin/audit-logs" element={<AdminLogsPage />} />
          </Route>

          <Route element={<RequirePermission permission="can_backup_restore" />}>
            <Route path="/admin/backup" element={<AdminBackupRestorePage />} />
          </Route>

          <Route element={<RequireAdmin />}>
            <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="/admin/today" element={<AdminTodayAttendancePage />} />
          </Route>
        </Route>
      </Route>

        <Route path="*" element={<Navigate to={homeRoute} replace />} />
      </Routes>
    </Suspense>
  );
}
