import type { ReactNode } from "react";
import { AlertTriangle, Ban, Check, CircleDashed, Clock3, Loader2, X } from "lucide-react";
import { cx } from "@/lib/format";
import { TONE_CLASSES, type Tone } from "@/lib/status";
import type { TaskStatus } from "@/lib/types";

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  const c = TONE_CLASSES[tone];
  return (
    <span
      className={cx(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 text-2xs font-semibold whitespace-nowrap",
        c.text,
        c.bg,
        c.border,
        className,
      )}
    >
      {dot && <span className={cx("h-1.5 w-1.5 rounded-full", c.dot)} aria-hidden />}
      {children}
    </span>
  );
}

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex h-6 items-center rounded-md bg-surface-3 px-2 text-2xs text-muted whitespace-nowrap", className)}>
      {children}
    </span>
  );
}

/** Small inline icon matching a tone, used inside badges instead of text glyphs. */
export function ToneIcon({ tone, size = 12 }: { tone: Tone; size?: number }) {
  if (tone === "success") return <Check size={size} strokeWidth={2.6} aria-hidden />;
  if (tone === "warning") return <AlertTriangle size={size} aria-hidden />;
  if (tone === "danger") return <X size={size} strokeWidth={2.6} aria-hidden />;
  return null;
}

/** Round status glyph used in task lists and the agent grid. */
export function StatusIcon({ status, size = 16 }: { status: TaskStatus; size?: number }) {
  const s = size;
  switch (status) {
    case "completed":
      return (
        <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-success text-surface" style={{ width: s, height: s }} aria-label="Completed">
          <Check size={s * 0.68} strokeWidth={3} />
        </span>
      );
    case "running":
      return <Loader2 size={s} className="shrink-0 animate-spin text-accent" aria-label="Running" />;
    case "failed":
      return (
        <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-danger text-surface" style={{ width: s, height: s }} aria-label="Failed">
          <X size={s * 0.68} strokeWidth={3} />
        </span>
      );
    case "blocked":
      return <Ban size={s} className="shrink-0 text-danger" aria-label="Blocked" />;
    case "needs_review":
      return <AlertTriangle size={s} className="shrink-0 text-warning" aria-label="Needs review" />;
    default:
      return <CircleDashed size={s} className="shrink-0 text-subtle" aria-label="Queued" />;
  }
}

export function PendingIcon({ size = 16 }: { size?: number }) {
  return <Clock3 size={size} className="shrink-0 text-subtle" aria-hidden />;
}
