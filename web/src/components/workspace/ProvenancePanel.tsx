import { useEffect, useState } from "react";
import { ArrowDown, ChevronDown, Fingerprint, Link2, ShieldCheck, ShieldX } from "lucide-react";
import { api } from "@/lib/api";
import { cx, dateTime } from "@/lib/format";
import { OUTPUT_ORDER, OutputIcon } from "@/lib/outputs";
import type { LedgerEntry, Transformation } from "@/lib/types";
import { Badge } from "../ui/Badge";
import { Card, CardHeader } from "../ui/Card";
import { Hash } from "../ui/misc";

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
            <Link2 size={15} className="text-accent" /> Verifiable lineage
          </p>
          <div className="space-y-1.5">
            <ChainNode label="Source hash" sub={t.sources.map((s) => s.name).join(", ")}>
              {Object.entries(t.provenance.source_hashes).map(([k, h]) => (
                <span key={k} className="inline-flex items-center gap-1 text-2xs text-muted">
                  {k} <Hash value={h} />
                </span>
              ))}
            </ChainNode>
            <ArrowDown size={14} className="mx-auto text-subtle" />
            <ChainNode label="Evidence state hash" sub={`${t.claims.length} claims`}>
              <Hash value={t.provenance.evidence_hash} n={16} />
            </ChainNode>
            <ArrowDown size={14} className="mx-auto text-subtle" />
            <ChainNode label="Transformation" sub={`Contract v${t.contract.version}`}>
              <span className="font-semibold">{t.id}</span>
              <Hash value={t.provenance.contract_hash} label="Contract hash" />
            </ChainNode>
            <ArrowDown size={14} className="mx-auto text-subtle" />
            <ChainNode label="Output hashes">
              <span className="text-2xs text-muted">{arts.length} artefacts · see table</span>
            </ChainNode>
            <ArrowDown size={14} className="mx-auto text-subtle" />
            <ChainNode label="Approval events">
              <span className="text-2xs text-muted">
                {arts.filter((a) => a.approval.status === "approved").length} approved · {arts.filter((a) => a.approval.status === "rejected").length} rejected
              </span>
            </ChainNode>
          </div>
        </Card>
        <Card>
          <CardHeader
            icon={<Fingerprint size={16} />}
            title="Output provenance"
            subtitle="Current version of each artefact, its hash and the approval it carries."
            actions={
              <button type="button" onClick={() => setShowContract((s) => !s)} className="text-2xs font-semibold text-accent hover:underline">
                {showContract ? "Hide" : "View"} contract
              </button>
            }
          />
          {showContract && <pre className="max-h-72 overflow-auto border-b border-border bg-surface-2 p-4 text-2xs text-muted">{JSON.stringify(t.contract, null, 2)}</pre>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="border-b border-border text-left text-2xs text-subtle">
                  <th className="px-4 py-2 font-semibold">Artefact</th>
                  <th className="px-2 py-2 font-semibold">Version</th>
                  <th className="px-2 py-2 font-semibold">Agent · model</th>
                  <th className="px-2 py-2 font-semibold">Output hash</th>
                  <th className="px-2 py-2 font-semibold">Approval</th>
                </tr>
              </thead>
              <tbody>
                {arts.map((a) => {
                  const last = a.versions[a.versions.length - 1];
                  return (
                    <tr key={a.type} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-2 font-medium">
                          <OutputIcon type={a.type} size={14} /> {a.label}
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
                            Approved · {a.approval.by} · #{a.approval.ledger_index}
                          </Badge>
                        ) : a.approval.status === "rejected" ? (
                          <Badge tone="danger">Rejected</Badge>
                        ) : (
                          <Badge tone="warning">Pending</Badge>
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
          title="Ledger entries for this transformation"
          subtitle={ledger?.note}
          actions={
            v && (
              <Badge tone={v.valid ? "success" : "danger"}>
                {v.valid ? <ShieldCheck size={12} /> : <ShieldX size={12} />} Chain {v.valid ? "valid" : `broken at #${v.broken_at}`} · {v.entries} entries
              </Badge>
            )
          }
        />
        {ledger ? <LedgerList entries={ledger.entries} /> : <p className="px-4 py-6 text-center text-2xs text-subtle">Loading ledger…</p>}
      </Card>
    </div>
  );
}
