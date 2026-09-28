import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, Eye, Film, Palette, FlaskConical, History, ImagePlus, MoreHorizontal, Pencil, RefreshCcw, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { cx, dateTime } from "@/lib/format";
import { OutputIcon } from "@/lib/outputs";
import { ACTION_TONE, ARTIFACT_STATUS, REF_STATUS } from "@/lib/status";
import type { Content, OutputType } from "@/lib/types";
import { useAction } from "@/hooks/useAction";
import { useTransformation } from "@/hooks/useTransformation";
import { useApp } from "@/store/app";
import { taskDetail } from "@/lib/tasks";
import { ApprovalPanel } from "@/components/artifacts/ApprovalPanel";
import { ArtifactEditor } from "@/components/artifacts/ArtifactEditor";
import { ExportMenu, VerificationBadge } from "@/components/artifacts/ArtifactCard";
import { ArtifactRenderer } from "@/components/artifacts/renderers";
import { InfographicDesign } from "@/components/artifacts/InfographicDesign";
import { buildTrace, TraceProvider } from "@/components/evidence/ClaimText";
import { RedTeamCard } from "@/components/workspace/VerificationPanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SectionLabel } from "@/components/ui/Card";
import { MenuButton } from "@/components/ui/Menu";
import { Modal } from "@/components/ui/Overlay";
import { EmptyState, Hash, ProgressBar, Skeleton, Tabs, TextArea } from "@/components/ui/misc";
import { tr } from "@/i18n";

type View = "draft" | "released";
const ILLUSTRATABLE: OutputType[] = ["linkedin", "presentation", "video"];
type Side = "review" | "evidence" | "security" | "history";

export function ArtifactPage() {
  const { tid = "", type = "" } = useParams();
  const otype = type as OutputType;
  const { t, busy, error, refresh } = useTransformation(tid);
  const [sp, setSp] = useSearchParams();
  const [view, setView] = useState<View>("draft");
  const [showClaims, setShowClaims] = useState(true);
  const [showSec, setShowSec] = useState(sp.get("security") === "1");
  const [side, setSide] = useState<Side>(sp.get("panel") === "evidence" ? "evidence" : sp.get("security") === "1" ? "security" : "review");
  const [oldVersion, setOldVersion] = useState<{ version: number; content: Content } | null>(null);
  const [regenOpen, setRegenOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const editing = sp.get("edit") === "1";
  const openClaim = useApp((s) => s.openClaim);
  const setT = useApp((s) => s.setTransformation);
  const toast = useApp((s) => s.toast);

  const a = t?.artifacts[otype];
  const regen = useAction(api.regenerate, { success: tr("Regenerating this artefact only") });
  const illustrate = useAction(api.illustrate, { success: tr("Visual Agent is generating illustrations") });
  const imageGen = useApp((s) => s.config?.image_generation);
  const videoProd = useApp((s) => s.config?.video_production);
  const renderVideo = useAction(api.renderVideo, { success: tr("Rendering the MP4: narration, visuals and subtitles") });
  const design = useAction(api.designInfographic, { success: tr("Visual Agent is designing the infographic") });
  const drift = useAction(api.simulateDrift, { errorTitle: tr("Could not inject test conflict") });

  useEffect(() => setOldVersion(null), [a?.version]);

  const trace = useMemo(() => {
    if (!t || !a) return null;
    const live = view === "draft" && !oldVersion;
    return buildTrace(t.id, otype, live ? a.verification?.refs ?? [] : [], live ? a.security?.findings ?? [] : [], showClaims && live, showSec && live);
  }, [t, a, otype, view, oldVersion, showClaims, showSec]);

  if (error && !t) return <EmptyState className="h-full" title={tr("Transformation not found")} body={error.message} />;
  if (!t) return <div className="p-6"><Skeleton className="h-96 w-full" /></div>;
  if (!a) return <EmptyState className="h-full" title={tr("Artefact not found")} body={tr("{id} has no {type} artefact.", { id: t.id, type })} action={<Link to={`/workspace/${t.id}`} className="text-xs font-semibold text-accent">{tr("Back to workspace")}</Link>} />;

  const st = ARTIFACT_STATUS[a.status];
  const content = oldVersion?.content ?? (view === "released" ? a.released : a.content);
  const refs = a.verification?.refs ?? [];
  const issues = refs.filter((r) => r.status !== "grounded" && r.status !== "review");
  const task = [...t.tasks].reverse().find((x) => x.key === `write:${otype}`);
  const setEdit = (on: boolean) => setSp((p) => (on ? p.set("edit", "1") : p.delete("edit"), p), { replace: true });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-surface px-4 py-3 sm:px-6">
        <Link to={`/workspace/${t.id}`} className="inline-flex items-center gap-1 text-2xs text-muted hover:text-fg">
          <ChevronLeft size={13} /> {t.id} · {t.title}
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
          <span className="text-accent">
            <OutputIcon type={otype} size={20} />
          </span>
          <h1 className="text-base font-bold">{tr(a.label)}</h1>
          <span className="text-xs text-subtle">v{a.version}</span>
          <Badge tone={st.tone} dot>
            {st.label}
          </Badge>
          <VerificationBadge a={a} />
          <div className="flex-1" />
          <div className="flex flex-wrap items-center gap-1.5">
            <Tabs<View>
              size="sm"
              value={view}
              onChange={(v) => (setView(v), setOldVersion(null))}
              tabs={[
                { id: "draft", label: tr("Traceable draft") },
                { id: "released", label: tr("Released version") },
              ]}
            />
            <Button size="sm" variant={showClaims ? "subtle" : "ghost"} icon={<Eye size={13} />} onClick={() => setShowClaims((s) => !s)} disabled={view !== "draft"} aria-pressed={showClaims}>
              {tr("Claims")}
            </Button>
            <Button size="sm" variant={showSec ? "subtle" : "ghost"} icon={<ShieldCheck size={13} />} onClick={() => setShowSec((s) => !s)} disabled={view !== "draft"} aria-pressed={showSec}>
              {tr("Security")}
            </Button>
            <Button size="sm" icon={<Pencil size={13} />} onClick={() => setEdit(!editing)} disabled={busy || !a.content}>
              {tr("Edit")}
            </Button>
            {otype === "video" && (
              <Button
                size="sm"
                icon={<Film size={14} />}
                disabled={busy || !a.content || !videoProd?.available}
                loading={renderVideo.pending}
                title={
                  videoProd?.available
                    ? (videoProd.motion ? tr("Narrated MP4 with motion clips") : tr("Narrated MP4 with animated stills"))
                    : tr("Video production is not configured on this server")
                }
                onClick={async () => {
                  if (await renderVideo.run(t.id)) await refresh();
                }}
              >
                {a.video_render ? tr("Re-render MP4") : tr("Render MP4")}
              </Button>
            )}
            {otype === "infographic" && (
              <Button
                size="sm"
                icon={<Palette size={14} />}
                disabled={busy || !a.content || !imageGen?.infographic_design}
                loading={design.pending}
                title={
                  imageGen?.infographic_design
                    ? tr("Draw the released infographic with {model}, then read it back and verify it", { model: imageGen.infographic_model ?? "" })
                    : tr("Designed infographics need an OpenAI image model on this server")
                }
                onClick={async () => {
                  if (await design.run(t.id)) await refresh();
                }}
              >
                {a.design ? tr("Redesign") : tr("Design")}
              </Button>
            )}
            {ILLUSTRATABLE.includes(otype) && (
              <Button
                size="sm"
                icon={<ImagePlus size={14} />}
                disabled={busy || !a.content || !imageGen?.available}
                loading={illustrate.pending}
                title={imageGen?.available ? tr("Generate illustrations with {model}", { model: imageGen.model ?? "" }) : tr("Image generation is not configured on this server")}
                onClick={async () => {
                  if (await illustrate.run(t.id, otype)) await refresh();
                }}
              >
                {a.illustrations?.length ? tr("Redraw illustrations") : tr("Illustrate")}
              </Button>
            )}
            <Button size="sm" icon={<RefreshCcw size={13} />} onClick={() => setRegenOpen(true)} disabled={busy || !a.content}>
              {tr("Regenerate")}
            </Button>
            <ExportMenu tid={t.id} a={a} />
            <MenuButton
              label={tr("More actions")}
              trigger={(open, toggle) => (
                <Button size="sm" variant="ghost" aria-label={tr("More actions")} aria-expanded={open} onClick={toggle}>
                  <MoreHorizontal size={15} />
                </Button>
              )}
              items={[
                {
                  label: tr("Inject test conflict (demo)"),
                  icon: <FlaskConical size={13} />,
                  hint: tr("shifts a date"),
                  disabled: busy || !a.content,
                  onSelect: async () => {
                    const r = await drift.run(t.id, otype);
                    if (r) {
                      setT(r.transformation);
                      toast({ tone: "warning", title: tr("Test edit applied"), body: tr("{claim}: {from} → {to}. Watch the consistency engine react.", { claim: r.change.claim_id, from: r.change.from, to: r.change.to }) });
                    }
                  },
                },
                { label: tr("Version history"), icon: <History size={13} />, onSelect: () => setSide("history") },
              ]}
            />
          </div>
        </div>
        {view === "released" && (
          <p className="mt-2 text-2xs text-muted">
            {tr("Released version: the audience policy ({policy}) has been applied. This is exactly what export produces.", { policy: tr(a.security?.exposure_label ?? "") })}
          </p>
        )}
        {oldVersion && (
          <p className="mt-2 text-2xs text-warning">
            {tr("Viewing v{n} (read-only).", { n: oldVersion.version })}{" "}
            <button type="button" className="font-semibold underline" onClick={() => setOldVersion(null)}>
              {tr("Back to current")}
            </button>
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-bg px-4 py-5 sm:px-6">
          {a.stale && (
            <div className="mx-auto mb-4 flex max-w-[860px] items-start gap-2 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-xs" role="alert">
              <TriangleAlert size={15} className="mt-0.5 text-warning" />
              <span className="flex-1">
                <b>{tr("Evidence changed.")}</b> {a.stale.reason}. {tr("Regenerate affected outputs from the workspace.")}
              </span>
            </div>
          )}
          {editing && a.content ? (
            <div className="mx-auto max-w-[860px]">
              <ArtifactEditor t={t} a={a} onClose={() => setEdit(false)} />
            </div>
          ) : !content || a.status === "generating" || a.status === "queued" ? (
            <div className="mx-auto max-w-[860px] rounded-xl border border-border bg-surface p-8">
              {a.status === "failed" ? (
                <EmptyState
                  title={tr("Agent execution interrupted")}
                  body={
                    <>
                      {tr("{agent} failed while generating this artefact. Other completed artefacts remain available.", { agent: tr(a.agent) })}
                      {a.error && <span className="mt-2 block text-danger">{a.error}</span>}
                    </>
                  }
                  action={
                    <Button variant="primary" size="sm" loading={regen.pending} onClick={() => void regen.run(t.id, otype, "").then(refresh)}>
                      {tr("Retry agent")}
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-semibold">
                    {tr(a.agent)} · {task ? taskDetail(task) : tr("Queued")}
                  </p>
                  <ProgressBar value={task?.progress ?? 5} indeterminate />
                  <Skeleton className="h-6 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-24 w-full" />
                </div>
              )}
            </div>
          ) : (
            <>
            {otype === "infographic" && view === "draft" && !oldVersion && <InfographicDesign tid={t.id} a={a} />}
            <article className="mx-auto max-w-[860px] rounded-xl border border-border bg-surface px-6 py-7 shadow-sm sm:px-10">
              {trace && (
                <TraceProvider value={trace}>
                  <ArtifactRenderer
                    type={otype}
                    content={content}
                    svgUrl={api.previewSvgUrl(t.id, otype, a.version, view === "released")}
                    images={oldVersion ? {} : Object.fromEntries((a.illustrations ?? []).map((x) => [x.slot, api.illustrationUrl(t.id, otype, x.slot, x.sha256)]))}
                    video={
                      otype === "video" && a.video_render && !oldVersion && view === "draft"
                        ? { src: api.videoUrl(t.id, a.video_render.sha256), render: a.video_render, stale: a.video_render.artifact_version !== a.version }
                        : undefined
                    }
                  />
                </TraceProvider>
              )}
            </article>
            </>
          )}
          {view === "draft" && showClaims && !editing && content && (
            <div className="mx-auto mt-3 flex max-w-[860px] flex-wrap items-center gap-3 text-2xs text-muted">
              <span>{tr("Legend:")}</span>
              <span className="claim claim-grounded">{tr("Evidence grounded")}</span>
              <span className="claim claim-review">{tr("Requires review")}</span>
              <span className="claim claim-bad">{tr("Unsupported or contradicts evidence")}</span>
              {showSec && <span className="sec-mark">{tr("sensitive (policy applied on release)")}</span>}
              <span>{tr("· Click any marked sentence: “Why did the AI say this?”")}</span>
            </div>
          )}
        </div>

        <aside className="w-full shrink-0 overflow-y-auto border-t border-border bg-surface lg:w-[380px] lg:border-t-0 lg:border-l">
          <div className="border-b border-border px-3 py-2">
            <Tabs<Side>
              size="sm"
              value={side}
              onChange={setSide}
              tabs={[
                { id: "review", label: tr("Review") },
                { id: "evidence", label: tr("Evidence"), count: a.verification?.claims_used.length ?? 0 },
                { id: "security", label: tr("Security"), count: a.security?.findings.length ?? 0 },
                { id: "history", label: tr("Versions"), count: a.versions.length },
              ]}
            />
          </div>
          <div className="space-y-4 p-4">
            {side === "review" && (
              <>
                <ApprovalPanel t={t} a={a} busy={busy} />
                {(a.illustrations?.length ?? 0) > 0 && (
                  <div className="rounded-xl border border-border px-4 py-3">
                    <SectionLabel right={<span className="text-2xs text-subtle">{a.illustrations![0].model.split("/").pop()}</span>}>
                      {tr("Illustrations")}
                    </SectionLabel>
                    <p className="mt-1 text-xs text-muted">{tr("Decorative only. Prompts come from the writer's visual suggestions, scrubbed before leaving the server.")}</p>
                    <ul className="mt-2 space-y-2">
                      {a.illustrations!.map((x) => (
                        <li key={x.slot} className="text-xs">
                          <details>
                            <summary className="flex cursor-pointer items-center gap-2 font-medium text-fg">
                              <Sparkles size={12} className="text-subtle" /> {tr(x.label)}
                              {x.removed.length > 0 && <span className="text-2xs text-warning">{x.removed.length} item(s) removed</span>}
                            </summary>
                            <p className="mt-1.5 text-muted">
                              <span className="font-medium text-fg">{tr("Prompt sent:")} </span>
                              {x.prompt}
                            </p>
                            {x.removed.length > 0 && <p className="mt-1 text-warning">Removed: {x.removed.join(", ")}</p>}
                            <p className="mt-1 font-mono text-2xs text-subtle">sha256 {x.sha256.slice(0, 16)}…</p>
                          </details>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {a.red_team && <RedTeamCard rt={a.red_team} compact />}
                {issues.length > 0 && (
                  <div>
                    <SectionLabel>{tr("Issues to resolve")}</SectionLabel>
                    <ul className="mt-2 space-y-1.5">
                      {issues.map((r) => (
                        <li key={r.ref_id}>
                          <button
                            type="button"
                            onClick={() => openClaim({ tid: t.id, claimId: r.issues[0]?.claim_id ?? r.claim_ids[0] ?? "", artifact: otype, refId: r.ref_id })}
                            disabled={!r.issues[0]?.claim_id && !r.claim_ids[0]}
                            className="w-full rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-left text-2xs disabled:cursor-default"
                          >
                            <span className="font-semibold text-danger">
                              {REF_STATUS[r.status].label}
                            </span>
                            <span className="mt-0.5 block text-fg">{r.issues[0]?.detail}</span>
                            <span className="mt-0.5 line-clamp-2 block text-muted italic">“{r.sentence}”</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {a.format_warnings.length > 0 && (
                  <div>
                    <SectionLabel>{tr("Format checks")}</SectionLabel>
                    <ul className="mt-1.5 space-y-1 text-2xs text-warning">
                      {a.format_warnings.map((w) => (
                        <li key={w}>• {w}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="rounded-xl border border-border px-4 py-3 text-2xs">
                  <SectionLabel>{tr("Provenance")}</SectionLabel>
                  <dl className="mt-1.5 space-y-1 text-muted">
                    <div className="flex justify-between gap-2">
                      <dt>{tr("Output hash")}</dt>
                      <dd>
                        <Hash value={a.output_hash} />
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>{tr("Evidence state")}</dt>
                      <dd>
                        <Hash value={t.provenance.evidence_hash} />
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>{tr("Agent")}</dt>
                      <dd className="text-fg">{tr(a.agent)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>{tr("Model")}</dt>
                      <dd className="truncate text-fg" title={a.versions[a.versions.length - 1]?.model ?? ""}>
                        {a.versions[a.versions.length - 1]?.model?.split("/").pop() ?? a.versions[a.versions.length - 1]?.author ?? "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>{tr("Exports")}</dt>
                      <dd className="text-fg">{a.exported.length ? a.exported.map((e) => `v${e.version} ${e.format}`).join(", ") : tr("None")}</dd>
                    </div>
                  </dl>
                </div>
              </>
            )}

            {side === "evidence" && (
              <div>
                <p className="mb-2 text-2xs text-muted">{tr("Claims this artefact states, and the sentences that state them.")}</p>
                <ul className="space-y-2">
                  {(a.verification?.claims_used ?? []).map((cid) => {
                    const c = t.claims.find((x) => x.claim_id === cid);
                    const rs = refs.filter((r) => r.claim_ids.includes(cid));
                    if (!c) return null;
                    return (
                      <li key={cid} className="rounded-lg border border-border">
                        <button type="button" onClick={() => openClaim({ tid: t.id, claimId: cid, artifact: otype, refId: rs[0]?.ref_id })} className="w-full px-3 py-2 text-left hover:bg-surface-2">
                          <span className="text-2xs font-semibold text-accent">{cid}</span>{" "}
                          <span className="text-xs">
                            {c.label}: <b>{c.display_value}</b>
                          </span>
                          <span className="block text-2xs text-subtle">
                            {c.source_name}
                            {c.page ? ` · p.${c.page}` : ""} · {rs.length} sentence(s)
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {!a.verification?.claims_used.length && <li className="text-2xs text-subtle">{tr("No claims linked yet.")}</li>}
                </ul>
              </div>
            )}

            {side === "security" && a.security && (
              <div>
                <p className="text-xs">
                  {tr("Exposure")}: <b>{tr(a.security.exposure_label)}</b> · {tr("Classification")} {tr(t.params.classification)}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {a.security.findings.map((f) => (
                    <li key={f.id} className="rounded-lg border border-border px-3 py-2 text-2xs">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 font-semibold text-fg">{tr(f.label)}</span>
                        <Badge tone={ACTION_TONE[f.action!]}>{f.action}</Badge>
                      </div>
                      <p className="mt-0.5 truncate text-muted" title={f.text}>
                        {f.class === "credential" ? "••••••••" : f.text}
                        {f.released_as && <> → <span className="text-fg">{f.released_as}</span></>}
                      </p>
                      <p className="text-subtle">{tr(f.reason ?? "")}</p>
                    </li>
                  ))}
                  {!a.security.findings.length && <li className="text-2xs text-subtle">{tr("No sensitive content in this artefact.")}</li>}
                </ul>
              </div>
            )}

            {side === "history" && (
              <ol className="space-y-1.5">
                {[...a.versions].reverse().map((v) => {
                  const current = v.version === a.version;
                  return (
                    <li key={v.version}>
                      <button
                        type="button"
                        disabled={current && !oldVersion}
                        onClick={async () => {
                          if (current) return setOldVersion(null);
                          try {
                            const r = await api.version(t.id, otype, v.version);
                            setOldVersion({ version: r.version, content: r.content });
                            setView("draft");
                          } catch (e) {
                            toast({ tone: "danger", title: tr("Could not load version"), body: (e as Error).message });
                          }
                        }}
                        className={cx(
                          "w-full rounded-lg border px-3 py-2 text-left",
                          oldVersion?.version === v.version || (current && !oldVersion) ? "border-accent bg-accent-soft/40" : "border-border hover:bg-surface-2",
                        )}
                      >
                        <span className="flex items-center gap-2 text-xs">
                          <b>v{v.version}</b>
                          {current && <Badge tone="info">{tr("current")}</Badge>}
                          <span className="ml-auto text-2xs text-subtle">{dateTime(v.created_at)}</span>
                        </span>
                        <span className="block text-2xs text-muted">{v.reason}</span>
                        <span className="block text-2xs text-subtle">
                          {v.author}
                          {v.model ? ` · ${v.model.split("/").pop()}` : ""} · {v.hash.slice(0, 10)}…
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </aside>
      </div>

      <Modal
        open={regenOpen}
        onClose={() => setRegenOpen(false)}
        title={tr("Regenerate {label}", { label: tr(a.label) })}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRegenOpen(false)}>
              {tr("Cancel")}
            </Button>
            <Button
              variant="primary"
              loading={regen.pending}
              onClick={async () => {
                const ok = await regen.run(t.id, otype, instruction);
                if (ok) {
                  setRegenOpen(false);
                  setInstruction("");
                  await refresh();
                }
              }}
            >
              {tr("Regenerate v{n}", { n: a.version + 1 })}
            </Button>
          </>
        }
      >
        <p className="mb-2 text-xs text-muted">{tr("Only this artefact is regenerated, from the same evidence ledger and contract. It will be re-verified and needs approval again.")}</p>
        <TextArea rows={3} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder={tr("Optional instruction, e.g. “shorter, emphasise the recommended actions”")} aria-label={tr("Regeneration instruction")} />
      </Modal>
    </div>
  );
}
