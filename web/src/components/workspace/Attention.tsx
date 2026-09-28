import { Link } from "react-router-dom";
import { AlertTriangle, GitBranch, RefreshCcw, ShieldAlert, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "@/lib/api";
import { OUTPUT_SHORT } from "@/lib/outputs";
import { MODALITY_LABEL } from "@/lib/status";
import type { OutputType, Transformation } from "@/lib/types";
import { useAction } from "@/hooks/useAction";
import { useApp } from "@/store/app";
import { Button } from "../ui/Button";
import { tr } from "@/i18n";

function Banner({ tone, icon, title, children, actions }: { tone: "warning" | "danger"; icon: ReactNode; title: string; children: ReactNode; actions?: ReactNode }) {
  const c = tone === "danger" ? "border-danger-line bg-danger-soft" : "border-warning-line bg-warning-soft";
  const t = tone === "danger" ? "text-danger" : "text-warning";
  return (
    <div className={`animate-fade-in rounded-xl border ${c} px-4 py-3`} role="alert">
      <div className="flex flex-wrap items-start gap-3">
        <span className={`mt-0.5 ${t}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold ${t}`}>{title}</p>
          <div className="mt-1 text-sm text-fg">{children}</div>
        </div>
        {actions && <div className="flex flex-wrap gap-1.5">{actions}</div>}
      </div>
    </div>
  );
}

/** Everything that blocks approval, with the action that resolves it. */
export function Attention({ t, busy, refresh }: { t: Transformation; busy: boolean; refresh: () => Promise<void> }) {
  const openClaim = useApp((s) => s.openClaim);
  const stale = (Object.entries(t.artifacts) as [OutputType, NonNullable<Transformation["artifacts"][OutputType]>][]).filter(([, a]) => a.stale);
  const regen = useAction(async () => {
    await api.regenerateStale(t.id);
    await refresh();
  }, { success: tr("Regenerating affected outputs only") });
  const repair = useAction(async (cxid: string) => {
    await api.repairConflict(t.id, cxid);
    await refresh();
  }, { success: tr("Repairing dependents from the evidence ledger") });
  const fixUnc = useAction(async (o: OutputType) => {
    await api.repairUncertainty(t.id, o);
    await refresh();
  }, { success: tr("Regenerating with certainty constraints") });

  const uncertainty = (Object.entries(t.artifacts) as [OutputType, NonNullable<Transformation["artifacts"][OutputType]>][])
    .map(([k, a]) => ({ k, a, issues: (a.verification?.refs ?? []).flatMap((r) => r.issues.filter((i) => i.kind === "uncertainty").map((i) => ({ i, r }))) }))
    .filter((x) => x.issues.length && !x.a.stale);
  const openSC = t.source_conflicts.filter((c) => c.status === "unresolved");
  const blocked = Object.values(t.artifacts).filter((a) => a?.security?.blocked);

  const fallback = t.engine.fallback;
  if (!fallback && !stale.length && !t.consistency.conflicts.length && !uncertainty.length && !openSC.length && !blocked.length) return null;

  return (
    <div className="space-y-2">
      {fallback && (
        <Banner tone="warning" icon={<AlertTriangle size={17} />} title={tr("Live model unavailable · offline fallback used")}>
          {fallback.replace(/\.+$/, "")}.{" "}
          {tr("Affected artefacts were produced by the offline extractive engine and are marked for review; they still pass the same verification gates. Regenerate them once the model gateway is available.")}
        </Banner>
      )}
      {stale.length > 0 && (
        <Banner
          tone="warning"
          icon={<GitBranch size={17} />}
          title={tr("Claim updated")}
          actions={
            <Button size="sm" variant="primary" icon={<RefreshCcw size={13} />} loading={regen.pending} disabled={busy} onClick={() => void regen.run()}>
              {tr("Regenerate affected outputs")}
            </Button>
          }
        >
          {tr("{n} of {total} artefacts depend on changed evidence and require regeneration:", { n: stale.length, total: Object.keys(t.artifacts).length })}{" "}
          {stale.map(([k]) => OUTPUT_SHORT[k]).join(", ")}. {stale[0][1].stale?.reason}. {tr("Unaffected artefacts are not regenerated.")}
        </Banner>
      )}

      {t.consistency.conflicts.map((c) => {
        const wrong = c.observations.filter((o) => !o.matches);
        const ref = wrong[0] ? t.artifacts[wrong[0].artifact]?.verification?.refs.find((r) => r.sentence === wrong[0].sentence) : undefined;
        return (
          <Banner
            key={c.id}
            tone="danger"
            icon={<AlertTriangle size={17} />}
            title={tr("Claim conflict detected")}
            actions={
              <>
                <Button size="sm" onClick={() => openClaim({ tid: t.id, claimId: c.claim_id, artifact: wrong[0]?.artifact, refId: ref?.ref_id })}>
                  {tr("Review conflict")}
                </Button>
                <Button size="sm" variant="primary" icon={<Wrench size={13} />} loading={repair.pending} disabled={busy} onClick={() => void repair.run(c.id)}>
                  {tr("Regenerate dependents")}
                </Button>
              </>
            }
          >
            <div className="grid gap-x-6 gap-y-0.5 sm:grid-cols-[auto_1fr]">
              <span className="text-muted">
                {c.claim_id} · {c.attribute}
              </span>
              <span />
              <span className="text-muted">{tr("Source")}</span>
              <span className="font-semibold text-success">{c.source_value}</span>
              {wrong.map((o) => (
                <span key={o.artifact + o.path} className="contents">
                  <span className="text-muted">{OUTPUT_SHORT[o.artifact]}</span>
                  <span className="font-semibold text-danger">{o.value}</span>
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-2xs text-muted">
              Affected outputs: {c.affected.map((a) => OUTPUT_SHORT[a]).join(", ")} · Claim used by {c.dependents.length} artefact(s)
            </p>
          </Banner>
        );
      })}

      {uncertainty.map(({ k, a, issues }) => (
        <Banner
          key={k}
          tone="danger"
          icon={<AlertTriangle size={17} />}
          title={tr("Uncertainty strengthening detected")}
          actions={
            <>
              <Button size="sm" onClick={() => openClaim({ tid: t.id, claimId: issues[0].i.claim_id ?? "", artifact: k, refId: issues[0].r.ref_id })}>
                {tr("Human review")}
              </Button>
              <Button size="sm" variant="primary" icon={<Wrench size={13} />} loading={fixUnc.pending} disabled={busy} onClick={() => void fixUnc.run(k)}>
                {tr("Repair")}
              </Button>
            </>
          }
        >
          {issues.length === 1
            ? tr("{label} states a hedged claim with more certainty than the source.", { label: tr(a.label) })
            : tr("{label} states {n} hedged claims with more certainty than the source.", { label: tr(a.label), n: issues.length })}
          <span className="mt-1 block text-2xs text-muted">
            “{issues[0].r.sentence.slice(0, 140)}” · {tr("Source confidence")}: <b>{MODALITY_LABEL[issues[0].i.expected ?? ""]}</b> → {tr("Generated")}:{" "}
            <b>{MODALITY_LABEL[issues[0].i.found ?? ""]}</b>. {tr("Approval is blocked until repaired.")}
          </span>
        </Banner>
      ))}

      {openSC.map((c) => (
        <Banner
          key={c.id}
          tone="warning"
          icon={<AlertTriangle size={17} />}
          title={tr("Source conflict · unresolved")}
          actions={
            <Link to={`/workspace/${t.id}?tab=evidence`} className="inline-flex h-8 items-center rounded-lg border border-border bg-surface px-2.5 text-xs font-medium hover:bg-surface-2">
              {tr("Resolve")}
            </Link>
          }
        >
          <b>{c.attribute}</b>: {c.values.map((v) => tr("{source} says {value}", { source: v.source_name, value: v.value })).join(" · ")}. {tr("PRAMAAN will not choose automatically; artefacts mark this value as under review.")}
        </Banner>
      ))}

      {blocked.map((a) => (
        <Banner key={a!.type} tone="danger" icon={<ShieldAlert size={17} />} title={tr("Security policy blocked an artefact")}>
          {tr("{label} contains content that cannot be released on this channel ({channel}). Edit or regenerate it before approval.", { label: tr(a!.label), channel: tr(a!.security!.exposure_label) })}
        </Banner>
      ))}
    </div>
  );
}
