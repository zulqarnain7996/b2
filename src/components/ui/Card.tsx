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
    <section className={cn("app-card app-card-hover overflow-hidden", className)}>
      {(title || subtitle || actions) && (
        <div className="flex items-start justify-between gap-3 border-b p-5" style={{ borderColor: "rgb(var(--border))" }}>
          <div>
            {title && <h2 className="text-lg font-semibold text-[rgb(var(--text))]">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-[rgb(var(--muted))]">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-5", contentClassName)}>{children}</div>
      {footer ? <div className="border-t p-5" style={{ borderColor: "rgb(var(--border))" }}>{footer}</div> : null}
    </section>
  );
}
