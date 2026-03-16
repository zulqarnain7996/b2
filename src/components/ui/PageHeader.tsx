import { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

type Props = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  right?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, subtitle, icon, right, actions, className }: Props) {
  const actionNode = actions ?? right;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "rounded-3xl border p-6 shadow-sm backdrop-blur",
        className,
      )}
      style={{
        borderColor: "rgb(var(--border))",
        background: "color-mix(in srgb, rgb(var(--surface)) 86%, transparent)",
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {icon ? (
            <span
              className="grid h-11 w-11 place-items-center rounded-2xl shadow-sm"
              style={{
                background: "rgb(var(--text))",
                color: "rgb(var(--surface))",
              }}
            >
              {icon}
            </span>
          ) : null}

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Face Attendance</div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[rgb(var(--text))]">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-[rgb(var(--muted))]">{subtitle}</p> : null}
          </div>
        </div>

        {actionNode ? <div className="shrink-0">{actionNode}</div> : null}
      </div>
    </motion.div>
  );
}
