import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
};

export function Textarea({ label, className = "", ...props }: TextareaProps) {
  const textareaClass = cn(
    "w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 text-sm text-[rgb(var(--text))] shadow-sm outline-none transition",
    "placeholder:text-[rgb(var(--muted))] focus:border-[rgb(var(--primary))] focus:ring-4 focus:ring-[rgb(var(--primary))]/20",
    "disabled:cursor-not-allowed disabled:opacity-50",
    className,
  );

  if (!label) return <textarea className={textareaClass} {...props} />;

  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">{label}</span>
      <textarea className={textareaClass} {...props} />
    </label>
  );
}
