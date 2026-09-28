import { AlertTriangle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { arr, obj, str } from "@/lib/content";
import type { Artifact } from "@/lib/types";

/* Thumbnails are drawn as paper on a desk, so they stay paper-white in both themes. */
const PAPER = "absolute inset-x-4 top-4 bottom-0 overflow-hidden rounded-t-md bg-paper text-paper-ink shadow-md";
const RULE = "h-[3px] rounded-full bg-[#dfe3ea]";

function Lines({ n = 5 }: { n?: number }) {
  return (
    <div className="mt-2.5 space-y-1.5">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className={RULE} style={{ width: `${94 - ((i * 17) % 36)}%` }} />
      ))}
    </div>
  );
}

function Desk({ children }: { children: React.ReactNode }) {
  return <div className="relative h-[150px] overflow-hidden rounded-lg bg-surface-3">{children}</div>;
}

/** Small, faithful preview of the real artefact content (released version). */
export function ArtifactThumb({ tid, a }: { tid: string; a: Artifact }) {
  if (!a.content || a.status === "queued" || a.status === "generating") {
    return (
      <Desk>
        <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
          {a.status === "failed" ? (
            <>
              <AlertTriangle size={20} className="text-danger" />
              <span className="text-xs text-danger">Agent execution interrupted</span>
            </>
          ) : (
            <>
              <Loader2 size={20} className="animate-spin text-accent" />
              <span className="text-xs text-muted">{a.status === "queued" ? "Waiting for evidence" : "Writing from evidence"}</span>
            </>
          )}
        </div>
      </Desk>
    );
  }
  const c = a.released ?? a.content;
  const cover = a.illustrations?.find((x) => x.slot === "post" || x.slot === "slide-1" || x.slot.startsWith("scene-"));
  if (cover) {
    return (
      <Desk>
        <img src={api.illustrationUrl(tid, a.type, cover.slot, cover.sha256)} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-8">
          <p className="line-clamp-2 font-display text-[12.5px] leading-snug font-semibold text-white">{str(c.title) || str(c.hook) || a.label}</p>
        </div>
      </Desk>
    );
  }
  switch (a.type) {
    case "infographic":
      return (
        <Desk>
          <div className={PAPER}>
            <img src={api.previewSvgUrl(tid, "infographic", a.version)} alt="" className="w-full" loading="lazy" />
          </div>
        </Desk>
      );
    case "presentation": {
      const first = obj(arr(c.slides)[0]);
      return (
        <Desk>
          <div className="absolute inset-x-4 top-5 bottom-3 flex flex-col justify-end rounded-md bg-[#172033] p-4 text-white shadow-md">
            <div className="absolute top-3.5 left-4 h-1 w-8 rounded-full bg-[#f2d24b]" />
            <p className="line-clamp-2 font-display text-[13px] leading-snug font-semibold">{str(first.title) || str(c.title)}</p>
            <p className="mt-1 line-clamp-1 text-[11px] text-white/70">{str(c.subtitle)}</p>
          </div>
        </Desk>
      );
    }
    case "linkedin":
      return (
        <Desk>
          <div className={`${PAPER} p-3.5`}>
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-[#dfe3ea]" />
              <span className={`${RULE} w-20`} />
            </div>
            <p className="mt-2.5 line-clamp-4 text-[11.5px] leading-snug">{str(c.hook) || str(c.post)}</p>
          </div>
        </Desk>
      );
    case "twitter":
      return (
        <Desk>
          <div className={`${PAPER} space-y-2 p-3`}>
            {arr(c.tweets)
              .slice(0, 2)
              .map((tw, i) => (
                <p key={i} className="line-clamp-3 rounded-md border border-[#dfe3ea] p-2 text-[11px] leading-snug">
                  {str(obj(tw).text)}
                </p>
              ))}
          </div>
        </Desk>
      );
    case "advisory":
      return (
        <Desk>
          <div className={`${PAPER} p-3.5`}>
            <div className="flex items-center gap-2 text-[10.5px]">
              <span className="rounded bg-[#fbeae8] px-1.5 font-semibold text-[#b3261e] capitalize">{str(c.severity)}</span>
              <span className="text-[#6f7a8c]">{str(c.classification)}</span>
            </div>
            <p className="mt-2 line-clamp-2 font-display text-[12px] leading-snug font-semibold">{str(c.title)}</p>
            <Lines n={3} />
          </div>
        </Desk>
      );
    case "video":
      return (
        <Desk>
          <div className={`${PAPER} p-3.5`}>
            <p className="line-clamp-2 font-display text-[12px] font-semibold">{str(c.title)}</p>
            <div className="mt-2.5 flex gap-1">
              {arr(c.scenes)
                .slice(0, 5)
                .map((_, i) => (
                  <div key={i} className="h-10 flex-1 rounded bg-[#dfe3ea]" />
                ))}
            </div>
            <p className="mt-2 text-[10.5px] text-[#6f7a8c]">
              {arr(c.scenes).length} scenes, {str(c.duration_seconds)} s
            </p>
          </div>
        </Desk>
      );
    default:
      return (
        <Desk>
          <div className={`${PAPER} p-3.5`}>
            <p className="line-clamp-2 font-display text-[12px] leading-snug font-semibold">{str(c.title)}</p>
            <p className="mt-2 line-clamp-3 border-l-2 border-[#2e4fa3] pl-2 text-[11px] leading-snug text-[#4a5568]">{str(c.bottom_line)}</p>
            <Lines n={2} />
          </div>
        </Desk>
      );
  }
}
