import { LayoutDashboard, ClipboardCheck, History, Shield, Users, Logs, KeyRound, CalendarDays, LogOut, Megaphone, PanelLeftClose, PanelLeftOpen, DatabaseBackup, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComponentType } from "react";
import { SidebarNavItem } from "./SidebarNavItem";

export type AppRole = "admin" | "user";

type SidebarItem = {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  roles: AppRole[];
};

export const sidebarItems: SidebarItem[] = [
  { label: "Dashboard", to: "/admin/dashboard", icon: LayoutDashboard, roles: ["admin"] },
  { label: "Dashboard", to: "/user/dashboard", icon: LayoutDashboard, roles: ["user"] },
  { label: "Admin Add Employees", to: "/admin/employees", icon: Users, roles: ["admin"] },
  { label: "Users", to: "/admin/users", icon: Users, roles: ["admin"] },
  { label: "All Attendance", to: "/admin/all-attendance", icon: Shield, roles: ["admin"] },
  { label: "Audit Logs", to: "/admin/audit-logs", icon: Logs, roles: ["admin"] },
  { label: "Backup & Restore", to: "/admin/backup", icon: DatabaseBackup, roles: ["admin"] },
  { label: "Manage Notices", to: "/admin/notices", icon: Megaphone, roles: ["admin"] },
  { label: "Employee Check-in", to: "/checkin", icon: ClipboardCheck, roles: ["admin", "user"] },
  { label: "Notices", to: "/notices", icon: Megaphone, roles: ["admin", "user"] },
  { label: "My History", to: "/history", icon: History, roles: ["admin", "user"] },
  { label: "Monthly Attendance", to: "/monthly-attendance", icon: CalendarDays, roles: ["admin", "user"] },
  { label: "Change Password", to: "/change-password", icon: KeyRound, roles: ["admin", "user"] },
];

type SidebarProps = {
  role: AppRole;
  open: boolean;
  compact?: boolean;
  onToggleCompact?: () => void;
  onClose: () => void;
  onLogout: () => void;
};

export function Sidebar({ role, open, compact = false, onToggleCompact, onClose, onLogout }: SidebarProps) {
  const allowed = sidebarItems.filter((item) => item.roles.includes(role));
  const overviewItems = allowed.filter((item) => item.label.includes("Dashboard") || item.label === "Notices");
  const adminItems = allowed.filter((item) => item.to.startsWith("/admin/") && !item.label.includes("Dashboard"));
  const workspaceItems = allowed.filter((item) => !item.to.startsWith("/admin/") && !overviewItems.some((x) => x.to === item.to));

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-[rgb(var(--border))] bg-[rgb(var(--surface))]/95 px-3 pb-4 pt-5 shadow-xl backdrop-blur transition-all duration-200 lg:translate-x-0 lg:shadow-none",
        compact ? "w-24" : "w-80",
        open ? "translate-x-0" : "-translate-x-full",
      )}
      aria-label="Primary navigation"
    >
      <div className="mb-5 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-sm font-bold text-white shadow-md">
            VT
          </div>
          <div className={cn(compact && "hidden")}>
            <p className="text-sm font-semibold text-[rgb(var(--text))]">VisionTrack Pro</p>
            <p className="text-xs text-[rgb(var(--muted))]">IVS Workforce Console</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="hidden rounded-lg p-2 text-[rgb(var(--muted))] hover:bg-[color-mix(in_srgb,rgb(var(--surface))_88%,rgb(var(--text)))] lg:inline-flex"
            aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}
            onClick={onToggleCompact}
            title={compact ? "Expand sidebar" : "Collapse sidebar"}
          >
            {compact ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
          <button
            className="rounded-lg p-2 text-[rgb(var(--muted))] hover:bg-[color-mix(in_srgb,rgb(var(--surface))_88%,rgb(var(--text)))] lg:hidden"
            aria-label="Close sidebar"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mb-4 h-px w-full bg-[rgb(var(--border))]" />

      <nav className="flex-1 space-y-4 overflow-y-auto pb-2">
        <div className="space-y-1.5">
          {!compact ? <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[rgb(var(--muted))]">Overview</p> : null}
          {overviewItems.map((item) => (
            <SidebarNavItem key={item.to} label={item.label} to={item.to} icon={item.icon} onClick={onClose} compact={compact} />
          ))}
        </div>

        {workspaceItems.length ? (
          <div className="space-y-1.5">
            {!compact ? <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[rgb(var(--muted))]">Workspace</p> : null}
            {workspaceItems.map((item) => (
              <SidebarNavItem key={item.to} label={item.label} to={item.to} icon={item.icon} onClick={onClose} compact={compact} />
            ))}
          </div>
        ) : null}

        {adminItems.length ? (
          <div className="space-y-1.5">
            {!compact ? <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[rgb(var(--muted))]">Admin</p> : null}
            {adminItems.map((item) => (
              <SidebarNavItem key={item.to} label={item.label} to={item.to} icon={item.icon} onClick={onClose} compact={compact} />
            ))}
          </div>
        ) : null}
      </nav>

      <button
        onClick={onLogout}
        className={cn(
          "mt-4 flex w-full items-center gap-3 rounded-xl border border-rose-300/70 bg-rose-50/60 px-3 py-2.5 text-sm font-medium text-rose-700 transition hover:-translate-y-0.5 hover:shadow-sm hover:bg-rose-100/70 dark:border-rose-500/40 dark:bg-rose-950/30 dark:text-rose-300",
          compact && "justify-center px-2.5",
        )}
        title={compact ? "Sign Out" : undefined}
      >
        <LogOut className="h-4 w-4" />
        {!compact ? <span>Sign Out</span> : null}
      </button>
    </aside>
  );
}
