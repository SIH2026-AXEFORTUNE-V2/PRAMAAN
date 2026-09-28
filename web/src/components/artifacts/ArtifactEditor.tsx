import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { prettyPath, setPath, stringFields } from "@/lib/content";
import type { Artifact, Transformation } from "@/lib/types";
import { useAction } from "@/hooks/useAction";
import { useApp } from "@/store/app";
import { Button } from "../ui/Button";
import { TextArea, TextInput } from "../ui/misc";

/** Field-level editor. Saving creates a new version authored by the operator and re-runs verification. */
export function ArtifactEditor({ t, a, onClose }: { t: Transformation; a: Artifact; onClose: () => void }) {
  const fields = useMemo(() => stringFields(a.content ?? {}), [a.content]);
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.path, f.value])));
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const setT = useApp((s) => s.setTransformation);
  const toast = useApp((s) => s.toast);
  const { run, pending } = useAction(api.edit, { errorTitle: "Could not save edit" });
  const changed = fields.filter((f) => draft[f.path] !== f.value);
  const shown = fields.filter((f) => !q || `${f.path} ${draft[f.path]}`.toLowerCase().includes(q.toLowerCase()));

  const save = async () => {
    let content = a.content!;
    changed.forEach((f) => (content = setPath(content, f.path, draft[f.path])));
    const r = await run(t.id, a.type, content, note || `Edited ${changed.length} field(s)`);
    if (r) {
      setT(r);
      const na = r.artifacts[a.type];
      const issues = na?.verification ? na.verification.counts.drift + na.verification.counts.unsupported + na.verification.counts.uncertainty : 0;
      toast({
        tone: issues ? "warning" : "success",
        title: `Saved as v${na?.version}`,
        body: issues ? `Verification found ${issues} issue(s) in your edit.` : "Re-verified against the evidence ledger.",
      });
      onClose();
    }
  };

  return (
    <div className="rounded-xl border border-accent-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <p className="flex-1 text-xs font-semibold">Edit {a.label}</p>
        <TextInput className="h-8 max-w-56" placeholder="Filter fields…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter fields" />
      </div>
      <div className="max-h-[60vh] space-y-3 overflow-y-auto px-4 py-3">
        {shown.map((f) => (
          <label key={f.path} className="block">
            <span className="text-2xs text-muted capitalize">{prettyPath(f.path)}</span>
            <TextArea
              rows={Math.min(6, Math.max(1, Math.ceil((draft[f.path]?.length ?? 0) / 90)))}
              value={draft[f.path] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [f.path]: e.target.value }))}
              className={draft[f.path] !== f.value ? "mt-1 border-accent" : "mt-1"}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
        <TextInput className="h-8 flex-1" placeholder="Edit note (recorded in version history)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Edit note" />
        <span className="text-2xs text-subtle">{changed.length} changed</span>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" disabled={!changed.length} loading={pending} onClick={() => void save()}>
          Save & re-verify
        </Button>
      </div>
    </div>
  );
}
