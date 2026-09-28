import { useEffect, useState } from "react";
import { ArrowDown, ChevronDown, Fingerprint, Link2, ShieldCheck, ShieldX } from "lucide-react";
import { api } from "@/lib/api";
import { cx, dateTime } from "@/lib/format";
import { OUTPUT_ORDER, OutputIcon } from "@/lib/outputs";
import type { LedgerEntry, Transformation } from "@/lib/types";
import { Badge } from "../ui/Badge";
import { Card, CardHeader } from "../ui/Card";
import { Hash } from "../ui/misc";
import { tr } from "@/i18n";

function ChainNode({ label, children, sub }: { label: string; children: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5">
      <p className="text-2xs font-bold text-subtle">{label}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">{children}</div>
      {sub && <p className="mt-0.5 text-2xs text-muted">{sub}</p>}
    </div>
  );
}

export function LedgerList({ entries }: { entries: LedgerEntry[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <ul className="divide-y divide-border">
      {entries.map((e) => (
        <li key={e.index}>
          <button type="button" onClick={() => setOpen(open === e.index ? null : e.index)} className="flex w-full items-center gap-3 px-4 py-2 text-left text-xs hover:bg-surface-2" aria-expanded={open === e.index}>
            <span className="w-10 shrink-0 text-subtle tabular-nums">#{e.index}</span>
            <span className="w-44 shrink-0 font-medium">{e.kind.replace(/_/g, " ")}</span>
            <span className="min-w-0 flex-1 truncate text-muted">
              {e.transformation_id} · {e.actor}
            </span>
            <span className="hidden text-2xs text-subtle sm:inline">{dateTime(e.ts)}</span>
            <code className="hidden text-2xs text-muted md:inline">{e.entry_hash.slice(0, 12)}…</code>
            <ChevronDown size={13} className={cx("text-subtle transition-transform", open === e.index && "rotate-180")} />
          </button>
          {open === e.index && (
            <div className="bg-surface-2 px-4 py-3">
              <div className="mb-2 grid gap-1 text-2xs sm:grid-cols-2">
                <span className="text-muted">
                  prev_hash <code className="text-fg break-all">{e.prev_hash}</code>
                </span>
                <span className="text-muted">
                  entry_hash <code className="text-fg break-all">{e.entry_hash}</code>
                </span>
              </div>
              <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-surface p-3 text-2xs text-muted">{JSON.stringify(e.payload, null, 2)}</pre>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ProvenancePanel({ t }: { t: Transformation }) {
  const [ledger, setLedger] = useState<Awaited<ReturnType<typeof api.ledger>> | null>(null);
  const [showContract, setShowContract] = useState(false);
  const entriesKey = t.provenance.ledger_entries.join(",");
  useEffect(() => {
    api.ledger(t.id).then(setLedger).catch(() => setLedger(null));
  }, [t.id, entriesKey]);
  const arts = OUTPUT_ORDER.map((o) => t.artifacts[o]).filter((a): a is NonNullable<typeof a> => !!a?.content);
  const v = ledger?.verification;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
        <Card className="p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold">
            <Link2 size={15} className="text-accent" /> {tr("Verifiable lineage")}
          </p>
          <div className="space-y-1.5">
            <ChainNode label={tr("Source hash")} sub={t.sources.map((s) => s.name).join(", ")}>
              {Object.entries(t.provenance.source_hashes).map(([k, h]) => (
                <span key={k} className="inline-flex items-center gap-1 text-2xs text-muted">
                  {k} <Hash value={h} />
                </span>
              ))}
            </ChainNode>
            <ArrowDown size={14} className="mx-auto text-subtle" />
            <ChainNode label={tr("Evidence state hash")} sub={`${t.claims.length} claims`}>
              <Hash value={t.provenance.evidence_hash} n={16} />
            </ChainNode>
            <ArrowDown size={14} className="mx-auto text-subtle" />
            <ChainNode label={tr("Transformation")} sub={tr("Contract v{n}", { n: t.contract.version })}>
              <span className="font-semibold">{t.id}</span>
              <Hash value={t.provenance.contract_hash} label={tr("Contract hash")} />
            </ChainNode>
            <ArrowDown size={14} className="mx-auto text-subtle" />
            <ChainNode label={tr("Output hashes")}>
              <span className="text-2xs text-muted">{arts.length} artefacts · see table</span>
            </ChainNode>
            <ArrowDown size={14} className="mx-auto text-subtle" />
            <ChainNode label={tr("Approval events")}>
              <span className="text-2xs text-muted">
                {arts.filter((a) => a.approval.status === "approved").length} approved · {arts.filter((a) => a.approval.status === "rejected").length} rejected
              </span>
            </ChainNode>
          </div>
        </Card>
        <Card>
          <CardHeader
            icon={<Fingerprint size={16} />}
            title={tr("Output provenance")}
            subtitle={tr("Current version of each artefact, its hash and the approval it carries.")}
            actions={
              <button type="button" onClick={() => setShowContract((s) => !s)} className="text-2xs font-semibold text-accent hover:underline">
                {showContract ? tr("Hide") : tr("View")} contract
              </button>
            }
          />
          {showContract && <pre className="max-h-72 overflow-auto border-b border-border bg-surface-2 p-4 text-2xs text-muted">{JSON.stringify(t.contract, null, 2)}</pre>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="border-b border-border text-left text-2xs text-subtle">
                  <th className="px-4 py-2 font-semibold">{tr("Artefact")}</th>
                  <th className="px-2 py-2 font-semibold">{tr("Version")}</th>
                  <th className="px-2 py-2 font-semibold">{tr("Agent · model")}</th>
                  <th className="px-2 py-2 font-semibold">{tr("Output hash")}</th>
                  <th className="px-2 py-2 font-semibold">{tr("Approval")}</th>
                </tr>
              </thead>
              <tbody>
                {arts.map((a) => {
                  const last = a.versions[a.versions.length - 1];
                  return (
                    <tr key={a.type} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-2 font-medium">
                          <OutputIcon type={a.type} size={14} /> {tr(a.label)}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-muted">v{a.version}</td>
                      <td className="max-w-[220px] truncate px-2 py-2.5 text-2xs text-muted" title={`${last?.author} · ${last?.model ?? "—"}`}>
                        {last?.author} · {last?.model?.split("/").pop() ?? "—"}
                      </td>
                      <td className="px-2 py-2.5">
                        <Hash value={a.output_hash} />
                      </td>
                      <td className="px-2 py-2.5">
                        {a.approval.status === "approved" ? (
                          <Badge tone="success">
                            {tr("Approved")} · {a.approval.by} · #{a.approval.ledger_index}
                          </Badge>
                        ) : a.approval.status === "rejected" ? (
                          <Badge tone="danger">{tr("Rejected")}</Badge>
                        ) : (
                          <Badge tone="warning">{tr("Pending")}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader
          title={tr("Ledger entries for this transformation")}
          subtitle={ledger?.note}
          actions={
            v && (
              <Badge tone={v.valid ? "success" : "danger"}>
                {v.valid ? <ShieldCheck size={12} /> : <ShieldX size={12} />} {v.valid ? tr("Chain valid") : tr("Chain broken at #{n}", { n: v.broken_at ?? "" })} · {tr("{n} entries", { n: v.entries })}
              </Badge>
            )
          }
        />
        {ledger ? <LedgerList entries={ledger.entries} /> : <p className="px-4 py-6 text-center text-2xs text-subtle">{tr("Loading ledger…")}</p>}
      </Card>
    </div>
  );
}
