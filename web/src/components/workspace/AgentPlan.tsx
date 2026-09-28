import { Check, Loader2, X, AlertTriangle } from "lucide-react";
import { cx } from "@/lib/format";
import type { PlanStep } from "@/lib/types";
import { tr } from "@/i18n";

function StepMarker({ step }: { step: PlanStep }) {
  const base = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold";
  switch (step.status) {
    case "completed":
      return (
        <span className={cx(base, "bg-success text-surface")}>
          <Check size={14} strokeWidth={3} />
        </span>
      );
    case "running":
      return (
        <span className={cx(base, "bg-accent text-accent-fg")}>
          <Loader2 size={14} className="animate-spin" />
        </span>
      );
    case "needs_review":
      return (
        <span className={cx(base, "bg-warning text-surface")}>
          <AlertTriangle size={13} />
        </span>
      );
    case "failed":
    case "blocked":
      return (
        <span className={cx(base, "bg-danger text-surface")}>
          <X size={14} strokeWidth={3} />
        </span>
      );
    default:
      return <span className={cx(base, "border border-border-strong bg-surface text-muted")}>{step.step}</span>;
  }
}

/** The orchestrator's plan, derived server-side from the task graph. */
export function AgentPlan({ plan }: { plan: PlanStep[] }) {
  return (
    <ol className="grid grid-cols-1 gap-x-6 gap-y-5 rounded-2xl bg-surface p-5 ring-1 ring-border sm:grid-cols-2 xl:grid-cols-4" aria-label={tr("Orchestrator plan")}>
      {plan.map((s) => (
        <li key={s.stage} className="flex items-start gap-3">
          <StepMarker step={s} />
          <div className="min-w-0 flex-1">
            <p className={cx("text-sm font-semibold", s.status === "queued" ? "text-muted" : s.status === "running" ? "text-accent" : "text-fg")}>{tr(s.title)}</p>
            <p className="mt-0.5 text-xs leading-snug text-muted">{tr(s.detail)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
