import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cx } from "@/lib/format";
import { IconButton } from "./Button";
import { tr } from "@/i18n";

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
}

function useFocusOnOpen(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current?.querySelector<HTMLElement>("[data-autofocus], button, [href], input, textarea, select");
    el?.focus();
    return () => prev?.focus?.();
  }, [open]);
  return ref;
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = "max-w-[560px]",
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  width?: string;
  footer?: ReactNode;
}) {
  useEscape(open, onClose);
  const ref = useFocusOnOpen(open);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
      <div className="absolute inset-0 bg-[var(--overlay)] animate-fade-in" onClick={onClose} aria-hidden />
      <div ref={ref} className={cx("animate-slide-in relative flex h-full w-full flex-col border-l border-border bg-surface shadow-lg", width)}>
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-fg">{title}</div>
            {subtitle && <div className="mt-0.5 text-xs text-muted">{subtitle}</div>}
          </div>
          <IconButton label={tr("Close")} onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEscape(open, onClose);
  const ref = useFocusOnOpen(open);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-[var(--overlay)] animate-fade-in" onClick={onClose} aria-hidden />
      <div ref={ref} className={cx("animate-fade-in relative flex max-h-[88vh] w-full flex-col rounded-xl border border-border bg-surface shadow-lg", width)}>
        <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
          <div className="flex-1 text-sm font-semibold">{title}</div>
          <IconButton label={tr("Close")} onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
