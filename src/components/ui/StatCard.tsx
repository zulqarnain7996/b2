import { motion } from "framer-motion";
import type { ComponentType } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "blue" | "green" | "amber" | "rose" | "indigo" | "slate";

const toneToGradient: Record<Tone, string> = {
  blue: "bg-gradient-to-br from-sky-600 via-blue-600 to-indigo-700",
  green: "bg-gradient-to-br from-emerald-500 via-green-600 to-teal-700",
  amber: "bg-gradient-to-br from-amber-500 via-orange-600 to-rose-600",
  rose: "bg-gradient-to-br from-rose-500 via-red-600 to-fuchsia-700",
  indigo: "bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-700",
  slate: "bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900",
};

type Props = {
  title: string;
  value: number | string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  tone?: Tone;
  onClick?: () => void;
  className?: string;
};

export function StatCard({ title, value, subtitle, icon: Icon, tone = "blue", onClick, className }: Props) {
  const isClickable = typeof onClick === "function";

  return (
    <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.18 }}>
      <div
        role={isClickable ? "button" : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onClick={onClick}
        onKeyDown={(e) => {
          if (!isClickable) return;
          if (e.key === "Enter" || e.key === " ") onClick();
        }}
        className={cn(
          "relative overflow-hidden rounded-3xl border border-white/40 shadow-sm",
          toneToGradient[tone],
          isClickable ? "cursor-pointer" : "",
          className,
        )}
      >
        {/* soft glow blobs */}
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />

        <div className="relative p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-white/80">{title}</div>
              <div className="mt-2 text-3xl font-extrabold tracking-tight text-white">{value}</div>
              <div className="mt-2 text-sm text-white/80">{subtitle}</div>
            </div>

            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20">
              <Icon className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-white/90">
            View <ChevronRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}