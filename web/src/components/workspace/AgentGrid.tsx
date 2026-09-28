import { Link } from "react-router-dom";
import { Fingerprint, GitCompareArrows, Loader2, ScanSearch, ScrollText, ShieldCheck, Swords, UserCheck, Workflow } from "lucide-react";
import type { ReactNode } from "react";
import { cx, duration } from "@/lib/format";
import { OutputIcon } from "@/lib/outputs";
import { TASK_STATUS } from "@/lib/status";
import { latestTasks } from "@/lib/tasks";
import type { Task } from "@/lib/types";
import { StatusIcon } from "../ui/Badge";
import { ProgressBar } from "../ui/misc";

function agentIcon(t: Task): ReactNode {
  if (t.artifact) return <OutputIcon type={t.artifact} size={17} />;
  const m: Record<string, ReactNode> = {
    "Source Understanding Agent": <ScrollText size={17} />,
    "Security Agent": <ShieldCheck size={17} />,
    "Evidence Extraction Agent": <ScanSearch size={17} />,
    "Consistency Agent": <GitCompareArrows size={17} />,
    "Red Team / Critic Agent": <Swords size={17} />,
    "Provenance Agent": <Fingerprint size={17} />,
    "Human Reviewer": <UserCheck size={17} />,
  };
  return m[t.agent] ?? <Workflow size={17} />;
}

export function AgentTaskCard({ task, tid }: { task: Task; tid: string }) {
  const st = TASK_STATUS[task.status];
  const body = (
    <div
      className={cx(
        "flex h-full flex-col gap-2.5 rounded-xl bg-surface p-3.5 ring-1 transition-colors",
        task.status === "running" ? "ring-accent" : task.status === "failed" ? "ring-danger-line" : "ring-border",
        task.artifact && "hover:ring-border-strong",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cx(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
            task.status === "running" ? "border-accent-line bg-accent-soft text-accent" : "border-border bg-surface-2 text-muted",
          )}
        >
          {agentIcon(task)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg" title={task.agent}>
            {task.agent.replace(" Agent", "").replace(" / Critic", "")}
          </p>
          <p className="truncate text-xs text-muted" title={task.title}>
            {task.title}
          </p>
        </div>
      </div>
      <div className="mt-auto">
        {task.status === "running" && <ProgressBar value={task.progress} indeterminate={task.progress < 10} />}
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          <StatusIcon status={task.status} size={13} />
          <span className={cx("font-medium", st.tone === "success" ? "text-success" : st.tone === "danger" ? "text-danger" : st.tone === "warning" ? "text-warning" : st.tone === "info" ? "text-accent" : "text-subtle")}>
            {st.label}
          </span>
          {task.seconds !== null && task.status !== "running" && <span className="font-mono text-subtle">{duration(task.seconds)}</span>}
        </div>
        <p className="mt-0.5 truncate text-xs text-subtle" title={task.error ?? task.detail}>
          {task.error ?? task.detail}
        </p>
      </div>
    </div>
  );
  return task.artifact ? (
    <Link to={`/workspace/${tid}/artifact/${task.artifact}`} className="block h-full rounded-xl" aria-label={`${task.title}: ${st.label}`}>
      {body}
    </Link>
  ) : (
    body
  );
}

/** Specialist + verification agents for this transformation (plan/contract steps live in the stepper). */
export function AgentGrid({ tasks, tid }: { tasks: Task[]; tid: string }) {
  const shown = latestTasks(tasks).filter((t) => !["contract", "plan", "approval"].includes(t.key));
  const running = shown.filter((t) => t.status === "running").length;
  const agents = new Set(shown.map((t) => t.agent)).size;
  const total = tasks.reduce((s, t) => s + (t.seconds ?? 0), 0);
  return (
    <section aria-label="Agent execution">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {running > 0 ? (
          <>
            <Loader2 size={14} className="animate-spin text-accent" />
            <span className="font-semibold text-fg">Executing agents in parallel</span>
            <span className="text-muted">{running} running now</span>
          </>
        ) : (
          <>
            <span className="font-semibold text-fg">Agent execution</span>
            <span className="text-muted">{agents} agents</span>
            <span className="text-muted">{shown.length} tasks</span>
            <span className="text-muted">{duration(total)} of agent time</span>
          </>
        )}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">
        {shown.map((t) => (
          <AgentTaskCard key={t.id} task={t} tid={tid} />
        ))}
      </div>
    </section>
  );
}
