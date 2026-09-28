import { useState } from "react";
import { Check, CircleDashed, X } from "lucide-react";
import { api } from "@/lib/api";
import { cx, dateTime } from "@/lib/format";
import type { Artifact, Transformation } from "@/lib/types";
import { useAction } from "@/hooks/useAction";
import { useApp } from "@/store/app";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { TextArea } from "../ui/misc";
import { tr } from "@/i18n";

function Gate({ label, state, detail }: { label: string; state: "pass" | "fail" | "pending"; detail?: string }) {
  return (
    <li className="flex items-center gap-2.5 py-1.5">
      {state === "pass" ? (
        <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-success text-surface">
          <Check size={11} strokeWidth={3} />
        </span>
      ) : state === "fail" ? (
        <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-danger text-surface">
          <X size={11} strokeWidth={3} />
        </span>
      ) : (
        <CircleDashed size={18} className="text-warning" />
      )}
      <span className="flex-1 text-xs text-fg">{label}</span>
      <span className={cx("text-2xs font-semibold", state === "pass" ? "text-success" : state === "fail" ? "text-danger" : "text-warning")}>
        {detail ?? (state === "pass" ? tr("Passed") : state === "fail" ? tr("Failed") : tr("Pending"))}
      </span>
    </li>
  );
}

/** Human approval gate: Generated → Verified → Security checked → Human review → Approved/Rejected → Provenance → Export. */
export function ApprovalPanel({ t, a, busy }: { t: Transformation; a: Artifact; busy: boolean }) {
  const [comment, setComment] = useState("");
  const setT = useApp((s) => s.setTransformation);
  const { run, pending } = useAction(api.decide, { errorTitle: tr("Decision not recorded") });
  const ver = a.verification;
  const verFail = !!ver && ver.counts.drift + ver.counts.unsupported + ver.counts.uncertainty > 0;
  const consistency = t.consistency.conflicts.some((c) => c.affected.includes(a.type));
  const sec = a.security;
  const decided = a.approval.status;
  const canApprove = !!a.content && !a.stale && !sec?.blocked && a.red_team?.status === "passed";

  const decide = async (d: "approve" | "reject" | "request_changes") => {
    const r = await run(t.id, a.type, d, comment);
    if (r) {
      setT(r);
      setComment("");
    }
  };

  return (
    <section className="rounded-xl border border-border bg-surface" aria-label={tr("Human approval")}>
      <div className={cx("flex items-center gap-2 rounded-t-xl border-b border-border px-4 py-2.5", decided === "approved" ? "bg-success-soft" : decided === "rejected" ? "bg-danger-soft" : "bg-warning-soft")}>
        <p className="flex-1 text-2xs font-bold">
          {decided === "approved" ? tr("Approved") : decided === "rejected" ? tr("Rejected") : decided === "changes_requested" ? tr("Changes requested") : tr("Review required")}
        </p>
        <span className="text-2xs text-muted">v{a.version}</span>
      </div>
      <ul className="px-4 py-2">
        <Gate label={tr("Verification")} state={!ver ? "pending" : verFail ? "fail" : "pass"} detail={ver && ver.counts.review && !verFail ? `${ver.counts.review} to review` : undefined} />
        <Gate label={tr("Security")} state={!sec ? "pending" : sec.blocked ? "fail" : "pass"} detail={sec?.review_required && !sec.blocked ? tr("Reviewer check") : undefined} />
        <Gate label={tr("Consistency")} state={t.consistency.status === "pending" ? "pending" : consistency ? "fail" : "pass"} />
        <Gate label={tr("Evidence current")} state={a.stale ? "fail" : "pass"} detail={a.stale ? tr("Evidence changed") : tr("Up to date")} />
        <Gate
          label={tr("Human approval")}
          state={decided === "approved" ? "pass" : decided === "rejected" ? "fail" : "pending"}
          detail={decided === "approved" ? `${a.approval.by}` : decided === "pending" ? tr("Pending") : decided.replace("_", " ")}
        />
      </ul>
      {decided === "approved" || decided === "rejected" ? (
        <div className="border-t border-border px-4 py-3 text-2xs text-muted">
          {a.approval.by} · {dateTime(a.approval.at)}
          {a.approval.comment && <span className="block text-fg">“{a.approval.comment}”</span>}
          {a.approval.ledger_index !== undefined && <span className="block">Provenance ledger entry #{a.approval.ledger_index}</span>}
          <p className="mt-1.5">{tr("A new version (edit or regeneration) resets approval.")}</p>
        </div>
      ) : (
        <div className="space-y-2 border-t border-border px-4 py-3">
          <TextArea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={tr("Comment (required to request changes or reject)")} aria-label={tr("Review comment")} />
          {!canApprove && a.content && (
            <p className="text-2xs text-danger">
              {a.stale ? tr("Regenerate against the updated evidence first.") : sec?.blocked ? tr("Security policy blocks release on this channel.") : tr("Resolve verification issues before approval.")}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Button variant="primary" size="sm" icon={<Check size={13} />} disabled={!canApprove || busy} loading={pending} onClick={() => void decide("approve")}>
              {tr("Approve")}
            </Button>
            <Button size="sm" disabled={!comment.trim() || busy || !a.content} onClick={() => void decide("request_changes")} title={tr("Regenerates this artefact with your comment as the instruction")}>
              {tr("Request changes")}
            </Button>
            <Button size="sm" variant="danger" disabled={!comment.trim() || busy || !a.content} onClick={() => void decide("reject")}>
              {tr("Reject")}
            </Button>
          </div>
        </div>
      )}
      {a.approval.history.length > 0 && (
        <details className="border-t border-border px-4 py-2 text-2xs text-muted">
          <summary className="cursor-pointer">{tr("Decision history ({n})", { n: a.approval.history.length })}</summary>
          <ul className="mt-1 space-y-0.5">
            {a.approval.history.map((h, i) => (
              <li key={i}>
                <Badge tone="neutral">{h.status}</Badge> {h.by ?? "—"} · {dateTime(h.at)} {h.comment && `· “${h.comment}”`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
