import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useRef } from "react";
import type { ComponentType, MouseEvent } from "react";

type SidebarNavItemProps = {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  onClick?: () => void;
  compact?: boolean;
};

export function SidebarNavItem({ label, to, icon: Icon, onClick, compact = false }: SidebarNavItemProps) {
  const location = useLocation();
  const navLockRef = useRef(false);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (location.pathname === to) {
      event.preventDefault();
      onClick?.();
      return;
    }
    if (navLockRef.current) {
      event.preventDefault();
      return;
    }
    navLockRef.current = true;
    onClick?.();
    window.setTimeout(() => {
      navLockRef.current = false;
    }, 500);
  }

  return (
    <NavLink
      to={to}
      onClick={handleClick}
      title={compact ? label : undefined}
      aria-label={compact ? label : undefined}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center overflow-hidden rounded-[22px] border px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-sky-300/70 dark:focus-visible:ring-offset-[rgb(var(--shell-panel))]",
          "border-transparent text-slate-600 dark:text-slate-300",
          !isActive &&
            "hover:-translate-y-0.5 hover:border-sky-100/90 hover:bg-[linear-gradient(180deg,rgba(250,252,255,0.98),rgba(242,247,255,0.94))] hover:text-slate-900 hover:shadow-[0_10px_22px_rgba(148,163,184,0.14)] dark:hover:border-white/8 dark:hover:bg-[linear-gradient(180deg,rgba(28,38,56,0.96),rgba(18,26,41,0.92))] dark:hover:text-white dark:hover:shadow-[0_20px_34px_rgba(2,6,23,0.28)]",
          compact && "min-h-[54px] justify-center px-2 py-2",
          isActive &&
            "border-sky-200/90 bg-[linear-gradient(180deg,rgba(239,246,255,0.98),rgba(232,242,255,0.96))] pl-5 pr-3 text-slate-900 shadow-[0_16px_30px_rgba(125,211,252,0.22)] ring-1 ring-sky-100/80 hover:border-sky-200/90 hover:bg-[linear-gradient(180deg,rgba(239,246,255,0.98),rgba(232,242,255,0.96))] hover:text-slate-900 dark:border-[rgba(125,211,252,0.18)] dark:bg-[linear-gradient(180deg,rgba(35,53,78,0.98),rgba(20,31,49,0.96))] dark:text-white dark:shadow-[0_18px_30px_rgba(8,15,32,0.5),0_0_0_1px_rgba(125,211,252,0.06)] dark:ring-1 dark:ring-sky-300/10 dark:hover:border-[rgba(125,211,252,0.24)] dark:hover:bg-[linear-gradient(180deg,rgba(38,57,84,0.98),rgba(22,34,53,0.96))] dark:hover:text-white",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              "pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition duration-200",
              isActive &&
                "opacity-100 dark:bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.14),transparent_58%)]",
            )}
          />
          <span
            className={cn(
              "absolute left-1.5 top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-full transition-all duration-200",
              compact ? "opacity-0" : isActive ? "bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.35)] dark:bg-sky-300" : "bg-transparent opacity-0",
            )}
          />
          <span
            className={cn(
              "relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-[15px] border transition-all duration-200",
              isActive
                ? "border-sky-200/80 bg-white/75 text-sky-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] dark:border-white/10 dark:bg-white/[0.08] dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_24px_rgba(2,6,23,0.22)]"
                : "border-transparent bg-transparent text-current group-hover:border-slate-200/70 group-hover:bg-white/75 group-hover:text-slate-900 dark:group-hover:border-white/6 dark:group-hover:bg-white/[0.06] dark:group-hover:text-white",
              compact && "h-10 w-10 rounded-[18px]",
              isActive && !compact && "ml-2",
            )}
          >
            <Icon className="h-[18px] w-[18px] transition-colors" />
          </span>
          {!compact ? (
            <span
              className={cn(
                "relative z-[1] min-w-0 flex-1 truncate text-[0.94rem] transition-all duration-200",
                isActive ? "ml-1 font-semibold text-slate-900 dark:text-white" : "group-hover:translate-x-[1px]",
              )}
            >
              {label}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}
