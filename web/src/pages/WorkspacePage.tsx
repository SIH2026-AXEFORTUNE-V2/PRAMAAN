import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertOctagon,
  ArrowUp,
  CheckCircle2,
  Download,
  FileSearch,
  Fingerprint,
  ListChecks,
  PanelRightOpen,
  Pin,
  PinOff,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "@/lib/api";
import { download } from "@/lib/download";
import { cx, dateTime, duration } from "@/lib/format";
import { OUTPUT_ORDER } from "@/lib/outputs";
import { TRANSFORMATION_STATUS } from "@/lib/status";
import type { Transformation } from "@/lib/types";
import { useAction } from "@/hooks/useAction";
import { isBusy, useTransformation } from "@/hooks/useTransformation";
import { useApp } from "@/store/app";
import { DEFAULT_PARAMS, useDraft, type DraftParams } from "@/store/draft";
import { ArtifactCard } from "@/components/artifacts/ArtifactCard";
import { TaskPanel } from "@/components/tasks/TaskPanel";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Overlay";
import { EmptyState, Skeleton, Tabs, TextInput } from "@/components/ui/misc";
import { AgentGrid } from "@/components/workspace/AgentGrid";
import { AgentPlan } from "@/components/workspace/AgentPlan";
import { Attention } from "@/components/workspace/Attention";
import { Composer } from "@/components/workspace/Composer";
import { EvidencePanel } from "@/components/workspace/EvidencePanel";
import { ProvenancePanel } from "@/components/workspace/ProvenancePanel";
import { SecurityPanel } from "@/components/workspace/SecurityPanel";
import { SourceCard } from "@/components/workspace/SourceCard";
import { AgentTurn, UserTurn } from "@/components/workspace/Thread";
import { TransformationControls } from "@/components/workspace/TransformationControls";
import { VerificationPanel } from "@/components/workspace/VerificationPanel";
import { tr } from "@/i18n";

type Tab = "evidence" | "verification" | "security" | "provenance";

/** The orchestrator's closing message, rebuilt from state so it is shown in the interface language. */
function resultSummary(t: Transformation): string {
  const arts = OUTPUT_ORDER.map((o) => t.artifacts[o]).filter((a): a is NonNullable<typeof a> => !!a);
  const done = arts.filter((a) => a.content).length;
  const review = arts.filter((a) => a.status === "needs_review" || a.status === "blocked");
  const failed = arts.filter((a) => a.status === "failed");
  const open = t.source_conflicts.filter((c) => c.status === "unresolved").length;
  const parts = [tr("{n} of {total} artefacts generated and verified against {claims} evidence claims.", { n: done, total: arts.length, claims: t.claims.length })];
  if (review.length) parts.push(tr("{n} need your attention before approval: {list}.", { n: review.length, list: review.map((a) => tr(a.label)).join(", ") }));
  if (failed.length) parts.push(tr("Failed: {list}. Completed artefacts remain available.", { list: failed.map((a) => tr(a.label)).join(", ") }));
  if (open) parts.push(tr("{n} source conflict(s) are unresolved.", { n: open }));
  parts.push(tr("Nothing is released until you approve it."));
  return parts.join(" ");
}

function Header({ children, right, title, subtitle }: { children?: React.ReactNode; right?: React.ReactNode; title?: string; subtitle?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        {children}
        <h1 className="mt-1 text-xl font-semibold text-fg sm:text-2xl">{title ?? tr("Content Transformation Workspace")}</h1>
        <p className="mt-1.5 max-w-[68ch] text-sm text-muted">
          {subtitle ?? tr("Transform one source into verified, audience-specific communication artefacts.")}
        </p>
      </div>
      {right && <div className="flex flex-wrap items-center gap-1.5">{right}</div>}
    </div>
  );
}

function Lineage() {
  const steps = [tr("Source"), tr("Evidence"), tr("Transformation"), tr("Verification"), tr("Approval"), tr("Provenance")];
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-2xs text-muted">
      {steps.map((s, i) => (
        <span key={s} className="inline-flex items-center gap-2">
          <span className="rounded-md border border-border bg-surface px-2 py-0.5 font-medium text-fg">{s}</span>
          {i < steps.length - 1 && <span className="text-subtle">→</span>}
        </span>
      ))}
    </div>
  );
}

function NewTransformation() {
  const config = useApp((s) => s.config);
  const params = useDraft((s) => s.params);
  const setParam = useDraft((s) => s.setParam);
  return (
    <div className="mx-auto max-w-[1180px] space-y-7 px-4 py-7 sm:px-8">
      <Header />
      {config ? <TransformationControls config={config} params={params} onChange={setParam} /> : <Skeleton className="h-12 w-full" />}
      <div className="rounded-2xl border border-dashed border-border-strong bg-surface-2/60 px-6 py-10 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-muted">
          <Upload size={20} />
        </div>
        <p className="text-sm font-semibold text-fg">{tr("No transformation yet.")}</p>
        <p className="mx-auto mt-1 max-w-lg text-xs text-muted">
          {tr("Upload a source document and describe what you want to create. PRAMAAN builds one evidence base, generates every artefact from it, verifies each claim and waits for your approval.")}
        </p>
        <div className="mt-5">
          <Lineage />
        </div>
      </div>
      <Composer />
    </div>
  );
}

function ContractBar({ t, busy }: { t: Transformation; busy: boolean }) {
  const config = useApp((s) => s.config);
  const fromT = useMemo<DraftParams>(() => ({ ...DEFAULT_PARAMS, ...t.params }), [t.params]);
  const [p, setP] = useState<DraftParams>(fromT);
  useEffect(() => setP(fromT), [fromT]);
  const changed = (Object.keys(p) as (keyof DraftParams)[]).filter((k) => p[k] !== fromT[k]);
  const { run, pending } = useAction(api.applyContract, { success: tr("Contract updated · regenerating artefacts") });
  if (!config) return <Skeleton className="h-12 w-full" />;
  return (
    <div>
      <TransformationControls config={config} params={p} onChange={(k, v) => setP((x) => ({ ...x, [k]: v }))} disabled={busy} />
      {changed.length > 0 && (
        <div className="animate-fade-in mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-accent-line bg-accent-soft px-3 py-2 text-xs">
          <span className="flex-1 text-fg">
            Contract change: {changed.map((k) => `${k} → ${p[k]}`).join(", ")}. Applying signs contract v{t.contract.version + 1} and regenerates every artefact from the same evidence.
          </span>
          <Button size="sm" variant="ghost" onClick={() => setP(fromT)}>
            {tr("Discard")}
          </Button>
          <Button size="sm" variant="primary" loading={pending} onClick={() => void run(t.id, p)}>
            {tr("Apply contract")}
          </Button>
        </div>
      )}
    </div>
  );
}

function FollowUp({ t, busy, refresh }: { t: Transformation; busy: boolean; refresh: () => Promise<void> }) {
  const [text, setText] = useState("");
  const { run, pending } = useAction(api.message, { errorTitle: tr("Could not send instruction") });
  const send = async () => {
    if (!text.trim() || busy) return;
    const ok = await run(t.id, text.trim());
    if (ok) {
      setText("");
      await refresh();
    }
  };
  return (
    <div className="border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-[1180px] items-center gap-2 rounded-xl border border-border bg-surface px-2 py-1.5 shadow-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
        <TextInput
          aria-label={tr("Follow-up instruction")}
          className="border-0 shadow-none focus:ring-0"
          placeholder={busy ? tr("Agents are running…") : tr("Ask for changes, additional formats or refinements (e.g. “add a LinkedIn post”, “make the executive summary shorter”)")}
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void send()}
        />
        <Button variant="primary" size="sm" aria-label={tr("Send")} loading={pending} disabled={busy || !text.trim()} onClick={() => void send()} icon={!pending && <ArrowUp size={15} />}>
          {tr("Send")}
        </Button>
      </div>
    </div>
  );
}

function FailureCard({ t, refresh }: { t: Transformation; refresh: () => Promise<void> }) {
  const navigate = useNavigate();
  const failed = t.tasks.find((x) => x.status === "failed");
  const sourceFail = failed?.key.startsWith("source") || t.sources.some((s) => s.status === "failed");
  const retry = useAction(async () => {
    await api.retry(t.id);
    await refresh();
  }, { errorTitle: tr("Retry failed") });
  return (
    <div className="rounded-xl border border-danger-line bg-danger-soft px-4 py-4" role="alert">
      <div className="flex items-center gap-2 text-danger">
        <AlertOctagon size={17} />
        <p className="text-2xs font-bold">{sourceFail ? tr("Source processing failed") : tr("Evidence extraction failed")}</p>
      </div>
      <p className="mt-1.5 text-xs text-fg">{t.error ?? failed?.error ?? tr("The transformation could not complete.")}</p>
      {sourceFail && <p className="mt-1 text-2xs text-muted">{tr("Possible reasons: unsupported format · corrupted file · processing timeout.")}</p>}
      <div className="mt-3 flex gap-2">
        <Button size="sm" icon={<RotateCcw size={13} />} loading={retry.pending} onClick={() => void retry.run()}>
          {tr("Retry")}
        </Button>
        <Button size="sm" variant="ghost" icon={<Upload size={13} />} onClick={() => navigate("/workspace")}>
          {tr("Upload another source")}
        </Button>
      </div>
    </div>
  );
}

function ExistingTransformation({ id }: { id: string }) {
  const { t, busy, error, refresh } = useTransformation(id);
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("tab") as Tab) || "evidence";
  const pinned = useApp((s) => s.pinned.includes(id));
  const togglePin = useApp((s) => s.togglePin);
  const panelOpen = useApp((s) => s.taskPanelOpen);
  const setPanel = useApp((s) => s.setTaskPanel);
  const drop = useApp((s) => s.dropTransformation);
  const toast = useApp((s) => s.toast);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(false);
  const del = useAction(async () => {
    await api.remove(id);
    drop(id);
    navigate("/workspace");
  }, { success: tr("Transformation deleted") });

  if (error && !t) {
    return (
      <EmptyState
        className="h-full"
        icon={<FileSearch size={20} />}
        title={error.status === 404 ? tr("Transformation not found") : tr("Could not load transformation")}
        body={error.message}
        action={
          <Link to="/workspace" className="text-xs font-semibold text-accent hover:underline">
            {tr("Start a new transformation")}
          </Link>
        }
      />
    );
  }
  if (!t) {
    return (
      <div className="mx-auto max-w-[1180px] space-y-4 px-6 py-6">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const st = TRANSFORMATION_STATUS[t.status];
  const arts = OUTPUT_ORDER.map((o) => t.artifacts[o]).filter((a): a is NonNullable<typeof a> => !!a);
  const approved = arts.filter((a) => a.approval.status === "approved").length;
  const running = t.tasks.filter((x) => x.status === "running").length;
  const first = t.messages[0];
  const planMsg = t.messages.find((m) => m.kind === "plan");
  const firstResultIdx = t.messages.findIndex((m) => m.kind === "result");
  const followUps = t.messages.slice(1).filter((m, i) => m.kind !== "plan" && i + 1 !== firstResultIdx);
  const firstResult = firstResultIdx >= 0 ? t.messages[firstResultIdx] : null;
  const failed = t.status === "failed" && !t.claims.length;
  const openSC = t.source_conflicts.filter((c) => c.status === "unresolved").length;
  const issues = (t.red_team.status === "failed" ? 1 : 0) + t.consistency.conflicts.length;

  const panel = <TaskPanel t={t} onClose={() => (mobilePanel ? setMobilePanel(false) : setPanel(false))} />;

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1180px] space-y-7 px-4 py-7 sm:px-8">
            <Header
              title={t.title}
              subtitle={t.summary || undefined}
              right={
                <>
                  <IconButton label={pinned ? tr("Unpin") : tr("Pin to sidebar")} onClick={() => togglePin(t.id)} active={pinned}>
                    {pinned ? <PinOff size={15} /> : <Pin size={15} />}
                  </IconButton>
                  <Button
                    size="sm"
                    icon={<Download size={13} />}
                    disabled={!approved}
                    title={approved ? tr("Download approved artefacts with evidence ledger and manifest") : tr("Approve at least one artefact first")}
                    onClick={() => download(api.bundleUrl(t.id)).catch((e: Error) => toast({ tone: "danger", title: tr("Export blocked"), body: e.message }))}
                  >
                    {tr("Approved bundle")}
                  </Button>
                  <IconButton label={tr("Delete transformation")} onClick={() => setConfirmDelete(true)} disabled={busy}>
                    <Trash2 size={15} />
                  </IconButton>
                  <Button size="sm" variant="ghost" className="xl:hidden" icon={<ListChecks size={14} />} onClick={() => setMobilePanel(true)}>
                    {tr("Tasks")}{running ? ` · ${running}` : ""}
                  </Button>
                  {!panelOpen && (
                    <span className="hidden xl:contents">
                      <IconButton label={tr("Open task panel")} onClick={() => setPanel(true)}>
                        <PanelRightOpen size={16} />
                      </IconButton>
                    </span>
                  )}
                </>
              }
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <Badge tone={st.tone} dot>
                  {st.label}
                </Badge>
                <span className="font-mono font-semibold text-fg">{t.id}</span>
                <span>{tr("Created {when}", { when: dateTime(t.created_at) })}</span>
                {t.total_seconds !== null && !busy && <span>{tr("Ran in {time}", { time: duration(t.total_seconds) })}</span>}
                <span>{tr("{n} of {total} approved", { n: approved, total: arts.length })}</span>
              </div>
            </Header>

            <ContractBar t={t} busy={busy} />

            <UserTurn name={first?.author ?? tr("Operator")} ts={first?.ts ?? t.created_at}>
              <p className="text-sm leading-relaxed text-fg">{t.request}</p>
              <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                {(
                  [
                    [tr("Audience"), t.contract.audience],
                    [tr("Tone"), t.params.tone],
                    [tr("Language"), t.params.language],
                    [tr("Detail"), t.params.detail],
                    [tr("Objective"), t.params.objective],
                    [tr("Style"), t.params.style],
                    [tr("Classification"), t.params.classification],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="flex gap-1.5">
                    <dt className="text-muted">{k}</dt>
                    <dd className="font-semibold text-fg">{tr(v)}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {t.sources.map((s) => (
                  <SourceCard key={s.id} tid={t.id} s={s} />
                ))}
              </div>
            </UserTurn>

            <AgentTurn ts={planMsg?.ts ?? t.created_at}>
              <p className="text-sm leading-relaxed text-fg">
                {planMsg ? tr(planMsg.text) : tr("Analysing the request and the sources. Here is my plan:")}
              </p>
              <AgentPlan plan={t.plan} />
              {failed ? <FailureCard t={t} refresh={refresh} /> : <AgentGrid tasks={t.tasks} tid={t.id} />}
              {!failed && (
                <>
                  <Attention t={t} busy={busy} refresh={refresh} />
                  <p className="text-sm leading-relaxed text-fg">
                    {(firstResult && resultSummary(t)) ??
                      (t.claims.length
                        ? tr("Artefacts appear below as each specialist agent finishes. Every one is verified and security-scanned the moment it lands.")
                        : tr("Building the evidence base first — no artefact is written until every fact has been extracted and checked."))}
                  </p>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(196px,1fr))] gap-3">
                    {arts.map((a) => (
                      <ArtifactCard key={a.type} tid={t.id} a={a} />
                    ))}
                  </div>
                </>
              )}
            </AgentTurn>

            {followUps.map((m, i) =>
              m.role === "user" ? (
                <UserTurn key={i} name={m.author} ts={m.ts}>
                  <p className="text-sm text-fg">{m.text}</p>
                </UserTurn>
              ) : (
                <AgentTurn key={i} ts={m.ts}>
                  <p className="text-sm leading-relaxed text-fg">{m.kind === "result" ? resultSummary(t) : tr(m.text)}</p>
                </AgentTurn>
              ),
            )}

            {!failed && (
              <section id="review" className="scroll-mt-4 pt-2">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                  <Tabs<Tab>
                    value={tab}
                    onChange={(v) => setSp((p) => (p.set("tab", v), p), { replace: true })}
                    tabs={[
                      { id: "evidence", label: <><FileSearch size={13} /> {tr("Evidence")}{openSC ? <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-warning" aria-label={tr("needs attention")} /> : null}</>, count: t.claims.length },
                      { id: "verification", label: <><CheckCircle2 size={13} /> {tr("Verification")}{issues ? <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-warning" aria-label={tr("needs attention")} /> : null}</> },
                      { id: "security", label: <><ShieldCheck size={13} /> {tr("Security")}{t.security.injections.length ? <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-warning" aria-label={tr("needs attention")} /> : null}</> },
                      { id: "provenance", label: <><Fingerprint size={13} /> {tr("Provenance")}</> },
                    ]}
                  />
                  <span className="text-2xs text-subtle">
                    {tr("Claims {n} · Red team {rt} · Consistency {cs}", { n: t.claims.length, rt: tr(t.red_team.status), cs: tr(t.consistency.status) })}
                  </span>
                </div>
                {tab === "evidence" && <EvidencePanel t={t} />}
                {tab === "verification" && <VerificationPanel t={t} />}
                {tab === "security" && <SecurityPanel t={t} />}
                {tab === "provenance" && <ProvenancePanel t={t} />}
              </section>
            )}
          </div>
        </div>
        {!failed && <FollowUp t={t} busy={busy || isBusy(t)} refresh={refresh} />}
      </div>

      {panelOpen && <aside className="hidden w-[340px] shrink-0 border-l border-border xl:block">{panel}</aside>}
      {mobilePanel && (
        <div className="fixed inset-0 z-50 xl:hidden" role="dialog" aria-modal="true" aria-label={tr("Generation tasks")}>
          <div className="absolute inset-0 bg-[var(--overlay)]" onClick={() => setMobilePanel(false)} />
          <aside className={cx("animate-slide-in absolute inset-y-0 right-0 w-[340px] max-w-[92vw] border-l border-border shadow-lg")}>{panel}</aside>
        </div>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={tr("Delete transformation?")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {tr("Cancel")}
            </Button>
            <Button variant="danger" loading={del.pending} onClick={() => void del.run()}>
              {tr("Delete {id}", { id: t.id })}
            </Button>
          </>
        }
      >
        <p className="text-xs text-muted">
          {tr("Sources, evidence and artefacts of {id} are removed from this workspace. Audit and provenance ledger entries are append-only and remain.", { id: t.id })}
        </p>
      </Modal>
    </div>
  );
}

export function WorkspacePage() {
  const { tid } = useParams();
  return tid ? <ExistingTransformation key={tid} id={tid} /> : (
    <div className="h-full overflow-y-auto">
      <NewTransformation />
    </div>
  );
}
