import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { api } from "@/lib/api";
import type { Claim } from "@/lib/types";
import { Skeleton } from "../ui/misc";
import { tr } from "@/i18n";

/** Shows where a claim lives in its source: the rendered PDF page with the evidence box, or the text context. */
export function SourceViewer({ tid, claim }: { tid: string; claim: Claim }) {
  const [imgOk, setImgOk] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [ctx, setCtx] = useState<{ before: string; hit: string; after: string } | null>(null);
  const loc = claim.location;
  const usePage = !!(loc && claim.page && imgOk);

  useEffect(() => {
    setLoaded(false);
    setImgOk(true);
  }, [claim.claim_id, claim.page]);

  useEffect(() => {
    if (usePage || !claim.char_span) return;
    const [a, b] = claim.char_span;
    const from = Math.max(0, a - 260);
    let alive = true;
    api
      .sourceText(tid, claim.source_id, from, b + 260)
      .then((r) => alive && setCtx({ before: r.text.slice(0, a - from), hit: r.text.slice(a - from, b - from), after: r.text.slice(b - from) }))
      .catch(() => alive && setCtx(null));
    return () => {
      alive = false;
    };
  }, [tid, claim.source_id, claim.char_span, usePage]);

  if (usePage && loc && claim.page) {
    const [x1, y1, x2, y2] = loc.bbox;
    const [w, h] = loc.page_size;
    const pad = 3;
    return (
      <figure className="overflow-hidden rounded-lg border border-border bg-surface-2">
        <div className="relative w-full" style={{ aspectRatio: `${w} / ${h}` }}>
          {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
          <img
            src={api.pageImageUrl(tid, claim.source_id, claim.page)}
            alt={tr("Page {page} of {name}", { page: claim.page ?? "", name: claim.source_name })}
            className="absolute inset-0 h-full w-full bg-white object-contain"
            onLoad={() => setLoaded(true)}
            onError={() => setImgOk(false)}
          />
          {loaded && (
            <div
              className="mark-swipe absolute"
              style={{
                left: `${((x1 - pad) / w) * 100}%`,
                top: `${((y1 - pad) / h) * 100}%`,
                width: `${((x2 - x1 + pad * 2) / w) * 100}%`,
                height: `${((y2 - y1 + pad * 2) / h) * 100}%`,
              }}
              aria-label={tr("Evidence location")}
            />
          )}
        </div>
        <figcaption className="flex items-center justify-between border-t border-border px-3 py-1.5 text-2xs text-muted">
          <span>
            Page {claim.page} · bbox [{loc.bbox.map((n) => Math.round(n)).join(", ")}]
          </span>
          <span>{tr("pdf points, origin top-left")}</span>
        </figcaption>
      </figure>
    );
  }

  if (!claim.char_span) {
    return <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-2xs text-subtle">{tr("No location recorded for this claim.")}</p>;
  }
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3.5 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-2xs text-subtle">
        <FileText size={12} /> {tr("Characters {from}–{to}", { from: claim.char_span[0], to: claim.char_span[1] })}
      </div>
      {ctx ? (
        <p className="text-xs leading-relaxed whitespace-pre-wrap text-muted">
          …{ctx.before}
          <mark className="rounded bg-accent-soft px-0.5 text-fg ring-1 ring-accent-line">{ctx.hit}</mark>
          {ctx.after}…
        </p>
      ) : (
        <Skeleton className="h-16 w-full" />
      )}
    </div>
  );
}
