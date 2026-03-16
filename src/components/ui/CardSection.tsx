import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type CardSectionProps = {
  children: ReactNode;
  className?: string;
};

export function CardSection({ children, className }: CardSectionProps) {
  return <section className={cn("app-card p-5", className)}>{children}</section>;
}
