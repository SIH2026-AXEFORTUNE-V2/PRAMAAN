import type { ReactNode } from "react";
import { time } from "@/lib/format";
import { BrandMark } from "../shell/Brand";
import { tr } from "@/i18n";

export function UserTurn({ name, ts, children }: { name: string; ts: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fg text-xs font-bold text-surface" aria-hidden>
        {name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-2 text-sm">
          <span className="font-semibold text-fg">{name}</span> <span className="text-subtle">{time(ts)}</span>
        </p>
        <div className="rounded-2xl rounded-tl-md bg-surface px-5 py-4 ring-1 ring-border">{children}</div>
      </div>
    </div>
  );
}

export function AgentTurn({ ts, title, children }: { ts?: string; title?: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0" aria-hidden>
        <BrandMark size={36} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-2 text-sm">
          <span className="font-semibold text-fg">{title ?? tr("PRAMAAN Orchestrator")}</span> {ts && <span className="text-subtle">{time(ts)}</span>}
        </p>
        <div className="space-y-5">{children}</div>
      </div>
    </div>
  );
}
