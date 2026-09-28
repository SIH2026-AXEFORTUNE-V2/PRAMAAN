import { useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Check, Copy } from "lucide-react";
import { cx, shortHash } from "@/lib/format";
import { tr } from "@/i18n";

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  size = "md",
}: {
  tabs: { id: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="tablist" className={cx("flex items-center gap-1 overflow-x-auto", className)}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={cx(
              "inline-flex shrink-0 items-center gap-1.5 rounded-lg font-medium transition-colors",
              size === "md" ? "h-9 px-3.5 text-sm" : "h-8 px-3 text-xs",
              on ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-3 hover:text-fg",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cx("rounded px-1 text-2xs tabular-nums", on ? "bg-surface text-accent" : "bg-surface-3 text-subtle")}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function ProgressBar({ value, tone = "info", indeterminate }: { value: number; tone?: "info" | "success" | "warning" | "danger"; indeterminate?: boolean }) {
  const color = { info: "bg-accent", success: "bg-success", warning: "bg-warning", danger: "bg-danger" }[tone];
  return (
    <div className="relative h-1 w-full overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      {indeterminate ? (
        <div className={cx("bar-indeterminate absolute inset-y-0 w-2/5 rounded-full", color)} />
      ) : (
        <div className={cx("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      )}
    </div>
  );
}

export function Hash({ value, n = 12, label }: { value: string | null | undefined; n?: number; label?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-subtle">—</span>;
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        });
      }}
      title={`${label ? label + ": " : ""}${value} (${tr("click to copy")})`}
      className="inline-flex items-center gap-1 rounded px-1 font-mono text-2xs text-muted tabular-nums hover:bg-surface-3 hover:text-fg"
    >
      {shortHash(value, n)}
      {copied ? <Check size={11} className="text-success" /> : <Copy size={11} className="opacity-60" />}
    </button>
  );
}

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted">{icon}</div>}
      <p className="font-display text-base font-semibold text-fg">{title}</p>
      {body && <div className="mt-1.5 max-w-md text-sm text-muted">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent-soft focus:outline-none",
        className,
      )}
      {...rest}
    />
  );
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(
        "w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-fg placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent-soft focus:outline-none",
        className,
      )}
      {...rest}
    />
  );
}

export function Toggle({ checked, onChange, label, disabled, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; description?: string }) {
  return (
    <label className={cx("flex items-start justify-between gap-4 py-2.5", disabled ? "opacity-60" : "cursor-pointer")}>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-border-strong")}
      >
        <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow-sm transition-transform", checked ? "translate-x-4.5" : "translate-x-0.5")} />
      </button>
    </label>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse-soft rounded-md bg-surface-3", className)} />;
}
