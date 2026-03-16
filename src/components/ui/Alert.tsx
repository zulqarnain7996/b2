import type { ReactNode } from "react";

type AlertVariant = "error" | "info" | "success";

export function Alert({ variant = "info", children }: { variant?: AlertVariant; children: ReactNode }) {
  const variantClass =
    variant === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : variant === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-blue-200 bg-blue-50 text-blue-700";

  return <div className={`rounded-xl border px-3 py-2 text-sm ${variantClass}`}>{children}</div>;
}
