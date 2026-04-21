import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type TableProps = {
  children: ReactNode;
  stickyHeader?: boolean;
  zebra?: boolean;
  hoverRows?: boolean;
  className?: string;
};

export function Table({
  children,
  stickyHeader = true,
  zebra = true,
  hoverRows = true,
  className = "",
}: TableProps) {
  return (
    <div className={cn("overflow-auto rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-[0_14px_30px_rgba(var(--shadow-color),0.06)]", className)}>
      <table
        className={cn(
          "ui-data-table min-w-full text-sm",
          stickyHeader && "ui-data-table-sticky",
          zebra && "ui-data-table-zebra",
          hoverRows && "ui-data-table-hover",
        )}
      >
        {children}
      </table>
    </div>
  );
}
