import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cx } from "@/lib/format";
import { useApp } from "@/store/app";
import { tr } from "@/i18n";

const ICON = {
  success: <CheckCircle2 size={16} className="text-success" />,
  danger: <XCircle size={16} className="text-danger" />,
  warning: <AlertTriangle size={16} className="text-warning" />,
  info: <Info size={16} className="text-accent" />,
};

export function Toaster() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cx("animate-fade-in pointer-events-auto flex items-start gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-3 shadow-lg")} role="status">
          <span className="mt-0.5">{ICON[t.tone]}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-fg">{t.title}</p>
            {t.body && <p className="mt-0.5 text-2xs leading-relaxed text-muted">{t.body}</p>}
          </div>
          <button type="button" aria-label={tr("Dismiss")} onClick={() => dismiss(t.id)} className="rounded p-0.5 text-subtle hover:text-fg">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
