import { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

type Props = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function DashboardCard({ title, subtitle, icon, right, className, children }: Props) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "rounded-3xl border border-slate-200/70 bg-white/75 shadow-sm backdrop-blur ring-1 ring-slate-900/5",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b border-slate-200/60 px-5 py-4">
        <div className="flex items-start gap-3">
          {icon ? (
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-900 text-sky-200 shadow-sm">
              {icon}
            </span>
          ) : null}

          <div>
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
          </div>
        </div>

        {right ? <div className="shrink-0">{right}</div> : null}
      </header>

      <div className="px-5 py-5">{children}</div>
    </motion.section>
  );
}