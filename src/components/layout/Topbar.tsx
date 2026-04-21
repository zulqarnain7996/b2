import { Menu, Moon, Search, Sun, LogOut, KeyRound, ChevronDown, ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AuthUser } from "@/types";
import { useTheme } from "@/theme/ThemeContext";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { toFileUrl } from "@/services/apiClient";
import { formatTopbarDateTime } from "@/utils/date";

type TopbarProps = {
  user: AuthUser;
  onMenuClick: () => void;
  onLogout: () => void;
  compactSidebar?: boolean;
};

const pageTitles: Array<{ pattern: RegExp; label: string; subtitle: string }> = [
  { pattern: /^\/dashboard$/, label: "Dashboard", subtitle: "Operational workspace" },
  { pattern: /^\/admin\/dashboard$/, label: "Admin Dashboard", subtitle: "Operational workspace" },
  { pattern: /^\/user\/dashboard$/, label: "User Dashboard", subtitle: "Operational workspace" },
  { pattern: /^\/admin\/employees$/, label: "Admin Employees", subtitle: "Manage employee directory" },
  { pattern: /^\/admin\/employees\/.+$/, label: "Employee Details", subtitle: "Profile, account, and security actions" },
  { pattern: /^\/admin\/users$/, label: "Users", subtitle: "Manage login accounts" },
  { pattern: /^\/admin\/attendance$/, label: "All Attendance", subtitle: "Track daily check-in activity" },
  { pattern: /^\/admin\/all-attendance$/, label: "All Attendance", subtitle: "Track daily check-in activity" },
  { pattern: /^\/admin\/attendance\/employee\/.+$/, label: "Employee Attendance Report", subtitle: "Detailed per-employee record" },
  { pattern: /^\/admin\/logs$/, label: "Audit Logs", subtitle: "Security and activity logs" },
  { pattern: /^\/admin\/audit-logs$/, label: "Audit Logs", subtitle: "Security and activity logs" },
  { pattern: /^\/admin\/backup$/, label: "Backup & Restore", subtitle: "Database and uploads recovery" },
  { pattern: /^\/admin\/notices$/, label: "Manage Notices", subtitle: "Create and organize notices" },
  { pattern: /^\/checkin$/, label: "Employee Check-in", subtitle: "Photo attendance workspace" },
  { pattern: /^\/history$/, label: "My History", subtitle: "Your attendance timeline" },
  { pattern: /^\/monthly-attendance$/, label: "Monthly Attendance", subtitle: "Calendar attendance view" },
  { pattern: /^\/notices$/, label: "Notices", subtitle: "Company announcements" },
  { pattern: /^\/change-password$/, label: "Change Password", subtitle: "Security preferences" },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  return `${parts[0][0]}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

export function Topbar({ user, onMenuClick, onLogout, compactSidebar = false }: TopbarProps) {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const menuRef = useRef<HTMLDivElement | null>(null);

  const pageMeta = useMemo(() => {
    const matched = pageTitles.find((item) => item.pattern.test(location.pathname));
    return matched ?? { label: "Workspace", subtitle: "Operational workspace" };
  }, [location.pathname]);
  const profilePhoto = useMemo(() => {
    const candidate = user.photoUrl || (user as AuthUser & { photo_url?: string | null }).photo_url;
    return candidate ? toFileUrl(candidate) : "";
  }, [user]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(new Date());
    }, 30_000);
    return () => window.clearInterval(timerId);
  }, []);

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-slate-200/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,251,255,0.84))] text-slate-900 shadow-[0_10px_28px_rgba(148,163,184,0.08)] backdrop-blur-xl dark:border-white/5 dark:bg-[linear-gradient(180deg,rgba(8,12,20,0.72),rgba(8,12,20,0.46))] dark:text-white dark:shadow-[0_18px_36px_rgba(2,6,23,0.26)]">
      <div className={cn("h-full transition-[padding] duration-300 ease-out", compactSidebar ? "lg:pl-28" : "lg:pl-80")}>
        <div className="mx-auto flex h-full w-full max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={onMenuClick}
              aria-label="Open menu"
              className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-elevated))] p-2 text-[rgb(var(--muted))] transition hover:bg-[rgb(var(--surface-muted))] hover:text-[rgb(var(--text))] dark:border-white/5 dark:bg-white/[0.045] dark:text-slate-200 dark:hover:bg-white/[0.08] dark:hover:text-white lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1 truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                <span>IVS AttendPro</span>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="dark:text-white">{pageMeta.label}</span>
              </div>
              <p className="truncate text-sm text-slate-500 dark:text-slate-200">{pageMeta.subtitle}</p>
            </div>
          </div>

          <div className="hidden w-full max-w-sm xl:block">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--muted))]" />
              <Input
                className="h-11 rounded-[20px] border-slate-200/80 bg-white/88 pl-9 shadow-[0_8px_18px_rgba(148,163,184,0.08)] dark:border-white/5 dark:bg-white/[0.045] dark:text-white dark:placeholder:text-slate-400 dark:shadow-none dark:focus:border-white/10 dark:focus:ring-[rgba(255,255,255,0.06)]"
                placeholder="Search workspace..."
              />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden rounded-[20px] border border-slate-200/80 bg-white/84 px-3.5 py-2 text-xs text-slate-600 shadow-[0_8px_18px_rgba(148,163,184,0.08)] dark:border-white/5 dark:bg-white/[0.045] dark:text-slate-200 dark:shadow-none md:block">
              {formatTopbarDateTime(now)}
            </div>
            <button
              onClick={toggleTheme}
              title="Toggle dark mode"
              className="rounded-[20px] border border-slate-200/80 bg-white/88 p-2.5 text-slate-500 shadow-[0_8px_18px_rgba(148,163,184,0.08)] transition hover:bg-slate-50 hover:text-slate-900 dark:border-white/5 dark:bg-white/[0.045] dark:text-slate-200 dark:shadow-none dark:hover:bg-white/[0.08] dark:hover:text-white"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 rounded-[22px] border border-slate-200/80 bg-white/90 px-2.5 py-1.5 shadow-[0_10px_22px_rgba(148,163,184,0.1)] transition hover:bg-slate-50 dark:border-white/5 dark:bg-white/[0.05] dark:shadow-none dark:hover:bg-white/[0.09]"
              >
                {profilePhoto ? (
                  <img
                    src={profilePhoto}
                    alt={user.name}
                    className="h-8 w-8 rounded-full border border-slate-200 object-cover ring-1 ring-white/70 dark:border-white/12 dark:ring-black/25"
                  />
                ) : (
                  <span className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.06))] text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                    {initials(user.name)}
                  </span>
                )}
                <div className="hidden min-w-0 text-left md:block">
                  <p className="max-w-[140px] truncate text-sm font-semibold text-slate-900 dark:text-white">{user.name}</p>
                  <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300/95">{user.role}</p>
                </div>
                <ChevronDown className="hidden h-4 w-4 shrink-0 text-slate-500 dark:text-slate-100 md:block" />
              </button>

              <div
                className={cn(
                  "absolute right-0 mt-2 w-56 origin-top-right rounded-2xl border border-slate-200/80 bg-white/96 p-1.5 text-sm shadow-[0_16px_36px_rgba(148,163,184,0.16)] transition dark:border-white/6 dark:bg-[linear-gradient(180deg,rgba(24,33,48,0.98),rgba(14,20,32,0.98))] dark:shadow-[0_24px_48px_rgba(2,6,23,0.34)]",
                  menuOpen ? "visible scale-100 opacity-100" : "invisible scale-95 opacity-0",
                )}
              >
                <Link
                  to="/change-password"
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-slate-900 transition hover:bg-slate-50 dark:text-slate-50 dark:hover:bg-[rgba(var(--shell-hover),0.72)]"
                >
                  <KeyRound className="h-4 w-4 text-slate-500 dark:text-[rgb(var(--shell-text-muted))]" />
                  Change Password
                </Link>
                <button
                  onClick={onLogout}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-rose-600 transition hover:bg-rose-50 dark:text-rose-200 dark:hover:bg-[linear-gradient(180deg,rgba(127,29,29,0.28),rgba(69,10,10,0.22))]"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
