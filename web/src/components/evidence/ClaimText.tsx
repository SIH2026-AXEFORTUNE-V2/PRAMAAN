import { createContext, useContext, type ReactNode } from "react";
import { cx } from "@/lib/format";
import { REF_STATUS } from "@/lib/status";
import type { ClaimRef, OutputType, SecurityFinding } from "@/lib/types";
import { useApp } from "@/store/app";

/** Context giving every text node in an artefact renderer access to its verification refs. */
export interface TraceContext {
  tid: string;
  artifact: OutputType;
  refsByPath: Map<string, ClaimRef[]>;
  findingsByPath: Map<string, SecurityFinding[]>;
  showClaims: boolean;
  showSecurity: boolean;
}

const Ctx = createContext<TraceContext | null>(null);
export const TraceProvider = Ctx.Provider;

function Marks({ text, base, findings, show }: { text: string; base: number; findings: SecurityFinding[]; show: boolean }) {
  if (!show || findings.length === 0) return <>{text}</>;
  const inRange = findings
    .filter((f) => f.span[0] >= base && f.span[1] <= base + text.length)
    .sort((a, b) => a.span[0] - b.span[0]);
  if (!inRange.length) return <>{text}</>;
  const out: ReactNode[] = [];
  let cur = 0;
  inRange.forEach((f, i) => {
    const a = f.span[0] - base;
    const b = f.span[1] - base;
    if (a < cur) return;
    out.push(text.slice(cur, a));
    out.push(
      <mark
        key={i}
        className={cx("sec-mark text-inherit", f.action === "BLOCK" && "sec-mark-block")}
        title={`${f.label} · ${f.action}${f.released_as ? ` → released as "${f.released_as}"` : ""}`}
      >
        {text.slice(a, b)}
      </mark>,
    );
    cur = b;
  });
  out.push(text.slice(cur));
  return <>{out}</>;
}

/** Renders one string field of an artefact with clickable, status-coloured factual sentences. */
export function T({ path, text, className }: { path: string; text: string | undefined | null; className?: string }) {
  const ctx = useContext(Ctx);
  const openClaim = useApp((s) => s.openClaim);
  const focus = useApp((s) => s.claimFocus);
  const value = text ?? "";
  if (!ctx || !value) return <span className={className}>{value}</span>;
  const refs = (ctx.refsByPath.get(path) ?? []).slice().sort((a, b) => a.offset - b.offset);
  const findings = ctx.findingsByPath.get(path) ?? [];
  if (!ctx.showClaims || refs.length === 0) {
    return (
      <span className={className}>
        <Marks text={value} base={0} findings={findings} show={ctx.showSecurity} />
      </span>
    );
  }
  const parts: ReactNode[] = [];
  let cur = 0;
  refs.forEach((r) => {
    const start = value.indexOf(r.sentence, Math.max(cur, r.offset - 2));
    if (start < 0) return;
    const end = start + r.sentence.length;
    if (start > cur) parts.push(<Marks key={`t${cur}`} text={value.slice(cur, start)} base={cur} findings={findings} show={ctx.showSecurity} />);
    const meta = REF_STATUS[r.status];
    const cls = r.status === "grounded" ? "claim-grounded" : r.status === "review" ? "claim-review" : "claim-bad";
    const cid = r.issues.find((i) => i.claim_id)?.claim_id ?? r.claim_ids[0];
    const pressed = focus?.refId === r.ref_id && focus.artifact === ctx.artifact;
    parts.push(
      <span
        key={r.ref_id}
        role="button"
        tabIndex={0}
        aria-pressed={pressed}
        className={cx("claim", cls)}
        title={`${meta.label}${r.claim_ids.length ? ` · ${r.claim_ids.join(", ")}` : ""} — click for evidence`}
        onClick={() => cid && openClaim({ tid: ctx.tid, claimId: cid, artifact: ctx.artifact, refId: r.ref_id })}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && cid) {
            e.preventDefault();
            openClaim({ tid: ctx.tid, claimId: cid, artifact: ctx.artifact, refId: r.ref_id });
          }
        }}
      >
        <Marks text={value.slice(start, end)} base={start} findings={findings} show={ctx.showSecurity} />
      </span>,
    );
    cur = end;
  });
  if (cur < value.length) parts.push(<Marks key="tail" text={value.slice(cur)} base={cur} findings={findings} show={ctx.showSecurity} />);
  return <span className={className}>{parts}</span>;
}

export function buildTrace(
  tid: string,
  artifact: OutputType,
  refs: ClaimRef[],
  findings: SecurityFinding[],
  showClaims: boolean,
  showSecurity: boolean,
): TraceContext {
  const refsByPath = new Map<string, ClaimRef[]>();
  refs.forEach((r) => refsByPath.set(r.path, [...(refsByPath.get(r.path) ?? []), r]));
  const findingsByPath = new Map<string, SecurityFinding[]>();
  findings.forEach((f) => f.path && findingsByPath.set(f.path, [...(findingsByPath.get(f.path) ?? []), f]));
  return { tid, artifact, refsByPath, findingsByPath, showClaims, showSecurity };
}
