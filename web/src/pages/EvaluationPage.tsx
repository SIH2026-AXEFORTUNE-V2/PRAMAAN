import { Link } from "react-router-dom";
import { FlaskConical } from "lucide-react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { useFetch } from "@/hooks/useFetch";
import { Page } from "@/components/shell/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { msg, tr } from "@/i18n";

const DESC: Record<string, string> = {
  factual_fidelity: msg("Share of factual sentences whose dates, numbers and entities map to verified claims."),
  claim_coverage: msg("Share of extracted claims that at least one artefact communicates."),
  unsupported_rate: msg("Sentences stating figures or dates found nowhere in the evidence or source."),
  consistency: msg("Claims stated by two or more artefacts with the same value in all of them."),
  uncertainty: msg("Sentences citing hedged claims that kept the source's certainty."),
  security_leakage: msg("Items the release policy had to block (should be zero in released versions)."),
  provenance: msg("Artefacts with a recorded output hash in the ledger."),
  recovery: msg("Regenerations avoided by dependency-aware regeneration after evidence changes."),
};

export function EvaluationPage() {
  const { data, loading, reload } = useFetch(api.evaluation);
  return (
    <Page
      title={tr("Transform-Bench")}
      subtitle={tr("Evaluation of trustworthy transformation, computed from this workspace's own runs.")}
      actions={
        <Button size="sm" onClick={() => void reload()}>
          {tr("Recompute")}
        </Button>
      }
    >
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.runs === 0 ? (
        <Card>
          <EmptyState
            icon={<FlaskConical size={20} />}
            title={tr("Not evaluated")}
            body={tr("No completed transformations yet. Metrics are computed only from real runs — nothing is estimated or pre-filled.")}
            action={<Link to="/workspace" className="text-xs font-semibold text-accent hover:underline">{tr("Run a transformation")}</Link>}
          />
        </Card>
      ) : (
        <>
          <div className="mb-4">
            <Badge tone="warning">{data.label}</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.metrics.map((m) => (
              <Card key={m.key} className="p-4">
                <p className="text-xs font-semibold text-fg">{tr(m.label)}</p>
                <p className={cx("mt-2 text-2xl font-bold tabular-nums", m.value === null ? "text-subtle" : "text-fg")}>
                  {m.value === null ? tr("Not evaluated") : `${m.value}${m.unit === "%" ? "%" : ` ${m.unit}`}`}
                </p>
                <p className="mt-1 text-2xs text-muted">{m.basis}</p>
                <p className="mt-3 border-t border-border pt-2 text-2xs text-subtle">
                  {tr(DESC[m.key])}
                  {m.lower_is_better ? " Lower is better." : ""}
                </p>
              </Card>
            ))}
          </div>
          <p className="mt-4 text-2xs text-subtle">
            {tr("These are automated self-consistency measurements over local runs, not a human-annotated benchmark. They show how the verification layer behaved; they are not a claim of accuracy.")}
          </p>
        </>
      )}
    </Page>
  );
}
