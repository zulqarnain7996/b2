import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "md" | "sm" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
};

export function Button({
  children,
  className = "",
  variant = "primary",
  size = "md",
  block = false,
  loading = false,
  disabled,
  ...props
}: ButtonProps) {
  const variantClass = {
    primary:
      "border border-[rgb(var(--primary))] bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))] shadow-sm hover:-translate-y-0.5 hover:brightness-[1.06] hover:shadow-lg",
    secondary:
      "border border-[rgb(var(--border))] bg-[rgb(var(--surface-elevated))] text-[rgb(var(--text))] shadow-sm hover:bg-[rgb(var(--surface-muted))]",
    ghost:
      "border border-transparent bg-transparent text-[rgb(var(--text-soft))] hover:bg-[rgb(var(--surface-muted))] hover:text-[rgb(var(--text))]",
    danger: "border border-rose-600/80 bg-rose-600 text-white shadow-sm hover:-translate-y-0.5 hover:bg-rose-500",
  }[variant];

  const sizeClass = size === "sm" ? "h-8 px-3 text-xs" : size === "lg" ? "h-11 px-5 text-sm" : "h-10 px-4 text-sm";

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--focus-ring),0.4)] focus-visible:ring-offset-1 focus-visible:ring-offset-[rgb(var(--bg))]",
        "active:translate-y-[1px] disabled:pointer-events-none disabled:opacity-55",
        sizeClass,
        variantClass,
        block && "w-full",
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}
