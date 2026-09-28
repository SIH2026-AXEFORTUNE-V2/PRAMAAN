import { useState } from "react";
import { ChevronDown, ScanText } from "lucide-react";
import { Badge, ToneIcon } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { bytes, cx, dateTime } from "@/lib/format";
import type { Artifact } from "@/lib/types";
import { tr } from "@/i18n";

/** The designed infographic next to its read-back result: what the vision model found in the image vs. the verified text. */
export function InfographicDesign({ tid, a }: { tid: string; a: Artifact }) {
  const [open, setOpen] = useState(false);
  const d = a.design;
  if (!d) return null;
  const rb = d.readback;
  const stale = d.artifact_version !== a.version;
  const issues = rb.missing.length + rb.unexpected_numbers.length;
  const tone = stale ? "warning" : rb.status === "passed" ? "success" : rb.status === "issues" ? "danger" : "neutral";
  const src = api.designUrl(tid, d.sha256);

  return (
    <section className="mx-auto mb-4 max-w-[860px] rounded-xl bg-surface ring-1 ring-border" aria-label={tr("Designed infographic")}>
      <div className="grid gap-5 p-4 sm:grid-cols-[minmax(0,300px)_1fr] sm:p-5">
        <a href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg ring-1 ring-border">
          <img src={src} alt={tr("Designed infographic")} className="block h-auto w-full" loading="lazy" />
        </a>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-fg">{tr("Designed infographic")}</h2>
          <p className="mt-1 text-sm text-muted">
            {tr("Drawn by {model} from the released text only. A vision model then read the image back, and every line and figure was checked against the verified content.", { model: d.model })}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={tone}>
              <ToneIcon tone={tone} />
              {stale
                ? tr("Drawn from v{n}; re-render for v{m}", { n: d.artifact_version, m: a.version })
                : rb.status === "passed"
                  ? tr("Read-back verified · {n} lines", { n: rb.checked_lines })
                  : rb.status === "issues"
                    ? tr("Read-back found {n} mismatch(es)", { n: issues })
                    : tr("Read-back unavailable")}
            </Badge>
            {d.attempts > 1 && <Badge>{tr("{n} attempts", { n: d.attempts })}</Badge>}
          </div>
          {rb.status === "issues" && !stale && (
            <ul className="mt-3 space-y-1.5 text-sm">
              {rb.missing.map((m) => (
                <li key={m.role + m.expected} className="text-fg">
                  <span className="text-muted">{m.role}:</span> “{m.expected}” <span className="text-danger">{tr("not rendered correctly")}</span>
                </li>
              ))}
              {rb.unexpected_numbers.map((n) => (
                <li key={n} className="text-fg">
                  <span className="font-mono">{n}</span> <span className="text-danger">{tr("appears in the image but not in the verified content")}</span>
                </li>
              ))}
              <li className="text-xs text-muted">{tr("Export of the design is blocked until a re-render passes. The structured infographic is unaffected.")}</li>
            </ul>
          )}
          <p className="mt-3 text-xs text-subtle">
            {dateTime(d.created_at)} · {bytes(d.bytes)} · SHA-256 <span className="font-mono">{d.sha256.slice(0, 12)}…</span>
          </p>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
          >
            <ScanText size={13} aria-hidden />
            {tr("Prompt and read-back transcript")}
            <ChevronDown size={13} className={cx("transition-transform", open && "rotate-180")} aria-hidden />
          </button>
          {open && (
            <div className="mt-2 grid gap-3 text-xs">
              <div>
                <p className="mb-1 font-semibold text-fg">{tr("Sent to the image model")}</p>
                <pre className="max-h-56 overflow-auto rounded-lg bg-surface-2 p-3 whitespace-pre-wrap text-muted">{d.prompt}</pre>
              </div>
              {rb.transcript && (
                <div>
                  <p className="mb-1 font-semibold text-fg">{tr("Read back by {model}", { model: rb.model ?? "" })}</p>
                  <pre className="max-h-56 overflow-auto rounded-lg bg-surface-2 p-3 whitespace-pre-wrap text-muted">{rb.transcript}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
