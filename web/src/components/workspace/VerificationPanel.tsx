import { Link } from "react-router-dom";
import { Swords } from "lucide-react";
import { cx, timeSec } from "@/lib/format";
import { OUTPUT_ORDER, OutputIcon } from "@/lib/outputs";
import type { RedTeam, Transformation } from "@/lib/types";
import { Badge, ToneIcon } from "../ui/Badge";
import { Card, CardHeader } from "../ui/Card";
import { EmptyState } from "../ui/misc";

const METRICS: { key: keyof Omit<RedTeam, "status">; label: string; tip: string }[] = [
  { key: "factual_drift", label: "Factual drift", tip: "Dates / numbers / names that contradict the claim they state" },
  { key: "unsupported_claims", label: "Unsupported claims", tip: "Figures or dates that exist nowhere in the evidence or source" },
  { key: "cross_output_conflicts", label: "Cross-output conflicts", tip: "Artefacts disagreeing on the value of the same claim" },
  { key: "security_leaks", label: "Security leaks", tip: "Content blocked by the release policy on its channel" },
  { key: "uncertainty_violations", label: "Uncertainty violations", tip: "Hedged claims stated with more certainty than the source" },
];

export function RedTeamCard({ rt, compact }: { rt: RedTeam; compact?: boolean }) {
  const passed = rt.status === "passed";
  return (
    <div className={cx("rounded-xl border", passed ? "border-success-line" : rt.status === "pending" ? "border-border" : "border-danger-line")}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Swords size={15} className="text-muted" />
        <p className="flex-1 text-2xs font-bold">Red team review</p>
        <Badge tone={passed ? "success" : rt.status === "pending" ? "neutral" : "danger"}>
          {rt.status !== "pending" && <ToneIcon tone={passed ? "success" : "danger"} />}
          {passed ? "Passed" : rt.status === "pending" ? "Pending" : "Failed"}
        </Badge>
      </div>
      <dl className={cx("grid", compact ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-5")}>
        {METRICS.map((m) => {
          const v = rt[m.key];
          return (
            <div key={m.key} className={cx("px-4 py-2.5", compact ? "flex items-center justify-between border-b border-border last:border-0" : "")} title={m.tip}>
              <dt className="text-2xs text-muted">{m.label}</dt>
              <dd className={cx("font-bold tabular-nums", compact ? "text-xs" : "mt-0.5 text-lg", v ? "text-danger" : "text-fg")}>{rt.status === "pending" ? "—" : v}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export function VerificationPanel({ t }: { t: Transformation }) {
  const arts = OUTPUT_ORDER.map((o) => t.artifacts[o]).filter((a): a is NonNullable<typeof a> => !!a && !!a.verification);
  if (!arts.length) return <EmptyState title="Nothing verified yet" body="Each artefact is verified the moment its agent finishes." />;
  return (
    <div className="space-y-4">
      <RedTeamCard rt={t.red_team} />
      <Card>
        <CardHeader
          title="Per-artefact verification"
          subtitle={`Consistency ${t.consistency.status} across ${t.consistency.claims_compared ?? 0} shared claims · last checked ${timeSec(t.consistency.checked_at)}`}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-2xs text-subtle">
                <th className="px-4 py-2 font-semibold">Artefact</th>
                <th className="px-2 py-2 font-semibold">Grounded</th>
                <th className="px-2 py-2 font-semibold">Review</th>
                <th className="px-2 py-2 font-semibold">Drift</th>
                <th className="px-2 py-2 font-semibold">Unsupported</th>
                <th className="px-2 py-2 font-semibold">Uncertainty</th>
                <th className="px-2 py-2 font-semibold">Claims used</th>
                <th className="px-2 py-2 font-semibold">Red team</th>
              </tr>
            </thead>
            <tbody>
              {arts.map((a) => {
                const c = a.verification!.counts;
                return (
                  <tr key={a.type} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <Link to={`/workspace/${t.id}/artifact/${a.type}`} className="inline-flex items-center gap-2 font-medium hover:text-accent">
                        <OutputIcon type={a.type} size={14} /> {a.label} <span className="text-subtle">v{a.version}</span>
                      </Link>
                    </td>
                    <td className="px-2 py-2.5 text-success tabular-nums">{c.grounded}</td>
                    <td className={cx("px-2 py-2.5 tabular-nums", c.review ? "text-warning" : "text-subtle")}>{c.review}</td>
                    <td className={cx("px-2 py-2.5 tabular-nums", c.drift ? "font-bold text-danger" : "text-subtle")}>{c.drift}</td>
                    <td className={cx("px-2 py-2.5 tabular-nums", c.unsupported ? "font-bold text-danger" : "text-subtle")}>{c.unsupported}</td>
                    <td className={cx("px-2 py-2.5 tabular-nums", c.uncertainty ? "font-bold text-danger" : "text-subtle")}>{c.uncertainty}</td>
                    <td className="px-2 py-2.5 text-muted">{a.verification!.claims_used.join(" ") || "—"}</td>
                    <td className="px-2 py-2.5">
                      <Badge tone={a.red_team?.status === "passed" ? "success" : a.red_team ? "danger" : "neutral"}>
                        {a.red_team?.status === "passed" ? "Passed" : a.red_team ? "Failed" : "Pending"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-2xs text-subtle">
        Checks are deterministic: dates and numbers are normalised and compared with the claim they refer to; certainty is compared on a fixed scale
        (unverified &lt; possible/suspected/alleged &lt; reported/estimated &lt; probable &lt; confirmed). No system can guarantee zero hallucinations — these
        checks make every factual statement inspectable.
      </p>
    </div>
  );
}
