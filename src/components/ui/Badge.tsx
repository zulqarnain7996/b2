import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant =
  | "default"
  | "admin"
  | "user"
  | "success"
  | "warn"
  | "danger"
  | "normal"
  | "important"
  | "urgent";

export function Badge({ children, variant = "default" }: { children: ReactNode; variant?: BadgeVariant }) {
  const variantClass = {
    default: "border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-[rgb(var(--text-soft))]",
    admin: "border border-blue-300/60 bg-blue-500/12 text-blue-700 dark:border-blue-400/30 dark:text-blue-200",
    user: "border border-emerald-300/60 bg-emerald-500/12 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-200",
    success: "border border-emerald-300/60 bg-emerald-500/12 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-200",
    warn: "border border-amber-300/60 bg-amber-500/12 text-amber-700 dark:border-amber-400/30 dark:text-amber-200",
    danger: "border border-rose-300/60 bg-rose-500/12 text-rose-700 dark:border-rose-400/30 dark:text-rose-200",
    normal: "border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-[rgb(var(--text-soft))]",
    important: "border border-amber-300/60 bg-amber-500/12 text-amber-700 dark:border-amber-400/30 dark:text-amber-200",
    urgent: "border border-rose-300/60 bg-rose-500/12 text-rose-700 dark:border-rose-400/30 dark:text-rose-200",
  }[variant];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
        variantClass,
      )}
    >
      {children}
    </span>
  );
}
