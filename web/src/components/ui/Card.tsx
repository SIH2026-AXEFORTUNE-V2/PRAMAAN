import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/format";

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-xl border border-border bg-surface", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-start gap-3 border-b border-border px-5 py-3.5", className)}>
      {icon && <div className="mt-0.5 text-muted">{icon}</div>}
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export function SectionLabel({ children, className, right }: { children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <div className={cx("flex items-center justify-between gap-2", className)}>
      <h4 className="text-sm font-semibold text-fg">{children}</h4>
      {right}
    </div>
  );
}

export function KeyValue({ k, v, mono }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-xs">
      <span className="shrink-0 text-muted">{k}</span>
      <span className={cx("min-w-0 truncate text-right text-fg", mono && "tabular-nums")}>{v}</span>
    </div>
  );
}

export function IconTile({ children, tone = "neutral", size = "md" }: { children: ReactNode; tone?: "neutral" | "accent"; size?: "sm" | "md" }) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-lg border",
        size === "md" ? "h-9 w-9" : "h-7 w-7",
        tone === "accent" ? "border-accent-line bg-accent-soft text-accent" : "border-border bg-surface-2 text-muted",
      )}
    >
      {children}
    </span>
  );
}
