import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, ExternalLink, Pencil, X } from "lucide-react";
import { api } from "@/lib/api";
import { cx, dateTime } from "@/lib/format";
import { OUTPUT_SHORT } from "@/lib/outputs";
import { CLAIM_STATUS, MODALITY_LABEL, REF_STATUS } from "@/lib/status";
import type { Claim, Modality, OutputType, Transformation } from "@/lib/types";
import { useAction } from "@/hooks/useAction";
import { useApp } from "@/store/app";
import { Badge, ToneIcon } from "../ui/Badge";
import { Button } from "../ui/Button";
import { SectionLabel } from "../ui/Card";
import { Select } from "../ui/Menu";
import { Drawer } from "../ui/Overlay";
import { TextArea, TextInput } from "../ui/misc";
import { SourceViewer } from "./SourceViewer";
import { tr } from "@/i18n";

function Check3({ ok, label, detail }: { ok: boolean | null; label: string; detail?: string }) {
  return (
    <li className="flex items-start gap-2 py-1">
      {ok === null ? (
        <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-border" />
      ) : ok ? (
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success text-surface">
          <Check size={11} strokeWidth={3} />
        </span>
      ) : (
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-danger text-surface">
          <X size={11} strokeWidth={3} />
        </span>
      )}
      <span className="min-w-0 text-xs">
        <span className="text-fg">{label}</span>
        {detail && <span className="block text-2xs text-muted">{detail}</span>}
      </span>
    </li>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[108px_1fr] gap-3 py-1.5 text-xs">
      <dt className="text-subtle">{k}</dt>
      <dd className="min-w-0 text-fg">{children}</dd>
    </div>
  );
}

function highlight(text: string, value: string) {
  const i = text.toLowerCase().indexOf(value.toLowerCase());
  if (i < 0 || !value) return text;
  return (
    <>
      {text.slice(0, i)}
      <strong className="rounded-sm bg-mark px-0.5 font-semibold text-paper-ink not-italic">{text.slice(i, i + value.length)}</strong>
      {text.slice(i + value.length)}
    </>
  );
}

function EditClaim({ t, claim, onDone }: { t: Transformation; claim: Claim; onDone: () => void }) {
  const [value, setValue] = useState(claim.display_value);
  const [modality, setModality] = useState<Modality>(claim.modality);
  const [note, setNote] = useState("");
  const setT = useApp((s) => s.setTransformation);
  const toast = useApp((s) => s.toast);
  const { run, pending } = useAction(api.updateClaim, { errorTitle: tr("Could not update claim") });
  return (
    <div className="space-y-3 rounded-lg border border-accent-line bg-accent-soft/40 p-3.5">
      <p className="text-xs font-semibold">{tr("Correct this claim")}</p>
      <label className="block text-2xs text-muted">
        {tr("Value")}
        <TextInput value={value} onChange={(e) => setValue(e.target.value)} className="mt-1" />
      </label>
      <div className="text-2xs text-muted">
        {tr("Certainty")}
        <Select
          variant="field"
          label={tr("Certainty")}
          value={MODALITY_LABEL[modality]}
          options={Object.values(MODALITY_LABEL)}
          onChange={(v) => setModality((Object.keys(MODALITY_LABEL).find((k) => MODALITY_LABEL[k] === v) ?? "confirmed") as Modality)}
          className="mt-1"
        />
      </div>
      <label className="block text-2xs text-muted">
        {tr("Reason (recorded in audit and provenance)")}
        <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr("e.g. Corrected after SOC log review")} className="mt-1" />
      </label>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>
          {tr("Cancel")}
        </Button>
        <Button
          size="sm"
          variant="primary"
          loading={pending}
          disabled={!note.trim()}
          onClick={async () => {
            const r = await run(t.id, claim.claim_id, { value: value !== claim.display_value ? value : undefined, modality, note });
            if (r) {
              setT(r.transformation);
              toast({
                tone: r.dependents.length ? "warning" : "success",
                title: tr("Claim updated"),
                body: r.dependents.length
                  ? tr("{n} dependent artefact(s) need regeneration: {list}.", { n: r.dependents.length, list: r.dependents.map((d) => OUTPUT_SHORT[d]).join(", ") })
                  : tr("No artefacts depend on this claim."),
              });
              onDone();
            }
          }}
        >
          {tr("Save & find dependents")}
        </Button>
      </div>
    </div>
  );
}

export function ClaimDrawer() {
  const focus = useApp((s) => s.claimFocus);
  const close = useApp((s) => s.closeClaim);
  const t = useApp((s) => (focus ? s.transformations[focus.tid] : undefined));
  const [editing, setEditing] = useState(false);

  const data = useMemo(() => {
    if (!focus || !t) return null;
    const claim = t.claims.find((c) => c.claim_id === focus.claimId);
    if (!claim) return null;
    const art = focus.artifact ? t.artifacts[focus.artifact] : undefined;
    const ref = art?.verification?.refs.find((r) => r.ref_id === focus.refId);
    const usedBy = (Object.entries(t.artifacts) as [OutputType, NonNullable<Transformation["artifacts"][OutputType]>][])
      .map(([k, a]) => ({ k, n: a.verification?.refs.filter((r) => r.claim_ids.includes(claim.claim_id)).length ?? 0 }))
      .filter((x) => x.n > 0);
    const conflict = t.consistency.conflicts.find((c) => c.claim_id === claim.claim_id);
    const sourceConflict = t.source_conflicts.find((c) => c.claim_ids.includes(claim.claim_id));
    const version = art?.versions[art.versions.length - 1];
    return { claim, art, ref, usedBy, conflict, sourceConflict, version };
  }, [focus, t]);

  const open = !!focus && !!data;
  if (!open || !data || !t || !focus) return <Drawer open={false} onClose={close} title="" children={null} />;
  const { claim, art, ref, usedBy, conflict, sourceConflict, version } = data;
  const cs = CLAIM_STATUS[claim.status];
  const drift = ref?.issues.filter((i) => i.kind === "drift" && i.claim_id === claim.claim_id) ?? [];
  const unc = ref?.issues.filter((i) => i.kind === "uncertainty" && i.claim_id === claim.claim_id) ?? [];
  const grounded = ["verified", "human_verified"].includes(claim.status);

  return (
    <Drawer
      open={open}
      onClose={() => {
        setEditing(false);
        close();
      }}
      title={
        <span className="flex items-center gap-2">
          {tr("Why did the AI say this?")}
          <Badge tone="info">{claim.claim_id}</Badge>
        </span>
      }
      subtitle={`${t.id} · ${claim.label}`}
      width="max-w-[600px]"
    >
      <div className="space-y-5 px-5 py-4">
        {ref && (
          <section>
            <SectionLabel>Generated statement · {art?.label}</SectionLabel>
            <blockquote
              className={cx(
                "mt-2 rounded-lg border-l-2 bg-surface-2 px-3.5 py-2.5 text-sm leading-relaxed",
                ref.status === "grounded" ? "border-success" : ref.status === "review" ? "border-warning" : "border-danger",
              )}
            >
              {ref.sentence}
            </blockquote>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone={REF_STATUS[ref.status].tone}>
                <ToneIcon tone={REF_STATUS[ref.status].tone} /> {REF_STATUS[ref.status].label}
              </Badge>
              {ref.claim_ids.length > 1 && <span className="text-2xs text-subtle">Cites {ref.claim_ids.join(", ")}</span>}
            </div>
            {ref.issues.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {ref.issues.map((i, n) => (
                  <li key={n} className="flex gap-2 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-xs text-danger">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>
                      <span className="font-semibold">
                        {i.kind === "drift" ? tr("Claim conflict") : i.kind === "uncertainty" ? tr("Uncertainty strengthening detected") : tr("Unsupported")}
                      </span>
                      <span className="block text-2xs">{i.detail}</span>
                      {i.kind === "uncertainty" && (
                        <span className="block text-2xs">
                          {tr("Source confidence")}: <b>{MODALITY_LABEL[i.expected ?? ""] ?? i.expected}</b> · {tr("Generated confidence")}:{" "}
                          <b>{MODALITY_LABEL[i.found ?? ""] ?? i.found}</b>
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section>
          <SectionLabel right={<Badge tone={cs.tone}>{cs.label}</Badge>}>{tr("Canonical claim")}</SectionLabel>
          <div className="mt-2 rounded-lg border border-border px-3.5 py-3">
            <p className="text-sm font-semibold text-fg">{claim.display_value}</p>
            <p className="text-2xs text-muted">
              {claim.label} · {claim.category.toLowerCase()} · certainty <b className="text-fg">{MODALITY_LABEL[claim.modality]}</b> · v{claim.version}
            </p>
          </div>
          <p className="mt-1.5 text-2xs text-muted">{claim.grounding_note}</p>
        </section>

        <section>
          <SectionLabel>{tr("Evidence")}</SectionLabel>
          <dl className="mt-1.5 divide-y divide-border">
            <Row k={tr("Source")}>{claim.source_name}</Row>
            <Row k={tr("Page")}>{claim.page ?? "— (not paginated)"}</Row>
            <Row k={tr("Source text")}>
              <span className="text-muted italic">"{highlight(claim.evidence_text, claim.display_value !== claim.value ? claim.value : claim.value)}"</span>
            </Row>
            {claim.corroborated_by.length > 0 && (
              <Row k={tr("Corroborated")}>
                {claim.corroborated_by.map((c) => (
                  <span key={c.source_id} className="block">
                    {c.source_name}
                    {c.page ? ` · p${c.page}` : ""}
                  </span>
                ))}
              </Row>
            )}
          </dl>
          <div className="mt-2.5">
            <SourceViewer tid={t.id} claim={claim} />
          </div>
        </section>

        {sourceConflict && (
          <section className="rounded-lg border border-warning-line bg-warning-soft px-3.5 py-3">
            <p className="text-xs font-semibold text-warning">
              {tr("Source conflict")} · {sourceConflict.status === "unresolved" ? tr("Unresolved") : tr("Resolved")}
            </p>
            <ul className="mt-1.5 space-y-1 text-xs">
              {sourceConflict.values.map((v) => (
                <li key={v.claim_id}>
                  <b>{v.value}</b> <span className="text-muted">— {v.source_name}</span>
                </li>
              ))}
            </ul>
            {sourceConflict.status === "unresolved" && <p className="mt-1.5 text-2xs text-muted">{tr("Resolve it from the Evidence tab of the workspace.")}</p>}
          </section>
        )}

        <section>
          <SectionLabel>{tr("Transformation")}</SectionLabel>
          <dl className="mt-1.5 divide-y divide-border">
            <Row k={tr("Transformation")}>{t.id}</Row>
            <Row k={tr("Extracted by")}>
              {claim.extracted_by}
              {claim.model && <span className="text-muted"> · {claim.model}</span>}
            </Row>
            {art && (
              <Row k={tr("Written by")}>
                {art.agent}
                {version && (
                  <span className="text-muted">
                    {" "}
                    · v{version.version} · {version.model ?? version.author}
                  </span>
                )}
              </Row>
            )}
            <Row k={tr("Model routing")}>{tr("Selected by the model router (text reasoning)")}</Row>
          </dl>
        </section>

        <section>
          <SectionLabel>{tr("Verification")}</SectionLabel>
          <ul className="mt-1.5">
            <Check3 ok={grounded} label={tr("Source supported")} detail={grounded ? tr("Quote located in the source and contains the value.") : claim.grounding_note} />
            <Check3
              ok={ref ? drift.length === 0 : !conflict}
              label={claim.normalized.type === "date" ? tr("Date consistent") : tr("Value consistent")}
              detail={drift[0]?.detail ?? (conflict ? tr("Cross-output conflict in {list}", { list: conflict.affected.map((a) => OUTPUT_SHORT[a]).join(", ") }) : undefined)}
            />
            <Check3 ok={ref ? unc.length === 0 : true} label={tr("Certainty preserved")} detail={unc[0]?.detail ?? tr("Source certainty: {level}", { level: MODALITY_LABEL[claim.modality] })} />
            <Check3 ok={ref ? !ref.issues.some((i) => i.kind === "unsupported") : true} label={tr("No unsupported claim")} />
            <Check3
              ok={art?.security ? !art.security.blocked : null}
              label={tr("Security")}
              detail={art?.security ? tr("{exposure} policy · {status}", { exposure: tr(art.security.exposure_label), status: tr(art.security.status) }) : tr("Open from an artefact to see its policy")}
            />
          </ul>
        </section>

        {usedBy.length > 0 && (
          <section>
            <SectionLabel>{tr("Used by (dependency graph)")}</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {usedBy.map(({ k, n }) => (
                <Link
                  key={k}
                  to={`/workspace/${t.id}/artifact/${k}`}
                  onClick={close}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-2xs text-muted hover:border-accent hover:text-accent"
                >
                  {OUTPUT_SHORT[k]} · {n} <ExternalLink size={10} />
                </Link>
              ))}
            </div>
            <p className="mt-1.5 text-2xs text-subtle">{tr("Changing this claim marks only these artefacts for regeneration.")}</p>
          </section>
        )}

        {claim.history.length > 0 && (
          <section>
            <SectionLabel>{tr("History")}</SectionLabel>
            <ul className="mt-1.5 space-y-1 text-2xs text-muted">
              {claim.history.map((h) => (
                <li key={h.version}>
                  v{h.version} · {dateTime(h.at)} · {h.by}: {h.before.display_value} → {tr("current")} · "{h.note}"
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          {editing ? (
            <EditClaim t={t} claim={claim} onDone={() => setEditing(false)} />
          ) : (
            <Button size="sm" icon={<Pencil size={13} />} onClick={() => setEditing(true)} disabled={claim.status === "superseded"}>
              {tr("Correct claim")}
            </Button>
          )}
        </section>
      </div>
    </Drawer>
  );
}
