import { useRef, useState } from "react";
import { ChevronDown, Clapperboard, Film, Image as ImageIcon } from "lucide-react";
import { bytes, cx, dateTime } from "@/lib/format";
import type { VideoRender } from "@/lib/types";

const SOURCE = {
  motion: { label: "Motion clip", icon: <Film size={12} aria-hidden /> },
  still: { label: "Animated still", icon: <ImageIcon size={12} aria-hidden /> },
  "title card": { label: "Title card", icon: <Clapperboard size={12} aria-hidden /> },
} as const;

const tc = (sec = 0) => {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
};

/** The production script of what was actually rendered, scene by scene. Timecodes seek the video. */
function ProductionScript({ render, seek }: { render: VideoRender; seek: (t: number) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-5 rounded-xl ring-1 ring-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span className="flex-1">
          <span className="block text-sm font-semibold text-fg">Production script</span>
          <span className="block text-xs text-muted">What each scene shows and says, exactly as rendered. Download it from Export → SCRIPT.</span>
        </span>
        <ChevronDown size={16} className={cx("text-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ol className="divide-y divide-border border-t border-border">
          {render.scenes.map((s) => (
            <li key={s.scene} className="grid gap-3 px-4 py-4 sm:grid-cols-[120px_1fr]">
              <div>
                <button
                  type="button"
                  onClick={() => seek(s.start ?? 0)}
                  className="font-mono text-sm font-semibold text-accent hover:underline"
                  title="Play from this scene"
                >
                  {tc(s.start)}
                </button>
                <p className="font-mono text-2xs text-subtle">to {tc(s.end)}</p>
                <p className="mt-1.5 text-xs font-semibold text-fg">Scene {s.scene}</p>
                <p className="mt-1 inline-flex items-center gap-1 text-2xs text-muted">
                  {SOURCE[s.source].icon}
                  {SOURCE[s.source].label}
                </p>
              </div>
              <div className="min-w-0 space-y-2">
                <p className="text-sm font-semibold text-fg">{s.title}</p>
                <p className="text-base leading-relaxed text-fg">
                  <span className="mr-1.5 text-xs font-semibold text-muted">Narration</span>
                  {s.spoken ?? "Re-render to record the spoken script."}
                </p>
                <p className="text-sm text-muted" title={s.prompt}>
                  <span className="mr-1.5 text-xs font-semibold">Visual</span>
                  {s.prompt.split(/\.\s*cinematic photograph/i)[0]}
                  <span className="ml-1.5 text-2xs text-subtle">+ house style and no-text safety rules</span>
                </p>
                {s.captions && s.captions.length > 0 && (
                  <details className="text-xs text-muted">
                    <summary className="cursor-pointer font-semibold">Subtitles ({s.captions.length})</summary>
                    <ul className="mt-1.5 space-y-0.5">
                      {s.captions.map(([text, a, b], i) => (
                        <li key={i} className="flex gap-3">
                          <button type="button" onClick={() => seek((s.start ?? 0) + a)} className="shrink-0 font-mono text-accent hover:underline">
                            {tc((s.start ?? 0) + a)}–{tc((s.start ?? 0) + b)}
                          </button>
                          <span>{text}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** The rendered MP4 with an honest account of how each scene was made. */
export function VideoPlayer({ src, render, stale }: { src: string; render: VideoRender; stale: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const motion = render.scenes.filter((s) => s.source === "motion").length;
  const seek = (t: number) => {
    const v = ref.current;
    if (!v) return;
    v.currentTime = t;
    void v.play().catch(() => undefined);
    v.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  return (
    <section className="mb-8" aria-label="Rendered video">
      <div className="overflow-hidden rounded-xl bg-black ring-1 ring-border">
        <video ref={ref} src={src} controls preload="metadata" className="aspect-video w-full" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="font-semibold text-fg">AI-generated video</span>
        <span>{render.seconds.toFixed(0)} s</span>
        <span>{render.resolution}</span>
        <span>{bytes(render.bytes)}</span>
        <span>
          {motion}/{render.scenes.length} motion scenes
        </span>
        <span>Rendered {dateTime(render.created_at)} from v{render.artifact_version}</span>
      </div>
      {stale && <p className="mt-2 text-xs text-warning">The script changed after this render. Render again so the video matches the approved version.</p>}
      <p className="mt-2 text-xs text-muted">
        Narration ({render.models.narration.split("/").pop()}) reads the verified, released script. Visuals are illustrative
        {render.models.motion ? `; motion clips from ${render.models.motion}` : "; no motion model configured, so scenes use animated stills"}.
      </p>
      {render.narration_note && (
        <p className="mt-1.5 text-xs text-warning">No narration: {render.narration_note}. The video uses subtitles only; render again once it is available.</p>
      )}
            {render.motion_note && render.models.motion && (
        <p className="mt-1.5 text-xs text-warning">Motion clips skipped: {render.motion_note}. Scenes fell back to animated stills.</p>
      )}
      <ProductionScript render={render} seek={seek} />
    </section>
  );
}
