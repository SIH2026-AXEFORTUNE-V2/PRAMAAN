import { useState } from "react";
import { ChevronDown, Cpu, Lock, PanelRightClose, Server, Activity } from "lucide-react";
import { cx, time } from "@/lib/format";
import { groupOf, latestTasks, type TaskGroup } from "@/lib/tasks";
import type { Task, Transformation } from "@/lib/types";
import { useApp } from "@/store/app";
import { StatusIcon } from "../ui/Badge";
import { IconButton } from "../ui/Button";
import { ProgressBar } from "../ui/misc";

type Filter = "all" | TaskGroup;

function TaskRow({ t }: { t: Task }) {
  const when = t.status === "running" ? t.started : t.ended ?? t.started;
  return (
    <li className="flex gap-3 px-4 py-3">
      <span className="mt-0.5">
        <StatusIcon status={t.status} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-fg" title={t.title}>
            {t.title}
          </p>
          <span className="shrink-0 font-mono text-2xs text-subtle tabular-nums">
            {t.status === "running" ? `${t.progress}%` : when ? time(when) : t.status === "needs_review" ? "Waiting" : "In queue"}
          </span>
        </div>
        <p className="truncate text-xs text-muted" title={`${t.agent}: ${t.error ?? t.detail}`}>
          {t.error ?? t.detail}
        </p>
        {t.status === "running" && (
          <div className="mt-1.5">
            <ProgressBar value={t.progress} indeterminate={t.progress < 10} />
          </div>
        )}
      </div>
    </li>
  );
}

function Group({ title, tasks }: { title: string; tasks: Task[] }) {
  const [open, setOpen] = useState(true);
  if (!tasks.length) return null;
  return (
    <div className="border-b border-border last:border-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-1.5 px-4 pt-3 pb-1 text-xs font-semibold text-muted hover:text-fg">
        {title} <span className="text-subtle">{tasks.length}</span>
        <ChevronDown size={12} className={cx("ml-auto transition-transform", !open && "-rotate-90")} />
      </button>
      {open && <ul className="pb-1">{tasks.map((t) => <TaskRow key={t.id} t={t} />)}</ul>}
    </div>
  );
}

/** Right-hand "Generation tasks" panel. Same task objects as the workspace — never a separate state. */
export function TaskPanel({ t, onClose }: { t: Transformation; onClose: () => void }) {
  const config = useApp((s) => s.config);
  const [filter, setFilter] = useState<Filter>("all");
  const tasks = latestTasks(t.tasks);
  const by = (g: TaskGroup) => tasks.filter((x) => groupOf(x) === g);
  const running = by("running");
  const done = by("completed");
  const pending = by("pending");
  const models = Array.from(new Set(t.tasks.map((x) => x.model).filter((m): m is string => !!m && m.includes("/"))));

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <Activity size={16} className="text-accent" />
        <h2 className="flex-1 text-base font-semibold">Generation tasks</h2>
        <IconButton label="Close task panel" onClick={onClose}>
          <PanelRightClose size={16} />
        </IconButton>
      </div>
      <div className="px-3 pb-2.5">
        <div role="tablist" aria-label="Task filter" className="grid grid-cols-4 gap-0.5 rounded-lg bg-surface-3 p-0.5">
          {(
            [
              ["all", "All", tasks.length],
              ["running", "Running", running.length],
              ["completed", "Completed", done.length],
              ["pending", "Pending", pending.length],
            ] as [Filter, string, number][]
          ).map(([id, label, n]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              onClick={() => setFilter(id)}
              className={cx(
                "flex flex-col items-center rounded-md px-1 py-1.5 text-2xs leading-tight font-medium transition-colors",
                filter === id ? "bg-surface text-accent shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              <span className="font-mono text-sm font-bold tabular-nums">{n}</span>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
        {(filter === "all" || filter === "running") && <Group title="In progress" tasks={running} />}
        {(filter === "all" || filter === "completed") && <Group title="Finished" tasks={done} />}
        {(filter === "all" || filter === "pending") && <Group title="Pending" tasks={pending} />}
        {filter !== "all" && by(filter).length === 0 && <p className="px-4 py-8 text-center text-2xs text-subtle">No {filter} tasks.</p>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-3 text-xs text-muted">
        <span className="inline-flex min-w-0 items-center gap-1" title={models.join(", ") || config?.engine.model}>
          <Cpu size={12} />
          <span className="truncate">{(models[0] ?? config?.engine.model ?? "—").split("/").pop()}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Server size={12} /> {config?.deployment.label}
        </span>
        <span className="inline-flex items-center gap-1 text-accent">
          <Lock size={12} /> Secure Mode
        </span>
      </div>
    </div>
  );
}
