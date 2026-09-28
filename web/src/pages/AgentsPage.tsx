import { ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { cx, relative } from "@/lib/format";
import type { AgentInfo } from "@/lib/types";
import { useFetch } from "@/hooks/useFetch";
import { Page } from "@/components/shell/AppShell";
import { Badge, Tag } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/misc";

const KIND_LABEL: Record<AgentInfo["kind"], string> = {
  control: "Orchestration",
  perception: "Perception",
  evidence: "Evidence",
  specialist: "Specialist agents",
  verification: "Verification & trust",
};

const FLOW = ["User", "Orchestrator", "Specialist agents", "Model gateway", "Evidence store", "Validation", "Security gate", "Human approval", "Provenance", "Final artefacts"];

export function AgentsPage() {
  const agents = useFetch(api.agents);
  const models = useFetch(api.models);
  const kinds = Object.keys(KIND_LABEL) as AgentInfo["kind"][];

  return (
    <Page title="Skills / Agents" subtitle="Agents exchange structured objects only: claims, findings, artefact JSON and verification results. The orchestrator selects them per request.">
      <Card className="mb-5 p-4">
        <p className="mb-3 text-2xs font-bold text-subtle">Architecture · Plan → Act → Observe → Critique → Repair → Verify → Decide</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {FLOW.map((f, i) => (
            <span key={f} className="inline-flex items-center gap-1.5">
              <span className={cx("rounded-lg border px-2.5 py-1 text-2xs font-semibold", i === 1 ? "border-accent-line bg-accent-soft text-accent" : "border-border bg-surface-2 text-fg")}>{f}</span>
              {i < FLOW.length - 1 && <ArrowRight size={12} className="text-subtle" />}
            </span>
          ))}
        </div>
      </Card>

      {agents.loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Card className="mb-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-left text-xs text-muted">
                  <th className="px-5 py-2.5 font-semibold">Agent</th>
                  <th className="px-3 py-2.5 font-semibold">Responsibility</th>
                  <th className="px-3 py-2.5 font-semibold">Produces</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Runs</th>
                  <th className="px-5 py-2.5 font-semibold">Last run</th>
                </tr>
              </thead>
              {kinds.map((k) => {
                const list = (agents.data ?? []).filter((a) => a.kind === k);
                if (!list.length) return null;
                return (
                  <tbody key={k}>
                    <tr>
                      <th colSpan={5} className="border-b border-border px-5 pt-4 pb-2 text-left text-xs font-semibold text-muted">
                        {KIND_LABEL[k]}
                      </th>
                    </tr>
                    {list.map((a) => (
                      <tr key={a.name} className="border-b border-border align-top last:border-0">
                        <td className="px-5 py-3">
                          <span className="flex items-center gap-2 font-semibold text-fg">
                            <span className={cx("h-2 w-2 shrink-0 rounded-full", a.runs ? "bg-success" : "bg-border-strong")} aria-label={a.runs ? "Active" : "Available"} />
                            {a.name}
                          </span>
                          <span className="mt-0.5 block pl-4 text-xs text-subtle">{a.capability.replace(/_/g, " ")}</span>
                        </td>
                        <td className="max-w-[420px] px-3 py-3 text-muted">{a.role}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {a.outputs.map((o) => (
                              <Tag key={o}>{o}</Tag>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          {a.runs}
                          {a.failed > 0 && <span className="block text-xs text-danger">{a.failed} failed</span>}
                        </td>
                        <td className="px-5 py-3 text-xs whitespace-nowrap text-muted">{a.last_run ? relative(a.last_run) : "Not yet run"}</td>
                      </tr>
                    ))}
                  </tbody>
                );
              })}
            </table>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Model router"
          subtitle="Users choose what to create; the router picks the capability and model. Models are replaceable through the gateway — no model is assumed universally best."
          actions={models.data && <Badge tone="info">{models.data.deployment.label}</Badge>}
        />
        {models.data && <p className="border-b border-border px-4 py-2 text-2xs text-muted">{models.data.deployment.detail}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-2xs text-subtle">
                <th className="px-4 py-2 font-semibold">Capability</th>
                <th className="px-2 py-2 font-semibold">Models (in routing order)</th>
                <th className="px-2 py-2 font-semibold">Via</th>
                <th className="px-2 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {(models.data?.routes ?? []).map((r) => (
                <tr key={r.capability} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-2.5 font-medium">
                    {r.label}
                    {r.note && <span className="block text-2xs font-normal text-subtle">{r.note}</span>}
                  </td>
                  <td className="px-2 py-2.5 text-muted">{r.models.length ? r.models.join(" → ") : "—"}</td>
                  <td className="px-2 py-2.5 text-muted">{r.via}</td>
                  <td className="px-2 py-2.5">
                    <Badge tone={r.status === "active" ? "success" : r.status === "offline" ? "warning" : "neutral"}>
                      {r.status === "active" ? "Active" : r.status === "offline" ? "Offline" : "Not configured"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Page>
  );
}
