import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  tone?: "blue" | "green" | "amber" | "slate";
  className?: string;
};

const toneStyles: Record<NonNullable<StatCardProps["tone"]>, string> = {
  blue: "from-sky-500/10 via-blue-500/5 to-transparent",
  green: "from-emerald-500/10 via-green-500/5 to-transparent",
  amber: "from-amber-500/10 via-orange-500/5 to-transparent",
  slate: "from-slate-500/10 via-slate-400/5 to-transparent",
};

export function StatCard({ label, value, hint, icon, tone = "blue", className }: StatCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        className,
      )}
    >
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br", toneStyles[tone])} />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">{label}</div>
          <div className="mt-2 text-2xl font-extrabold tracking-tight text-[rgb(var(--text))]">{value}</div>
          {hint ? <div className="mt-1 text-xs text-[rgb(var(--muted))]">{hint}</div> : null}
        </div>
        {icon ? (
          <div
            className="grid h-10 w-10 place-items-center rounded-xl border border-[rgb(var(--border))]"
            style={{ background: "color-mix(in srgb, rgb(var(--surface)) 72%, rgb(var(--primary)) 28%)" }}
          >
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
}
