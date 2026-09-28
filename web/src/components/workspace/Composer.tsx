import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, FileText, Link2, Paperclip, Type, X } from "lucide-react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { OUTPUT_ORDER, OUTPUT_SHORT, OutputIcon, parseOutputs } from "@/lib/outputs";
import type { DemoSource, OutputType } from "@/lib/types";
import { useAction } from "@/hooks/useAction";
import { useApp } from "@/store/app";
import { useDraft } from "@/store/draft";
import { Button } from "../ui/Button";
import { TextArea, TextInput } from "../ui/misc";
import { PendingSourceCard } from "./SourceCard";
import { tr } from "@/i18n";

const ACCEPT = ".pdf,.docx,.pptx,.txt,.md,.html,.htm,.csv,.json,image/*,audio/*,video/*";

export function OutputChips({ selected, onToggle, disabled }: { selected: OutputType[]; onToggle: (o: OutputType) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={tr("Requested outputs")}>
      {OUTPUT_ORDER.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onToggle(o)}
            className={cx(
              "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-2xs font-medium transition-colors",
              on ? "border-accent-line bg-accent-soft text-accent" : "border-border bg-surface text-muted hover:border-border-strong hover:text-fg",
            )}
          >
            <OutputIcon type={o} size={13} />
            {OUTPUT_SHORT[o]}
          </button>
        );
      })}
    </div>
  );
}

/** Source ingestion + request composer for a new transformation. */
export function Composer() {
  const d = useDraft();
  const config = useApp((s) => s.config);
  const refreshList = useApp((s) => s.refreshList);
  const setT = useApp((s) => s.setTransformation);
  const toast = useApp((s) => s.toast);
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"none" | "url" | "text">(d.url ? "url" : d.text ? "text" : "none");
  const [drag, setDrag] = useState(false);
  const [samples, setSamples] = useState<DemoSource[]>([]);
  const { run, pending } = useAction(api.create, { errorTitle: tr("Could not start the transformation") });

  useEffect(() => {
    api.samples().then(setSamples).catch(() => setSamples([]));
  }, []);

  const inferred = parseOutputs(d.request);
  const inferredKey = inferred.join(",");
  const outputs = d.outputs;
  useEffect(() => {
    // outputs named in the request are selected as they are typed; the user can still deselect them
    const cur = useDraft.getState().outputs;
    const add = inferredKey ? (inferredKey.split(",") as OutputType[]).filter((o) => !cur.includes(o)) : [];
    if (add.length) useDraft.getState().set({ outputs: [...cur, ...add] });
  }, [inferredKey]);
  const hasSource = d.files.length > 0 || d.text.trim().length > 2 || /^https?:\/\//i.test(d.url.trim());
  const maxMb = config?.max_upload_mb ?? 50;

  const addFiles = (list: FileList | File[]) => {
    const arr = Array.from(list);
    const tooBig = arr.filter((f) => f.size > maxMb * 1024 * 1024);
    if (tooBig.length) toast({ tone: "danger", title: tr("File too large"), body: tr("{files} exceeds {n} MB.", { files: tooBig.map((f) => f.name).join(", "), n: maxMb }) });
    d.addFiles(arr.filter((f) => f.size <= maxMb * 1024 * 1024));
  };

  const submit = async () => {
    if (!hasSource || outputs.length === 0 || pending) return;
    const t = await run({
      files: d.files,
      text: mode === "text" ? d.text : "",
      url: mode === "url" ? d.url : "",
      request: d.request.trim() || `Generate ${outputs.map((o) => OUTPUT_SHORT[o]).join(", ")} from the source.`,
      outputs,
      params: d.params,
    });
    if (t) {
      setT(t);
      d.reset();
      void refreshList();
      navigate(`/workspace/${t.id}`);
    }
  };

  const loadSample = async (s: DemoSource) => {
    try {
      addFiles([await api.sampleFile(s)]);
    } catch (e) {
      toast({ tone: "danger", title: tr("Demo source unavailable"), body: (e as Error).message });
    }
  };

  return (
    <div
      className={cx("rounded-2xl border bg-surface shadow-md transition-colors", drag ? "border-accent ring-4 ring-accent-soft" : "border-border")}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      }}
    >
      {(d.files.length > 0 || mode !== "none") && (
        <div className="space-y-2 border-b border-border p-3">
          {d.files.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {d.files.map((f) => (
                <PendingSourceCard key={f.name} file={f} onRemove={() => d.removeFile(f.name)} />
              ))}
            </div>
          )}
          {mode === "url" && (
            <div className="flex items-center gap-2">
              <Link2 size={15} className="shrink-0 text-subtle" />
              <TextInput aria-label={tr("Source URL")} placeholder={tr("https://… (article or PDF)")} value={d.url} onChange={(e) => d.set({ url: e.target.value })} />
              <button type="button" aria-label={tr("Remove URL")} onClick={() => (d.set({ url: "" }), setMode("none"))} className="rounded p-1 text-subtle hover:text-fg">
                <X size={15} />
              </button>
            </div>
          )}
          {mode === "text" && (
            <div className="relative">
              <TextArea
                aria-label={tr("Pasted source text")}
                rows={5}
                placeholder={tr("Paste the source content here…")}
                value={d.text}
                onChange={(e) => d.set({ text: e.target.value })}
              />
              <button type="button" aria-label={tr("Remove pasted text")} onClick={() => (d.set({ text: "" }), setMode("none"))} className="absolute top-2 right-2 rounded p-1 text-subtle hover:text-fg">
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      )}
      <div className="p-3">
        <TextArea
          aria-label={tr("Request")}
          rows={2}
          className="border-0 px-1 text-sm shadow-none focus:ring-0"
          placeholder={tr("Describe what to create, e.g. “Generate an executive summary, advisory, infographic and presentation from this report.”")}
          value={d.request}
          onChange={(e) => d.set({ request: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
          }}
        />
        <div className="mt-2">
          <OutputChips selected={outputs} onToggle={d.toggleOutput} />
          {inferred.length > 0 && <p className="mt-1.5 text-2xs text-subtle">Detected in your request: {inferred.map((o) => OUTPUT_SHORT[o]).join(", ")}</p>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} />
          <Button size="sm" variant="secondary" icon={<Paperclip size={14} />} onClick={() => fileRef.current?.click()}>
            {tr("Upload")}
          </Button>
          <Button size="sm" variant={mode === "url" ? "subtle" : "ghost"} icon={<Link2 size={14} />} onClick={() => setMode(mode === "url" ? "none" : "url")}>
            {tr("URL")}
          </Button>
          <Button size="sm" variant={mode === "text" ? "subtle" : "ghost"} icon={<Type size={14} />} onClick={() => setMode(mode === "text" ? "none" : "text")}>
            {tr("Paste text")}
          </Button>
          <div className="flex-1" />
          <span className="hidden text-2xs text-subtle sm:inline">{hasSource ? "⌘/Ctrl + Enter" : tr("Add a source to begin")}</span>
          <Button
            variant="primary"
            size="md"
            loading={pending}
            disabled={!hasSource || outputs.length === 0}
            icon={!pending && <ArrowUp size={15} />}
            onClick={() => void submit()}
            title={!hasSource ? tr("Add a source first") : outputs.length === 0 ? tr("Choose at least one output") : tr("Start transformation")}
          >
            {tr("Transform")}
          </Button>
        </div>
      </div>
      {samples.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-2 px-3 py-2 rounded-b-2xl">
          <span className="text-2xs text-subtle">{tr("Demo sources (fictional):")}</span>
          {samples.map((s) => (
            <button
              key={s.file}
              type="button"
              onClick={() => void loadSample(s)}
              title={s.description}
              disabled={d.files.some((f) => f.name === s.file)}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 text-2xs text-muted hover:border-accent hover:text-accent disabled:opacity-50"
            >
              <FileText size={12} />
              {s.file}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
