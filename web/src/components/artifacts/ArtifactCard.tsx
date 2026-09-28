import { Link, useNavigate } from "react-router-dom";
import { Download, FileSearch, Pencil, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { download } from "@/lib/download";
import { OutputIcon } from "@/lib/outputs";
import { ARTIFACT_STATUS } from "@/lib/status";
import type { Artifact } from "@/lib/types";
import { useApp } from "@/store/app";
import { Badge, ToneIcon } from "../ui/Badge";
import { Button, IconButton } from "../ui/Button";
import { MenuButton } from "../ui/Menu";
import { ArtifactThumb } from "./ArtifactThumb";
import { tr } from "@/i18n";

export function VerificationBadge({ a }: { a: Artifact }) {
  if (!a.verification) return null;
  const c = a.verification.counts;
  const bad = c.drift + c.unsupported + c.uncertainty;
  if (bad) return <Badge tone="danger"><ToneIcon tone="danger" /> {bad} issue{bad > 1 ? "s" : ""}</Badge>;
  if (c.review) return <Badge tone="warning"><ToneIcon tone="warning" /> {c.review} to review</Badge>;
  return <Badge tone="success"><ToneIcon tone="success" /> {c.grounded} grounded</Badge>;
}

export function useExport(tid: string, a: Artifact, onDone?: () => void) {
  const toast = useApp((s) => s.toast);
  const fetchT = useApp((s) => s.fetchTransformation);
  return async (fmt: string) => {
    try {
      await download(api.exportUrl(tid, a.type, fmt));
      toast({ tone: "success", title: tr("{label} exported", { label: tr(a.label) }), body: tr("{format} · released version with provenance footer.", { format: fmt.toUpperCase() }) });
      await fetchT(tid);
      onDone?.();
    } catch (e) {
      toast({ tone: "danger", title: tr("Export blocked"), body: (e as Error).message });
    }
  };
}

export function ExportMenu({ tid, a, size = "sm", iconOnly }: { tid: string; a: Artifact; size?: "xs" | "sm"; iconOnly?: boolean }) {
  const approved = a.approval.status === "approved";
  const run = useExport(tid, a);
  return (
    <MenuButton
      label={tr("Export formats")}
      trigger={(_, toggle) =>
        iconOnly ? (
          <IconButton label={approved ? tr("Export") : tr("Export (approval required)")} className="h-8 w-8" onClick={toggle} disabled={!a.content}>
            <Download size={15} />
          </IconButton>
        ) : (
        <Button
          size={size}
          icon={<Download size={13} />}
          onClick={toggle}
          disabled={!a.content}
          title={approved ? tr("Export the released version") : tr("Approval required before export")}
        >
          {tr("Export")}
        </Button>
        )
      }
      items={a.exports.map((f) => ({
        label: f.toUpperCase(),
        hint: approved ? undefined : "needs approval",
        disabled: !approved,
        onSelect: () => void run(f),
      }))}
    />
  );
}

export function ArtifactCard({ tid, a }: { tid: string; a: Artifact }) {
  const st = ARTIFACT_STATUS[a.status];
  const navigate = useNavigate();
  const base = `/workspace/${tid}/artifact/${a.type}`;
  const ready = !!a.content && a.status !== "generating" && a.status !== "queued";
  return (
    <article className="group flex flex-col rounded-xl bg-surface p-3.5 ring-1 ring-border transition-colors hover:ring-border-strong" aria-label={a.label}>
      <Link to={base} tabIndex={-1} aria-hidden>
        <ArtifactThumb tid={tid} a={a} />
      </Link>
      <Link to={base} className="mt-3 flex items-center gap-2 rounded-md">
        <span className="text-accent">
          <OutputIcon type={a.type} size={17} />
        </span>
        <h3 className="flex-1 truncate font-sans text-sm font-semibold tracking-normal">{tr(a.label)}</h3>
        {a.version > 0 && <span className="font-mono text-2xs text-subtle">v{a.version}</span>}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone={st.tone} dot>
          {st.label}
        </Badge>
        <VerificationBadge a={a} />
        {a.security && a.security.status !== "passed" && (
          <Badge tone={a.security.blocked ? "danger" : "warning"}>
            <ShieldCheck size={12} /> {a.security.blocked ? tr("Blocked") : tr("Review")}
          </Badge>
        )}
      </div>
      <div className="mt-auto flex items-center gap-1 pt-3.5">
        <Button size="sm" onClick={() => navigate(base)} disabled={!ready} className="flex-1">
          {tr("Open")}
        </Button>
        <IconButton label={tr("Evidence behind this artefact")} className="h-8 w-8" onClick={() => navigate(`${base}?panel=evidence`)} disabled={!ready}>
          <FileSearch size={16} />
        </IconButton>
        <IconButton label={tr("Edit")} className="h-8 w-8" onClick={() => navigate(`${base}?edit=1`)} disabled={!ready}>
          <Pencil size={15} />
        </IconButton>
        <ExportMenu tid={tid} a={a} size="sm" iconOnly />
      </div>
    </article>
  );
}
