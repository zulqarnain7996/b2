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
    default: "bg-slate-100 text-slate-700",
    admin: "bg-blue-100 text-blue-700",
    user: "bg-emerald-100 text-emerald-700",
    success: "bg-emerald-100 text-emerald-700",
    warn: "bg-amber-100 text-amber-700",
    danger: "bg-rose-100 text-rose-700",
    normal: "bg-slate-100 text-slate-700",
    important: "bg-amber-100 text-amber-700",
    urgent: "bg-rose-100 text-rose-700",
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
