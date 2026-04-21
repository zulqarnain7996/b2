import {
  LayoutDashboard,
  ClipboardCheck,
  History,
  Shield,
  Users,
  Logs,
  KeyRound,
  CalendarDays,
  LogOut,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  DatabaseBackup,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComponentType } from "react";
import type { AuthUser, PermissionKey } from "@/types";
import { SidebarNavItem } from "./SidebarNavItem";

export type AppRole = "admin" | "user";

type SidebarItem = {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  roles: AppRole[];
  permission?: PermissionKey;
};

export const sidebarItems: SidebarItem[] = [
  { label: "Dashboard", to: "/admin/dashboard", icon: LayoutDashboard, roles: ["admin"] },
  { label: "Dashboard", to: "/user/dashboard", icon: LayoutDashboard, roles: ["user"] },
  { label: "Admin Add Employees", to: "/admin/employees", icon: Users, roles: ["admin", "user"], permission: "can_manage_employees" },
  { label: "Users", to: "/admin/users", icon: Users, roles: ["admin", "user"], permission: "can_manage_users" },
  { label: "All Attendance", to: "/admin/all-attendance", icon: Shield, roles: ["admin", "user"], permission: "can_view_all_attendance" },
  { label: "Audit Logs", to: "/admin/audit-logs", icon: Logs, roles: ["admin", "user"], permission: "can_view_audit_logs" },
  { label: "Backup & Restore", to: "/admin/backup", icon: DatabaseBackup, roles: ["admin", "user"], permission: "can_backup_restore" },
  { label: "Manage Notices", to: "/admin/notices", icon: Megaphone, roles: ["admin", "user"], permission: "can_manage_notices" },
  { label: "Employee Check-in", to: "/checkin", icon: ClipboardCheck, roles: ["admin", "user"] },
  { label: "Notices", to: "/notices", icon: Megaphone, roles: ["admin", "user"] },
  { label: "My History", to: "/history", icon: History, roles: ["admin", "user"] },
  { label: "Monthly Attendance", to: "/monthly-attendance", icon: CalendarDays, roles: ["admin", "user"] },
  { label: "Change Password", to: "/change-password", icon: KeyRound, roles: ["admin", "user"] },
];

type SidebarProps = {
  user: AuthUser;
  open: boolean;
  compact?: boolean;
  onToggleCompact?: () => void;
  onClose: () => void;
  onLogout: () => void;
};

export function Sidebar({ user, open, compact = false, onToggleCompact, onClose, onLogout }: SidebarProps) {
  const role = user.role;
  const allowed = sidebarItems.filter((item) => {
    if (!item.roles.includes(role)) return false;
    if (!item.permission) return true;
    return role === "admin" || !!user.permissions?.some((assignment) => assignment.key === item.permission);
  });
  const overviewItems = allowed.filter((item) => item.label.includes("Dashboard") || item.label === "Notices");
  const adminItems = allowed.filter((item) => item.to.startsWith("/admin/") && !item.label.includes("Dashboard"));
  const workspaceItems = allowed.filter((item) => !item.to.startsWith("/admin/") && !overviewItems.some((x) => x.to === item.to));

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,251,255,0.96))] px-3.5 pb-3 pt-3.5 shadow-[0_20px_48px_rgba(148,163,184,0.18)] backdrop-blur-xl transition-[width,transform,padding,box-shadow] duration-300 ease-out dark:border-r-white/6 dark:bg-[linear-gradient(180deg,rgba(var(--shell-panel),0.98),rgba(var(--shell-panel-2),0.98))] dark:shadow-[0_36px_90px_rgba(2,6,23,0.5)] lg:translate-x-0 lg:shadow-none",
        compact ? "w-28 px-2.5" : "w-80",
        open ? "translate-x-0" : "-translate-x-full",
      )}
      aria-label="Primary navigation"
    >
      <div
        className={cn(
          "mb-3 flex items-start justify-between gap-2.5 rounded-[26px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.62),rgba(248,251,255,0.92))] p-2.5 shadow-[0_14px_34px_rgba(148,163,184,0.12)] dark:border-white/7 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))] dark:shadow-[0_24px_48px_rgba(2,6,23,0.26)]",
          compact && "items-center justify-center px-2 py-2.5",
        )}
      >
        <div className={cn("flex items-center gap-2.5", compact && "flex-col gap-1.5")}>
          <div className="grid h-10 w-10 place-items-center rounded-[18px] border border-sky-200/80 bg-[linear-gradient(135deg,#0f4ea8,#1699d6)] text-sm font-bold text-white shadow-[0_14px_28px_rgba(14,116,144,0.22)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.04))] dark:text-white dark:shadow-[0_18px_36px_rgba(2,6,23,0.36)]">
            IA
          </div>
          <div className={cn("transition-all duration-200", compact && "hidden")}>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">IVS AttendPro</p>
            <p className="text-xs text-slate-500 dark:text-slate-300">Iqra Virtual School</p>
          </div>
        </div>
        <div className={cn("flex items-center gap-1", compact && "hidden lg:flex")}>
          <button
            className="hidden rounded-2xl border border-slate-200/80 bg-white/88 p-2 text-slate-500 shadow-[0_8px_18px_rgba(148,163,184,0.08)] transition hover:bg-slate-50 hover:text-slate-900 dark:border-white/5 dark:bg-white/[0.045] dark:text-slate-300 dark:shadow-none dark:hover:bg-white/[0.09] dark:hover:text-white lg:inline-flex"
            aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}
            onClick={onToggleCompact}
            title={compact ? "Expand sidebar" : "Collapse sidebar"}
          >
            {compact ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
          <button
            className="rounded-2xl border border-slate-200/80 bg-white/88 p-2 text-slate-500 shadow-[0_8px_18px_rgba(148,163,184,0.08)] transition hover:bg-slate-50 hover:text-slate-900 dark:border-white/5 dark:bg-white/[0.045] dark:text-slate-300 dark:shadow-none dark:hover:bg-white/[0.09] dark:hover:text-white lg:hidden"
            aria-label="Close sidebar"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <nav className={cn("sidebar-scroll min-h-0 flex-1 space-y-4 overflow-y-auto pb-1 pr-1", compact && "space-y-3.5 pr-0")}>
        <div className="space-y-1.5">
          {!compact ? (
            <p className="px-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[rgb(var(--muted))] dark:text-slate-400">
              Overview
            </p>
          ) : null}
          {overviewItems.map((item) => (
            <SidebarNavItem key={item.to} label={item.label} to={item.to} icon={item.icon} onClick={onClose} compact={compact} />
          ))}
        </div>

        {workspaceItems.length ? (
          <div className="space-y-1.5">
            {!compact ? (
              <p className="px-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[rgb(var(--muted))] dark:text-slate-400">
                Workspace
              </p>
            ) : null}
            {workspaceItems.map((item) => (
              <SidebarNavItem key={item.to} label={item.label} to={item.to} icon={item.icon} onClick={onClose} compact={compact} />
            ))}
          </div>
        ) : null}

        {adminItems.length ? (
          <div className="space-y-1.5">
            {!compact ? (
              <p className="px-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[rgb(var(--muted))] dark:text-slate-400">
                Administration
              </p>
            ) : null}
            {adminItems.map((item) => (
              <SidebarNavItem key={item.to} label={item.label} to={item.to} icon={item.icon} onClick={onClose} compact={compact} />
            ))}
          </div>
        ) : null}
      </nav>

      <button
        onClick={onLogout}
        className={cn(
          "mt-3 flex w-full items-center gap-2.5 rounded-[22px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(249,251,255,0.96),rgba(244,248,255,0.92))] px-3 py-2.5 text-sm font-medium text-slate-600 shadow-[0_12px_24px_rgba(148,163,184,0.1)] transition-all duration-200 hover:-translate-y-0.5 hover:border-rose-300/40 hover:bg-rose-50 hover:text-rose-700 hover:shadow-[0_16px_28px_rgba(244,63,94,0.12)] dark:border-white/6 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] dark:text-slate-200 dark:shadow-[0_18px_34px_rgba(2,6,23,0.24)] dark:hover:border-rose-300/18 dark:hover:bg-[linear-gradient(180deg,rgba(127,29,29,0.22),rgba(69,10,10,0.16))] dark:hover:text-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[rgb(var(--shell-panel))]",
          compact && "justify-center px-2 py-2",
        )}
        title={compact ? "Sign Out" : undefined}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[15px] border border-transparent bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] transition dark:bg-white/[0.06] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <LogOut className="h-4 w-4" />
        </span>
        {!compact ? <span>Sign Out</span> : null}
      </button>
    </aside>
  );
}
