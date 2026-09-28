import { useMemo, useState } from "react";
import { Check, Scale } from "lucide-react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { OUTPUT_ORDER, OUTPUT_SHORT, OutputIcon } from "@/lib/outputs";
import { CLAIM_STATUS, MODALITY_LABEL } from "@/lib/status";
import type { OutputType, SourceConflict, Transformation } from "@/lib/types";
import { useAction } from "@/hooks/useAction";
import { useApp } from "@/store/app";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card, CardHeader } from "../ui/Card";
import { EmptyState, Hash, TextInput } from "../ui/misc";
import { tr } from "@/i18n";

function ConflictResolver({ t, c }: { t: Transformation; c: SourceConflict }) {
  const [choice, setChoice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const setT = useApp((s) => s.setTransformation);
  const toast = useApp((s) => s.toast);
  const { run, pending } = useAction(api.resolveSourceConflict, { errorTitle: tr("Could not resolve conflict") });
  const resolved = c.status === "resolved";
  return (
    <div className={cx("rounded-xl border p-4", resolved ? "border-border" : "border-warning-line bg-warning-soft/40")}>
      <div className="flex flex-wrap items-center gap-2">
        <Scale size={15} className={resolved ? "text-success" : "text-warning"} />
        <p className="text-xs font-bold">Source conflict · {c.id}</p>
        <Badge tone={resolved ? "success" : "warning"}>{resolved ? tr("Resolved") : tr("Unresolved")}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted">
        {tr("Claim")}: <b className="text-fg">{c.attribute}</b>
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {c.values.map((v) => {
          const on = resolved ? c.resolution?.claim_id === v.claim_id : choice === v.claim_id;
          return (
            <button
              key={v.claim_id}
              type="button"
              disabled={resolved}
              onClick={() => setChoice(v.claim_id)}
              aria-pressed={on}
              className={cx(
                "rounded-lg border bg-surface p-3 text-left transition-colors",
                on ? "border-accent ring-2 ring-accent-soft" : "border-border hover:border-border-strong",
                resolved && !on && "opacity-50",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-fg">{v.value}</span>
                {on && resolved && <Check size={14} className="text-success" />}
              </div>
              <p className="mt-0.5 text-2xs text-muted">
                {v.source_name}
                {v.page ? ` · page ${v.page}` : ""} · {v.claim_id}
              </p>
              <p className="mt-1.5 line-clamp-3 text-2xs text-muted italic">“{v.evidence_text}”</p>
            </button>
          );
        })}
      </div>
      {resolved ? (
        <p className="mt-2 text-2xs text-muted">
          Resolved by {c.resolution?.by}: {c.resolution?.value} ({c.resolution?.source_name}){c.resolution?.note ? ` · “${c.resolution.note}”` : ""}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <TextInput className="max-w-sm flex-1" placeholder={tr("Reason for decision (required)")} value={note} onChange={(e) => setNote(e.target.value)} aria-label={tr("Resolution reason")} />
          <Button
            variant="primary"
            size="sm"
            disabled={!choice || !note.trim()}
            loading={pending}
            onClick={async () => {
              const r = await run(t.id, c.id, choice!, note);
              if (r) {
                setT(r.transformation);
                toast({ tone: "success", title: tr("Conflict resolved"), body: tr("{n} dependent artefact(s) marked for regeneration.", { n: r.dependents.length }) });
              }
            }}
          >
            {tr("Confirm value")}
          </Button>
          <span className="text-2xs text-subtle">{tr("Human review required — never resolved automatically.")}</span>
        </div>
      )}
    </div>
  );
}

export function EvidencePanel({ t }: { t: Transformation }) {
  const openClaim = useApp((s) => s.openClaim);
  const outs = OUTPUT_ORDER.filter((o) => t.artifacts[o]);
  const usage = useMemo(() => {
    const m = new Map<string, Set<OutputType>>();
    outs.forEach((o) => t.artifacts[o]?.verification?.claims_used.forEach((cid) => m.set(cid, (m.get(cid) ?? new Set()).add(o))));
    return m;
  }, [t, outs]);
  const counts = t.claims.reduce<Record<string, number>>((acc, c) => ((acc[c.status] = (acc[c.status] ?? 0) + 1), acc), {});

  if (!t.claims.length) {
    return <EmptyState title={tr("Evidence state not built yet")} body={tr("The Evidence Extraction Agent is reading the sources. Claims appear here as soon as every quote has been checked.")} />;
  }
  return (
    <div className="space-y-4">
      {t.source_conflicts.map((c) => (
        <ConflictResolver key={c.id} t={t} c={c} />
      ))}
      <Card>
        <CardHeader
          title={tr("Canonical evidence state")}
          subtitle={tr("Claim → Evidence → Source → Location. Every artefact derives its facts from this ledger; click a row for full traceability.")}
          actions={
            <span className="flex items-center gap-2 text-2xs text-muted">
              {tr("State hash")} <Hash value={t.provenance.evidence_hash} />
            </span>
          }
        />
        <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2.5">
          {Object.entries(counts).map(([k, n]) => (
            <Badge key={k} tone={CLAIM_STATUS[k as keyof typeof CLAIM_STATUS]?.tone ?? "neutral"}>
              {CLAIM_STATUS[k as keyof typeof CLAIM_STATUS]?.label ?? k} · {n}
            </Badge>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-2xs text-subtle">
                <th className="px-4 py-2 font-semibold">{tr("ID")}</th>
                <th className="px-2 py-2 font-semibold">{tr("Claim")}</th>
                <th className="px-2 py-2 font-semibold">{tr("Certainty")}</th>
                <th className="px-2 py-2 font-semibold">{tr("Source · location")}</th>
                <th className="px-2 py-2 font-semibold">{tr("Status")}</th>
                <th className="px-2 py-2 font-semibold" title={tr("Dependency graph: which artefacts state this claim")}>
                  {tr("Used by")}
                </th>
              </tr>
            </thead>
            <tbody>
              {t.claims.map((c) => {
                const st = CLAIM_STATUS[c.status];
                const used = usage.get(c.claim_id);
                return (
                  <tr
                    key={c.claim_id}
                    onClick={() => openClaim({ tid: t.id, claimId: c.claim_id })}
                    className={cx("cursor-pointer border-b border-border last:border-0 hover:bg-surface-2", c.status === "superseded" && "opacity-50")}
                  >
                    <td className="px-4 py-2.5 align-top font-semibold text-accent">{c.claim_id}</td>
                    <td className="max-w-[380px] px-2 py-2.5 align-top">
                      <button type="button" className="text-left" onClick={(e) => (e.stopPropagation(), openClaim({ tid: t.id, claimId: c.claim_id }))}>
                        <span className="text-muted">{c.label}: </span>
                        <span className="font-semibold text-fg">{c.display_value}</span>
                        <span className="mt-0.5 line-clamp-1 block text-2xs text-subtle italic">“{c.evidence_text}”</span>
                      </button>
                    </td>
                    <td className="px-2 py-2.5 align-top">
                      <span className={cx(c.modality !== "confirmed" && "font-semibold text-warning")}>{MODALITY_LABEL[c.modality]}</span>
                    </td>
                    <td className="px-2 py-2.5 align-top text-muted">
                      <span className="block max-w-[200px] truncate" title={c.source_name}>
                        {c.source_id} · {c.source_name}
                      </span>
                      <span className="text-2xs text-subtle">
                        {c.page ? `p.${c.page}` : c.char_span ? `chars ${c.char_span[0]}–${c.char_span[1]}` : "—"}
                        {c.location ? " · bbox" : ""}
                        {c.corroborated_by.length ? ` · +${c.corroborated_by.length} corroborating` : ""}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 align-top">
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </td>
                    <td className="px-2 py-2.5 align-top">
                      <div className="flex gap-1">
                        {outs.map((o) => (
                          <span
                            key={o}
                            title={`${OUTPUT_SHORT[o]}${used?.has(o) ? " uses this claim" : ""}`}
                            className={cx("flex h-5 w-5 items-center justify-center rounded", used?.has(o) ? "bg-accent-soft text-accent" : "text-border-strong")}
                          >
                            <OutputIcon type={o} size={11} />
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
