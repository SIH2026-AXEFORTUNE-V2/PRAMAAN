import { Link } from "react-router-dom";
import { Bug, EyeOff, ShieldCheck } from "lucide-react";
import { cx } from "@/lib/format";
import { OUTPUT_ORDER, OutputIcon } from "@/lib/outputs";
import { ACTION_TONE, SECURITY_CLASS_LABEL } from "@/lib/status";
import type { PolicyAction, Transformation } from "@/lib/types";
import { Badge } from "../ui/Badge";
import { Card, CardHeader, SectionLabel } from "../ui/Card";
import { tr } from "@/i18n";

const ACTIONS: PolicyAction[] = ["ALLOW", "MASK", "REDACT", "RESTRICT", "REVIEW", "BLOCK"];

export function SecurityPanel({ t }: { t: Transformation }) {
  const s = t.security;
  const classes = Object.entries(s.summary).filter(([k]) => k !== "injection");
  const arts = OUTPUT_ORDER.map((o) => t.artifacts[o]).filter((a): a is NonNullable<typeof a> => !!a?.security);
  const unique = Array.from(new Map(s.source_findings.map((f) => [`${f.class}|${f.text}`, f])).values());

  return (
    <div className="space-y-4">
      {s.injections.map((i, n) => (
        <div key={n} className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3" role="alert">
          <div className="flex items-center gap-2">
            <Bug size={15} className="text-danger" />
            <p className="text-2xs font-bold text-danger">{tr("Prompt injection detected")}</p>
            <Badge tone="neutral">{tr("Ignored")}</Badge>
          </div>
          <p className="mt-1 text-xs text-fg">{tr("Source content attempted to modify AI instructions.")}</p>
          <blockquote className="mt-2 rounded-lg border border-danger-line bg-surface px-3 py-2 text-2xs text-muted italic">“{i.text}”</blockquote>
          <p className="mt-1.5 text-2xs text-muted">
            {i.source_name}
            {i.page ? ` · ${tr("page {n}", { n: i.page })}` : ""} · {tr("Action: ignored as untrusted source content and removed from model context. Claims are never built from this text.")}
          </p>
        </div>
      ))}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<ShieldCheck size={16} />} title={tr("Source security scan")} subtitle={tr("Run before any model call. Unique items per class.")} />
          <dl className="grid grid-cols-2 gap-px bg-border">
            {classes.map(([k, v]) => (
              <div key={k} className="bg-surface px-4 py-2.5">
                <dt className="text-2xs text-muted">{SECURITY_CLASS_LABEL[k]}</dt>
                <dd className={cx("text-lg font-bold tabular-nums", v ? (k === "credential" ? "text-danger" : "text-warning") : "text-fg")}>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="px-4 py-3">
            <SectionLabel>{tr("Model context protection")}</SectionLabel>
            {s.model_context_notes.length ? (
              <ul className="mt-1.5 space-y-1">
                {s.model_context_notes.map((n) => (
                  <li key={n} className="flex items-start gap-2 text-2xs text-muted">
                    <EyeOff size={12} className="mt-0.5 shrink-0 text-accent" /> {n}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-2xs text-subtle">{tr("Nothing needed withholding.")}</p>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title={tr("Detected in sources")} subtitle={tr("What the Security Agent found, with location.")} />
          <ul className="max-h-[300px] divide-y divide-border overflow-y-auto">
            {unique.length === 0 && <li className="px-4 py-6 text-center text-2xs text-subtle">{tr("No sensitive data detected.")}</li>}
            {unique.map((f, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2 text-xs">
                <span className="w-40 shrink-0 text-2xs text-muted">{tr(f.label)}</span>
                <code className="min-w-0 flex-1 truncate text-fg" title={f.text}>
                  {f.class === "credential" ? "••••••••" : f.text}
                </code>
                <span className="shrink-0 text-2xs text-subtle">{f.page ? `p.${f.page}` : f.source_id}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={tr("Context-aware release policy")}
          subtitle={tr("Source + audience + objective + classification decide what each artefact may release. Masking is applied to the released (exported) version.")}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-2xs text-subtle">
                <th className="px-4 py-2 font-semibold">{tr("Artefact")}</th>
                <th className="px-2 py-2 font-semibold">{tr("Exposure")}</th>
                {ACTIONS.map((a) => (
                  <th key={a} className="px-2 py-2 font-semibold">
                    {a}
                  </th>
                ))}
                <th className="px-2 py-2 font-semibold">{tr("Result")}</th>
              </tr>
            </thead>
            <tbody>
              {arts.map((a) => (
                <tr key={a.type} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    <Link to={`/workspace/${t.id}/artifact/${a.type}?security=1`} className="inline-flex items-center gap-2 font-medium hover:text-accent">
                      <OutputIcon type={a.type} size={14} /> {tr(a.label)}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5 text-muted">{tr(a.security!.exposure_label)}</td>
                  {ACTIONS.map((x) => {
                    const n = a.security!.actions[x];
                    return (
                      <td key={x} className="px-2 py-2.5 tabular-nums">
                        {n ? <Badge tone={ACTION_TONE[x]}>{n}</Badge> : <span className="text-border-strong">0</span>}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2.5">
                    <Badge tone={a.security!.blocked ? "danger" : a.security!.review_required ? "warning" : "success"}>
                      {a.security!.blocked ? tr("Blocked") : a.security!.review_required ? tr("Review") : tr("Passed")}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
