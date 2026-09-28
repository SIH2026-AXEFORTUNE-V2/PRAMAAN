import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Files } from "lucide-react";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { OUTPUT_SHORT, OutputIcon } from "@/lib/outputs";
import { ARTIFACT_STATUS } from "@/lib/status";
import { useFetch } from "@/hooks/useFetch";
import { Page } from "@/components/shell/AppShell";
import { Badge, ToneIcon } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Menu";
import { EmptyState, Hash, Skeleton, TextInput } from "@/components/ui/misc";
import { msg, tr } from "@/i18n";

const label = (v: string) => tr(v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " "));
// status names shown in the filter (extracted for translation)
msg("Pending"); msg("Approved"); msg("Rejected"); msg("Changes requested");
const APPROVAL = [msg("All approvals"), "pending", "approved", "rejected", "changes_requested"];

export function ArtifactsPage() {
  const { data, loading, error } = useFetch(api.artifacts);
  const [q, setQ] = useState("");
  const [type, setType] = useState(msg("All types"));
  const [appr, setAppr] = useState(APPROVAL[0]);
  const types = [msg("All types"), ...Object.values(OUTPUT_SHORT)];
  const rows = useMemo(
    () =>
      (data ?? []).filter(
        (r) =>
          (type === tr("All types") || OUTPUT_SHORT[r.type] === type) &&
          (appr === APPROVAL[0] || r.approval === appr) &&
          (!q || `${r.transformation_id} ${r.transformation_title} ${r.label}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [data, q, type, appr],
  );

  return (
    <Page title={tr("Artifacts")} subtitle={tr("Every artefact across transformations, with verification and approval state.")}>
      <div className="mb-3 flex flex-wrap gap-2">
        <TextInput className="max-w-72" placeholder={tr("Search by transformation or title…")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tr("Search artefacts")} />
        <Select variant="field" label={tr("Type")} value={type} options={types} display={(v) => tr(v)} onChange={setType} className="w-48" />
        <Select variant="field" label={tr("Approval")} value={appr} options={APPROVAL} display={label} onChange={setAppr} className="w-48" />
      </div>
      <Card>
        {loading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <EmptyState title={tr("Could not load artefacts")} body={error} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Files size={20} />}
            title={data?.length ? tr("No artefacts match these filters") : tr("No artefacts yet")}
            body={data?.length ? undefined : tr("Artefacts appear here after your first transformation.")}
            action={!data?.length && <Link to="/workspace" className="text-xs font-semibold text-accent hover:underline">{tr("Start a transformation")}</Link>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-xs">
              <thead>
                <tr className="border-b border-border text-left text-2xs text-subtle">
                  <th className="px-4 py-2.5 font-semibold">{tr("Artefact")}</th>
                  <th className="px-2 py-2.5 font-semibold">{tr("Transformation")}</th>
                  <th className="px-2 py-2.5 font-semibold">{tr("Status")}</th>
                  <th className="px-2 py-2.5 font-semibold">{tr("Verification")}</th>
                  <th className="px-2 py-2.5 font-semibold">{tr("Approval")}</th>
                  <th className="px-2 py-2.5 font-semibold">{tr("Output hash")}</th>
                  <th className="px-2 py-2.5 font-semibold">{tr("Updated")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = ARTIFACT_STATUS[r.status];
                  const bad = r.counts ? r.counts.drift + r.counts.unsupported + r.counts.uncertainty : 0;
                  return (
                    <tr key={r.transformation_id + r.type} className="border-b border-border last:border-0 hover:bg-surface-2">
                      <td className="px-4 py-2.5">
                        <Link to={`/workspace/${r.transformation_id}/artifact/${r.type}`} className="inline-flex items-center gap-2 font-semibold hover:text-accent">
                          <span className="text-accent">
                            <OutputIcon type={r.type} size={15} />
                          </span>
                          {tr(r.label)} <span className="font-normal text-subtle">v{r.version}</span>
                        </Link>
                      </td>
                      <td className="max-w-[260px] px-2 py-2.5">
                        <Link to={`/workspace/${r.transformation_id}`} className="block truncate text-muted hover:text-fg" title={r.transformation_title}>
                          {r.transformation_id} · {r.transformation_title}
                        </Link>
                      </td>
                      <td className="px-2 py-2.5">
                        <Badge tone={st.tone} dot>
                          {st.label}
                        </Badge>
                      </td>
                      <td className="px-2 py-2.5">
                        {r.counts ? (
                          bad ? <Badge tone="danger"><ToneIcon tone="danger" /> {bad} issues</Badge> : r.counts.review ? <Badge tone="warning"><ToneIcon tone="warning" /> {r.counts.review} to review</Badge> : <Badge tone="success"><ToneIcon tone="success" /> {r.counts.grounded} grounded</Badge>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-muted">
                        {r.approval === "approved" ? <span className="text-success">Approved · {r.approved_by}</span> : r.approval.replace("_", " ")}
                      </td>
                      <td className="px-2 py-2.5">
                        <Hash value={r.output_hash} n={8} />
                      </td>
                      <td className="px-2 py-2.5 text-muted">{dateTime(r.updated_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Page>
  );
}
