import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export function Input({ label, className = "", ...props }: InputProps) {
  const inputClass = cn(
    "h-10 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 text-sm text-[rgb(var(--text))] shadow-sm outline-none transition",
    "placeholder:text-[rgb(var(--muted))] focus:border-[rgb(var(--primary))] focus:ring-4 focus:ring-[rgb(var(--primary))]/20 focus-visible:outline-none",
    "disabled:cursor-not-allowed disabled:opacity-50",
    className,
  );
  if (!label) {
    return <input className={inputClass} {...props} />;
  }

  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">{label}</span>
      <input className={inputClass} {...props} />
    </label>
  );
}
