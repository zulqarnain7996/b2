import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

type ModalProps = {
  isOpen: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: "md" | "lg";
};

export function Modal({ isOpen, title, onClose, children, footer, width = "lg" }: ModalProps) {
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement | null>(null);

  // ✅ keep latest onClose without re-triggering effects
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };

    window.addEventListener("keydown", onKeyDown);

    // ✅ focus first input ONLY once when modal opens
    const t = window.setTimeout(() => {
      const root = cardRef.current;
      if (!root) return;

      const firstFocusable = root.querySelector(
        'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])'
      ) as HTMLElement | null;

      firstFocusable?.focus();
    }, 0);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(t);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/45 px-4 py-6 backdrop-blur-[2px]"
      onClick={() => onCloseRef.current()}
    >
      <div
        ref={cardRef}
        className={`w-full rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))] shadow-2xl transition duration-200 ${
          width === "md" ? "max-w-md" : "max-w-3xl"
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
      >
        {title && (
          <h3 id={titleId} className="border-b border-[rgb(var(--border))] px-5 py-4 text-lg font-semibold text-[rgb(var(--text))]">
            {title}
          </h3>
        )}
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-[rgb(var(--border))] px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}
