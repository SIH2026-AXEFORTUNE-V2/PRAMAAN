import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, ChevronLeft, ChevronRight, ShieldCheck, ShieldX, User, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { cx, dateTime, timeSec } from "@/lib/format";
import type { AuditEvent } from "@/lib/types";
import { useFetch } from "@/hooks/useFetch";
import { Page } from "@/components/shell/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Menu";
import { EmptyState, Skeleton, Tabs, TextInput } from "@/components/ui/misc";
import { LedgerList } from "@/components/workspace/ProvenancePanel";

const STATUS = ["All statuses", "success", "warning", "failed"];
const ACTORS = ["All actors", "user", "agent", "system"];

function ActorIcon({ e }: { e: AuditEvent }) {
  const I = e.actor_type === "user" ? User : e.actor_type === "agent" ? Bot : Wrench;
  return <I size={13} className="text-muted" />;
}

function AuditTable() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState(STATUS[0]);
  const [actor, setActor] = useState(ACTORS[0]);
  const size = 50;
  useEffect(() => {
    const h = window.setTimeout(() => setDebounced(q), 250);
    return () => window.clearTimeout(h);
  }, [q]);
  useEffect(() => setPage(1), [debounced, status, actor]);
  const { data, loading, error } = useFetch(
    () => api.audit({ page, size, q: debounced, status: status === STATUS[0] ? "" : status, actor_type: actor === ACTORS[0] ? "" : actor }),
    [page, debounced, status, actor],
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / size)) : 1;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <TextInput className="max-w-72" placeholder="Search action, object, actor, TR-id…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search audit log" />
        <Select variant="field" label="Status" value={status} options={STATUS} onChange={setStatus} className="w-40" />
        <Select variant="field" label="Actor" value={actor} options={ACTORS} onChange={setActor} className="w-40" />
        <span className="ml-auto text-2xs text-subtle">{data ? `${data.total.toLocaleString()} events` : ""}</span>
      </div>
      {loading && !data ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : error ? (
        <EmptyState title="Could not load audit log" body={error} />
      ) : !data?.items.length ? (
        <EmptyState title="No events" body="Events are recorded for every upload, agent action, security decision, approval and export." />
      ) : (
        <div className="overflow-x-auto">
          <table className={cx("w-full min-w-[980px] text-xs", loading && "opacity-60")}>
            <thead>
              <tr className="border-b border-border text-left text-2xs text-subtle">
                <th className="px-4 py-2 font-semibold">Timestamp</th>
                <th className="px-2 py-2 font-semibold">Actor</th>
                <th className="px-2 py-2 font-semibold">Action</th>
                <th className="px-2 py-2 font-semibold">Object</th>
                <th className="px-2 py-2 font-semibold">Status</th>
                <th className="px-2 py-2 font-semibold">Transformation</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id} className="border-b border-border align-top last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-2 whitespace-nowrap text-muted tabular-nums" title={e.ts}>
                    <span className="block text-fg">{timeSec(e.ts)}</span>
                    <span className="text-2xs">{dateTime(e.ts).split(",")[0]}</span>
                  </td>
                  <td className="px-2 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <ActorIcon e={e} /> {e.actor}
                    </span>
                  </td>
                  <td className="max-w-[360px] px-2 py-2">
                    <span className="font-medium text-fg">{e.action}</span>
                    {e.detail && <span className="mt-0.5 block text-2xs text-muted">{e.detail}</span>}
                  </td>
                  <td className="max-w-[220px] truncate px-2 py-2 text-muted" title={e.object}>
                    {e.object}
                  </td>
                  <td className="px-2 py-2">
                    <Badge tone={e.status === "success" ? "success" : e.status === "warning" ? "warning" : e.status === "failed" ? "danger" : "neutral"}>{e.status}</Badge>
                  </td>
                  <td className="px-2 py-2">
                    {e.transformation_id ? (
                      <Link to={`/workspace/${e.transformation_id}`} className="font-semibold text-accent hover:underline">
                        {e.transformation_id}
                      </Link>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2.5 text-2xs text-muted">
        Page {page} of {pages}
        <Button size="xs" variant="ghost" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          <ChevronLeft size={14} />
        </Button>
        <Button size="xs" variant="ghost" aria-label="Next page" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
          <ChevronRight size={14} />
        </Button>
      </div>
    </Card>
  );
}

function Ledger() {
  const { data, loading } = useFetch(() => api.ledger(""), []);
  const v = data?.verification;
  return (
    <Card>
      <CardHeader
        title="Provenance ledger"
        subtitle={data?.note}
        actions={
          v && (
            <Badge tone={v.valid ? "success" : "danger"}>
              {v.valid ? <ShieldCheck size={12} /> : <ShieldX size={12} />} {v.valid ? "Chain valid" : `Broken at #${v.broken_at}`} · {v.entries} entries
            </Badge>
          )
        }
      />
      {v && (
        <p className="border-b border-border px-4 py-2 text-2xs text-muted">
          Head hash <code className="text-fg">{v.head}</code>
        </p>
      )}
      {loading ? <Skeleton className="m-4 h-24" /> : data?.entries.length ? <LedgerList entries={data.entries} /> : <EmptyState title="Ledger is empty" />}
    </Card>
  );
}

export function AuditPage() {
  const [tab, setTab] = useState<"events" | "ledger">("events");
  return (
    <Page title="Audit Logs" subtitle="Append-only record of every action by operators and agents. Source content is never written to the log.">
      <Tabs<"events" | "ledger">
        className="mb-3"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "events", label: "Audit events" },
          { id: "ledger", label: "Provenance ledger" },
        ]}
      />
      {tab === "events" ? <AuditTable /> : <Ledger />}
    </Page>
  );
}
