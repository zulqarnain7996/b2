import { Menu, Moon, Search, Sun, LogOut, KeyRound, ChevronDown, ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AuthUser } from "@/types";
import { useTheme } from "@/theme/ThemeContext";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
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
  { pattern: /^\/admin\/users$/, label: "Users", subtitle: "Manage login accounts" },
  { pattern: /^\/admin\/attendance$/, label: "All Attendance", subtitle: "Track daily check-in activity" },
  { pattern: /^\/admin\/all-attendance$/, label: "All Attendance", subtitle: "Track daily check-in activity" },
  { pattern: /^\/admin\/attendance\/employee\/.+$/, label: "Employee Attendance Report", subtitle: "Detailed per-employee record" },
  { pattern: /^\/admin\/logs$/, label: "Audit Logs", subtitle: "Security and activity logs" },
  { pattern: /^\/admin\/audit-logs$/, label: "Audit Logs", subtitle: "Security and activity logs" },
  { pattern: /^\/admin\/backup$/, label: "Backup & Restore", subtitle: "Database and uploads recovery" },
  { pattern: /^\/admin\/notices$/, label: "Manage Notices", subtitle: "Create and organize notices" },
  { pattern: /^\/checkin$/, label: "Employee Check-in", subtitle: "Face verification workspace" },
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
    return matched ?? { label: "Face Attendance", subtitle: "Operational workspace" };
  }, [location.pathname]);

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
    <header className="sticky top-0 z-40 h-16 border-b border-[rgb(var(--border))] bg-white/70 text-[rgb(var(--text))] backdrop-blur dark:bg-slate-900/60">
      <div className={cn("h-full transition-[padding] duration-200", compactSidebar ? "lg:pl-24" : "lg:pl-80")}>
        <div className="mx-auto flex h-full w-full max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={onMenuClick}
              aria-label="Open menu"
              className="rounded-xl border border-[rgb(var(--border))] p-2 text-[rgb(var(--muted))] hover:bg-[color-mix(in_srgb,rgb(var(--surface))_88%,rgb(var(--text)))] lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1 truncate text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
                <span>IVS Console</span>
                <ChevronRight className="h-3.5 w-3.5" />
                <span>{pageMeta.label}</span>
              </div>
              <p className="truncate text-xs text-[rgb(var(--muted))]">{pageMeta.subtitle}</p>
            </div>
          </div>

          <div className="hidden w-full max-w-sm xl:block">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--muted))]" />
              <Input className="pl-9" placeholder="Search anything..." />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs text-[rgb(var(--muted))] md:block">
              {formatTopbarDateTime(now)}
            </div>
            <button
              onClick={toggleTheme}
              title="Toggle dark mode"
              className="rounded-xl border border-[rgb(var(--border))] p-2 text-[rgb(var(--muted))] transition hover:bg-[color-mix(in_srgb,rgb(var(--surface))_88%,rgb(var(--text)))]"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2.5 py-1.5 shadow-sm transition hover:bg-[color-mix(in_srgb,rgb(var(--surface))_88%,rgb(var(--text)))]"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-xs font-semibold text-white">
                  {initials(user.name)}
                </span>
                <div className="hidden text-left md:block">
                  <p className="max-w-[140px] truncate text-sm font-medium text-[rgb(var(--text))]">{user.name}</p>
                  <p className="text-xs uppercase tracking-wide text-[rgb(var(--muted))]">{user.role}</p>
                </div>
                <ChevronDown className="hidden h-4 w-4 text-[rgb(var(--muted))] md:block" />
              </button>

              <div
                className={cn(
                  "absolute right-0 mt-2 w-56 origin-top-right rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-1.5 text-sm shadow-lg transition",
                  menuOpen ? "visible scale-100 opacity-100" : "invisible scale-95 opacity-0",
                )}
              >
                <Link
                  to="/change-password"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-[rgb(var(--text))] hover:bg-[color-mix(in_srgb,rgb(var(--surface))_88%,rgb(var(--text)))]"
                >
                  <KeyRound className="h-4 w-4 text-[rgb(var(--muted))]" />
                  Change Password
                </Link>
                <button
                  onClick={onLogout}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
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
