import { Clapperboard, Film, Image as ImageIcon } from "lucide-react";
import { bytes, dateTime } from "@/lib/format";
import type { VideoRender } from "@/lib/types";

const SOURCE = {
  motion: { label: "Motion clip", icon: <Film size={12} aria-hidden /> },
  still: { label: "Animated still", icon: <ImageIcon size={12} aria-hidden /> },
  "title card": { label: "Title card", icon: <Clapperboard size={12} aria-hidden /> },
} as const;

/** The rendered MP4 with an honest account of how each scene was made. */
export function VideoPlayer({ src, render, stale }: { src: string; render: VideoRender; stale: boolean }) {
  const motion = render.scenes.filter((s) => s.source === "motion").length;
  return (
    <section className="mb-8" aria-label="Rendered video">
      <div className="overflow-hidden rounded-xl bg-black ring-1 ring-border">
        <video src={src} controls preload="metadata" className="aspect-video w-full" />
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
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {render.scenes.map((s) => (
          <li key={s.scene} title={s.prompt} className="inline-flex items-center gap-1.5 rounded-md bg-surface-3 px-2 py-1 text-2xs text-muted">
            {SOURCE[s.source].icon}
            Scene {s.scene}: {SOURCE[s.source].label}
          </li>
        ))}
      </ul>
    </section>
  );
}
