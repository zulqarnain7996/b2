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
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200",
          "text-[rgb(var(--muted))] hover:bg-[color-mix(in_srgb,rgb(var(--surface))_85%,rgb(var(--text)))] hover:text-[rgb(var(--text))]",
          compact && "justify-center px-2.5",
          isActive &&
            "bg-[color-mix(in_srgb,rgb(var(--primary))_16%,rgb(var(--surface)))] text-[rgb(var(--primary))] shadow-[0_0_0_1px_rgba(56,189,248,0.18),0_10px_22px_-16px_rgba(2,132,199,0.55)]",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              "absolute left-1 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full transition-colors",
              isActive ? "bg-[rgb(var(--primary))]" : "bg-transparent",
            )}
          />
          <Icon className="h-4 w-4 transition-colors group-hover:text-[rgb(var(--primary))]" />
          {!compact ? <span className="truncate">{label}</span> : null}
        </>
      )}
    </NavLink>
  );
}
