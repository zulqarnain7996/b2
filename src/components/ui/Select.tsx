import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
};

export function Select({ label, className = "", children, ...props }: SelectProps) {
  const selectClass = cn(
    "h-10 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 text-sm text-[rgb(var(--text))] shadow-sm outline-none transition",
    "focus:border-[rgb(var(--primary))] focus:ring-4 focus:ring-[rgb(var(--primary))]/20 focus-visible:outline-none disabled:opacity-50",
    className,
  );

  if (!label) {
    return (
      <select className={selectClass} {...props}>
        {children}
      </select>
    );
  }

  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">{label}</span>
      <select className={selectClass} {...props}>
        {children}
      </select>
    </label>
  );
}
