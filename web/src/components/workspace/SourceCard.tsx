import { useState } from "react";
import { AlertCircle, CheckCircle2, Eye, FileAudio, FileImage, FileText, FileVideo, Globe, Loader2, X } from "lucide-react";
import { bytes, cx, fileExt, time } from "@/lib/format";
import type { SourceInfo } from "@/lib/types";
import { Hash } from "../ui/misc";
import { Modal } from "../ui/Overlay";
import { api } from "@/lib/api";

function kindIcon(name: string, kind?: string) {
  const ext = fileExt(name).toLowerCase();
  if (kind === "web") return <Globe size={18} />;
  if (kind === "image" || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return <FileImage size={18} />;
  if (kind === "audio" || ["mp3", "wav", "m4a", "ogg"].includes(ext)) return <FileAudio size={18} />;
  if (kind === "video" || ["mp4", "mov", "webm", "mkv"].includes(ext)) return <FileVideo size={18} />;
  return <FileText size={18} />;
}

const EXT_TONE: Record<string, string> = {
  PDF: "text-danger bg-danger-soft border-danger-line",
  DOCX: "text-accent bg-accent-soft border-accent-line",
  TXT: "text-muted bg-surface-3 border-border",
};

/** A local file waiting to be uploaded (composer). */
export function PendingSourceCard({ file, onRemove, onPreview }: { file: File; onRemove: () => void; onPreview?: () => void }) {
  const ext = fileExt(file.name);
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-sm">
      <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", EXT_TONE[ext] ?? "border-border bg-surface-2 text-muted")}>
        {kindIcon(file.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-fg" title={file.name}>
          {file.name}
        </p>
        <p className="text-2xs text-muted">
          {ext} · {bytes(file.size)} · Ready to upload
        </p>
      </div>
      {onPreview && (
        <button type="button" onClick={onPreview} aria-label={`Preview ${file.name}`} className="rounded-md p-1 text-subtle hover:bg-surface-3 hover:text-fg">
          <Eye size={15} />
        </button>
      )}
      <button type="button" onClick={onRemove} aria-label={`Remove ${file.name}`} className="rounded-md p-1 text-subtle hover:bg-surface-3 hover:text-fg">
        <X size={15} />
      </button>
    </div>
  );
}

/** A source already ingested by a transformation. */
export function SourceCard({ tid, s }: { tid: string; s: SourceInfo }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const ext = s.kind === "web" ? "URL" : s.kind === "text" ? "TEXT" : fileExt(s.name);
  const status =
    s.status === "parsed" ? (
      <span className="inline-flex items-center gap-1 text-success">
        <CheckCircle2 size={12} /> Parsed
      </span>
    ) : s.status === "failed" ? (
      <span className="inline-flex items-center gap-1 text-danger">
        <AlertCircle size={12} /> Failed
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-accent">
        <Loader2 size={12} className="animate-spin" /> Processing
      </span>
    );
  return (
    <>
      <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-sm">
        <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", EXT_TONE[ext] ?? "border-border bg-surface-2 text-muted")}>
          {kindIcon(s.name, s.kind)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-fg" title={s.name}>
            <span className="mr-1.5 text-subtle">{s.id}</span>
            {s.name}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 text-2xs text-muted">
            <span>{ext}</span>
            <span>{bytes(s.size_bytes)}</span>
            {s.page_count && <span>{s.page_count} pages</span>}
            <span>Uploaded {time(s.uploaded_at)}</span>
            {status}
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            setOpen(true);
            if (text === null) {
              try {
                const r = await api.sourceText(tid, s.id, 0, 20000);
                setText(r.text);
              } catch {
                setText("");
              }
            }
          }}
          aria-label={`Preview ${s.name}`}
          className="rounded-md p-1 text-subtle hover:bg-surface-3 hover:text-fg"
        >
          <Eye size={15} />
        </button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={s.name} width="max-w-3xl">
        <div className="mb-3 flex flex-wrap items-center gap-3 text-2xs text-muted">
          <span>SHA-256</span>
          <Hash value={s.sha256} n={24} label="Source hash" />
          <span>{s.words.toLocaleString()} words</span>
        </div>
        {s.notes.length > 0 && <p className="mb-3 text-2xs text-warning">{s.notes.join(" · ")}</p>}
        <p className="mb-2 text-2xs text-subtle">Extracted text · treated as untrusted data</p>
        <pre className="max-h-[60vh] overflow-auto rounded-lg border border-border bg-surface-2 p-3 text-xs leading-relaxed whitespace-pre-wrap text-muted">
          {text === null ? "Loading…" : text || "No text was extracted from this source."}
        </pre>
      </Modal>
    </>
  );
}
