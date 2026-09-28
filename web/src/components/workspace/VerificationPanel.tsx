import { Link } from "react-router-dom";
import { Swords } from "lucide-react";
import { cx, timeSec } from "@/lib/format";
import { OUTPUT_ORDER, OutputIcon } from "@/lib/outputs";
import type { RedTeam, Transformation } from "@/lib/types";
import { Badge, ToneIcon } from "../ui/Badge";
import { Card, CardHeader } from "../ui/Card";
import { EmptyState } from "../ui/misc";
import { msg, tr } from "@/i18n";

const METRICS: { key: keyof Omit<RedTeam, "status">; label: string; tip: string }[] = [
  { key: "factual_drift", label: msg("Factual drift"), tip: msg("Dates / numbers / names that contradict the claim they state") },
  { key: "unsupported_claims", label: msg("Unsupported claims"), tip: msg("Figures or dates that exist nowhere in the evidence or source") },
  { key: "cross_output_conflicts", label: msg("Cross-output conflicts"), tip: msg("Artefacts disagreeing on the value of the same claim") },
  { key: "security_leaks", label: msg("Security leaks"), tip: msg("Content blocked by the release policy on its channel") },
  { key: "uncertainty_violations", label: msg("Uncertainty violations"), tip: msg("Hedged claims stated with more certainty than the source") },
];

export function RedTeamCard({ rt, compact }: { rt: RedTeam; compact?: boolean }) {
  const passed = rt.status === "passed";
  return (
    <div className={cx("rounded-xl border", passed ? "border-success-line" : rt.status === "pending" ? "border-border" : "border-danger-line")}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Swords size={15} className="text-muted" />
        <p className="flex-1 text-2xs font-bold">{tr("Red team review")}</p>
        <Badge tone={passed ? "success" : rt.status === "pending" ? "neutral" : "danger"}>
          {rt.status !== "pending" && <ToneIcon tone={passed ? "success" : "danger"} />}
          {passed ? tr("Passed") : rt.status === "pending" ? tr("Pending") : tr("Failed")}
        </Badge>
      </div>
      <dl className={cx("grid", compact ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-5")}>
        {METRICS.map((m) => {
          const v = rt[m.key];
          return (
            <div key={m.key} className={cx("px-4 py-2.5", compact ? "flex items-center justify-between border-b border-border last:border-0" : "")} title={tr(m.tip)}>
              <dt className="text-2xs text-muted">{tr(m.label)}</dt>
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
  if (!arts.length) return <EmptyState title={tr("Nothing verified yet")} body={tr("Each artefact is verified the moment its agent finishes.")} />;
  return (
    <div className="space-y-4">
      <RedTeamCard rt={t.red_team} />
      <Card>
        <CardHeader
          title={tr("Per-artefact verification")}
          subtitle={tr("Consistency {status} across {n} shared claims · last checked {time}", { status: tr(t.consistency.status), n: t.consistency.claims_compared ?? 0, time: timeSec(t.consistency.checked_at) })}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-2xs text-subtle">
                <th className="px-4 py-2 font-semibold">{tr("Artefact")}</th>
                <th className="px-2 py-2 font-semibold">{tr("Grounded")}</th>
                <th className="px-2 py-2 font-semibold">{tr("Review")}</th>
                <th className="px-2 py-2 font-semibold">{tr("Drift")}</th>
                <th className="px-2 py-2 font-semibold">{tr("Unsupported")}</th>
                <th className="px-2 py-2 font-semibold">{tr("Uncertainty")}</th>
                <th className="px-2 py-2 font-semibold">{tr("Claims used")}</th>
                <th className="px-2 py-2 font-semibold">{tr("Red team")}</th>
              </tr>
            </thead>
            <tbody>
              {arts.map((a) => {
                const c = a.verification!.counts;
                return (
                  <tr key={a.type} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <Link to={`/workspace/${t.id}/artifact/${a.type}`} className="inline-flex items-center gap-2 font-medium hover:text-accent">
                        <OutputIcon type={a.type} size={14} /> {tr(a.label)} <span className="text-subtle">v{a.version}</span>
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
                        {a.red_team?.status === "passed" ? tr("Passed") : a.red_team ? tr("Failed") : tr("Pending")}
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
        {tr("Checks are deterministic: dates and numbers are normalised and compared with the claim they refer to; certainty is compared on a fixed scale (unverified &lt; possible/suspected/alleged &lt; reported/estimated &lt; probable &lt; confirmed). No system can guarantee zero hallucinations — these checks make every factual statement inspectable.")}
      </p>
    </div>
  );
}
