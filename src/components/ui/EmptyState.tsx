import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

type EmptyStateProps = {
  title: string;
  message: string;
  action?: ReactNode;
};

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-6 py-10 text-center">
      <div className="mb-3 inline-flex rounded-full p-3 text-[rgb(var(--primary))]" style={{ background: "color-mix(in srgb, rgb(var(--primary)) 16%, rgb(var(--surface)))" }}>
        <Sparkles className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold text-[rgb(var(--text))]">{title}</h3>
      <p className="mt-1 text-sm text-[rgb(var(--muted))]">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
