import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type CardProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
  className?: string;
};

export function Card({
  children,
  title,
  subtitle,
  actions,
  footer,
  contentClassName = "",
  className = "",
}: CardProps) {
  return (
    <section
      className={cn(
        "app-card app-card-hover overflow-hidden rounded-[28px] border ring-1 ring-black/5 transition-all duration-200 dark:ring-white/5",
        className,
      )}
    >
      {(title || subtitle || actions) && (
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "rgb(var(--border))" }}>
          <div>
            {title && <h2 className="text-[17px] font-semibold tracking-tight text-[rgb(var(--text))]">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm leading-6 text-[rgb(var(--text-soft))]">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("px-5 py-5", contentClassName)}>{children}</div>
      {footer ? <div className="border-t px-5 py-4" style={{ borderColor: "rgb(var(--border))" }}>{footer}</div> : null}
    </section>
  );
}
