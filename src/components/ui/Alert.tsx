import type { ReactNode } from "react";

type AlertVariant = "error" | "info" | "success";

export function Alert({ variant = "info", children }: { variant?: AlertVariant; children: ReactNode }) {
  const variantClass =
    variant === "error"
      ? "border border-rose-300/60 bg-rose-500/12 text-rose-200 dark:border-rose-400/30"
      : variant === "success"
        ? "border border-emerald-300/60 bg-emerald-500/12 text-emerald-200 dark:border-emerald-400/30"
        : "border border-blue-300/60 bg-blue-500/12 text-blue-200 dark:border-blue-400/30";

  return <div className={`rounded-xl px-3 py-2 text-sm ${variantClass}`}>{children}</div>;
}
