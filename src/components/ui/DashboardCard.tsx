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
        "theme-surface rounded-[30px] border backdrop-blur ring-1 ring-black/5 dark:ring-white/5",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b border-[rgb(var(--border))] px-5 py-4">
        <div className="flex items-start gap-3">
          {icon ? (
            <span className="theme-surface-strong grid h-10 w-10 place-items-center rounded-[18px] border text-sky-200 shadow-sm dark:text-white">
              {icon}
            </span>
          ) : null}

          <div>
            <h3 className="text-sm font-semibold text-[rgb(var(--text))]">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-xs text-[rgb(var(--text-soft))]">{subtitle}</p> : null}
          </div>
        </div>

        {right ? <div className="shrink-0">{right}</div> : null}
      </header>

      <div className="px-5 py-5">{children}</div>
    </motion.section>
  );
}
