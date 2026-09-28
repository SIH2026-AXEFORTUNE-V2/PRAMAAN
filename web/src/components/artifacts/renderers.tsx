import { useState } from "react";
import { Clock, Hash as HashIcon, MessageCircle, Repeat2, ThumbsUp } from "lucide-react";
import { arr, obj, str, strs } from "@/lib/content";
import { cx } from "@/lib/format";
import type { Content, OutputType } from "@/lib/types";
import { T } from "../evidence/ClaimText";
import { Illustration } from "./Illustration";
import { VideoPlayer } from "./VideoPlayer";
import type { VideoRender } from "@/lib/types";

type Images = Record<string, string>;

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-7 mb-2.5 text-sm font-semibold text-muted first:mt-0">{children}</h3>;
}

function Bullets({ base, items }: { base: string; items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((x, i) => (
        <li key={i} className="flex gap-2.5 text-base leading-relaxed">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-subtle" />
          <T path={`${base}[${i}]`} text={x} />
        </li>
      ))}
    </ul>
  );
}

function ExecutiveSummary({ c }: { c: Content }) {
  const metrics = arr(c.metrics).map(obj);
  const actions = arr(c.recommended_actions).map(obj);
  return (
    <div>
      <p className="text-2xs font-bold text-accent">Executive Summary</p>
      <h2 className="mt-1 text-xl leading-tight font-bold text-fg">
        <T path="title" text={str(c.title)} />
      </h2>
      <div className="mt-4 rounded-lg border-l-[3px] border-accent bg-accent-soft/60 px-4 py-3">
        <p className="text-2xs font-bold text-accent">Bottom line</p>
        <p className="mt-1 text-base leading-relaxed font-medium text-fg">
          <T path="bottom_line" text={str(c.bottom_line)} />
        </p>
      </div>
      {metrics.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {metrics.map((m, i) => (
            <div key={i} className="rounded-lg border border-border px-3 py-2.5">
              <p className="text-base font-bold text-fg">
                <T path={`metrics[${i}].value`} text={str(m.value)} />
              </p>
              <p className="text-2xs text-muted">
                <T path={`metrics[${i}].label`} text={str(m.label)} />
              </p>
            </div>
          ))}
        </div>
      )}
      <H>Situation</H>
      <p className="text-base leading-relaxed text-fg">
        <T path="situation" text={str(c.situation)} />
      </p>
      <H>Key findings</H>
      <Bullets base="key_findings" items={strs(c.key_findings)} />
      <H>Implications</H>
      <Bullets base="implications" items={strs(c.implications)} />
      <H>Recommended actions</H>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="bg-surface-2 text-left text-2xs text-subtle">
            <tr>
              <th className="px-3 py-2 font-semibold">Action</th>
              <th className="px-3 py-2 font-semibold">Owner</th>
              <th className="px-3 py-2 font-semibold">Timeline</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((a, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-3 py-2">
                  <T path={`recommended_actions[${i}].action`} text={str(a.action)} />
                </td>
                <td className="px-3 py-2 text-muted">{str(a.owner)}</td>
                <td className="px-3 py-2 text-muted">{str(a.timeline)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {strs(c.risks).length > 0 && (
        <>
          <H>Risks</H>
          <Bullets base="risks" items={strs(c.risks)} />
        </>
      )}
      <div className="mt-6 rounded-lg border border-border bg-surface-2 px-4 py-3">
        <p className="text-2xs font-bold text-subtle">Decision required</p>
        <p className="mt-1 text-sm text-fg">
          <T path="decision_required" text={str(c.decision_required)} />
        </p>
      </div>
    </div>
  );
}

const SEV_TONE: Record<string, string> = {
  critical: "bg-danger text-surface",
  high: "bg-danger-soft text-danger border border-danger-line",
  medium: "bg-warning-soft text-warning border border-warning-line",
  low: "bg-success-soft text-success border border-success-line",
  informational: "bg-accent-soft text-accent border border-accent-line",
};

function Advisory({ c }: { c: Content }) {
  const recs = arr(c.recommendations).map(obj);
  const inds = arr(c.indicators).map(obj);
  const details = arr(c.details).map(obj);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-2xs">
        <span className="font-bold text-subtle">Advisory</span>
        <span className="text-muted">{str(c.advisory_id)}</span>
        <span className={cx("rounded px-1.5 py-0.5 font-bold", SEV_TONE[str(c.severity)] ?? SEV_TONE.medium)}>{str(c.severity)}</span>
        <span className="rounded border border-border px-1.5 py-0.5 font-semibold">{str(c.classification)}</span>
        <span className="text-muted">Status: {str(c.status)}</span>
      </div>
      <h2 className="mt-2 text-xl leading-tight font-bold text-fg">
        <T path="title" text={str(c.title)} />
      </h2>
      <H>Summary</H>
      <p className="text-base leading-relaxed">
        <T path="summary" text={str(c.summary)} />
      </p>
      <H>Background</H>
      <p className="text-base leading-relaxed">
        <T path="background" text={str(c.background)} />
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <H>Affected</H>
          <Bullets base="affected" items={strs(c.affected)} />
        </div>
        <div>
          <H>Impact</H>
          <p className="text-base leading-relaxed">
            <T path="impact" text={str(c.impact)} />
          </p>
        </div>
      </div>
      {details.map((d, i) => (
        <div key={i}>
          <H>
            <T path={`details[${i}].heading`} text={str(d.heading)} />
          </H>
          <p className="text-base leading-relaxed">
            <T path={`details[${i}].body`} text={str(d.body)} />
          </p>
        </div>
      ))}
      <H>Recommendations</H>
      <ol className="space-y-2">
        {recs.map((r, i) => (
          <li key={i} className="flex gap-3 rounded-lg border border-border px-3 py-2.5">
            <span
              className={cx(
                "h-fit shrink-0 rounded px-1.5 py-0.5 text-2xs font-bold",
                str(r.priority) === "immediate" ? "bg-danger-soft text-danger" : str(r.priority) === "short-term" ? "bg-warning-soft text-warning" : "bg-surface-3 text-muted",
              )}
            >
              {str(r.priority)}
            </span>
            <span className="min-w-0 flex-1 text-sm">
              <T path={`recommendations[${i}].action`} text={str(r.action)} />
              <span className="block text-2xs text-muted">Owner: {str(r.owner)}</span>
            </span>
          </li>
        ))}
      </ol>
      {inds.length > 0 && (
        <>
          <H>Indicators</H>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-xs">
              <tbody>
                {inds.map((x, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="w-40 px-3 py-2 text-muted">{str(x.type)}</td>
                    <td className="px-3 py-2 font-semibold">
                      <T path={`indicators[${i}].value`} text={str(x.value)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="mt-6 text-2xs text-muted">Contact: {str(c.contact)}</p>
    </div>
  );
}

function LinkedIn({ c, images }: { c: Content; images: Images }) {
  return (
    <div className="mx-auto max-w-[560px]">
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="p-4 pb-0">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="h-10 w-10 rounded-full bg-surface-3" />
          <div>
            <p className="text-xs font-semibold">Your organisation</p>
            <p className="text-2xs text-subtle">Post preview</p>
          </div>
        </div>
        <p className="text-base leading-relaxed whitespace-pre-line">
          <T path="post" text={str(c.post)} />
        </p>
        <p className="mt-3 text-xs text-accent">{strs(c.hashtags).join(" ")}</p>
        </div>
        <Illustration src={images["post"]} alt="Post image" className="mt-3 aspect-[1.91/1] bg-surface-3" />
        <div className="mx-4 mb-3 flex gap-5 border-t border-border pt-2.5 text-2xs text-subtle">
          <span className="inline-flex items-center gap-1">
            <ThumbsUp size={13} /> Like
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle size={13} /> Comment
          </span>
          <span className="inline-flex items-center gap-1">
            <Repeat2 size={13} /> Repost
          </span>
        </div>
      </div>
      <H>Alternate hooks</H>
      <Bullets base="alternate_hooks" items={strs(c.alternate_hooks)} />
      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <p className="rounded-lg border border-border p-3 text-muted">
          <b className="text-fg">Suggested visual:</b> {str(c.suggested_visual)}
        </p>
        <p className="rounded-lg border border-border p-3 text-muted">
          <b className="text-fg">Best time:</b> {str(c.best_time_to_post)}
        </p>
      </div>
    </div>
  );
}

function XThread({ c }: { c: Content }) {
  const tweets = arr(c.tweets).map(obj);
  return (
    <div className="mx-auto max-w-[560px] space-y-2">
      {tweets.map((tw, i) => {
        const text = str(tw.text);
        return (
          <div key={i} className="rounded-xl border border-border p-3.5">
            <p className="text-base leading-relaxed whitespace-pre-line">
              <T path={`tweets[${i}].text`} text={text} />
            </p>
            <p className={cx("mt-2 text-right text-2xs tabular-nums", text.length > 280 ? "font-bold text-danger" : "text-subtle")}>{text.length}/280</p>
          </div>
        );
      })}
      {strs(c.alternates).length > 0 && (
        <>
          <H>Alternates</H>
          <Bullets base="alternates" items={strs(c.alternates)} />
        </>
      )}
      <p className="pt-2 text-xs text-muted">
        <HashIcon size={12} className="inline" /> {strs(c.hashtags).join(" ") || "—"} · Media: {str(c.suggested_media)}
      </p>
    </div>
  );
}

function Infographic({ c, svgUrl }: { c: Content; svgUrl: string }) {
  const sections = arr(c.sections).map(obj);
  const hs = obj(c.headline_stat);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <img src={svgUrl} alt={`Infographic: ${str(c.title)}`} className="w-full" />
      </div>
      <div>
        <p className="text-2xs text-subtle">Rendered from the released version. Text below is traceable to evidence.</p>
        <h2 className="mt-2 text-lg font-bold">
          <T path="title" text={str(c.title)} />
        </h2>
        <p className="text-xs text-muted">
          <T path="subtitle" text={str(c.subtitle)} />
        </p>
        <div className="mt-3 rounded-lg border border-border px-3 py-2.5">
          <p className="text-xl font-bold">
            <T path="headline_stat.value" text={str(hs.value)} />
          </p>
          <p className="text-2xs text-muted">
            <T path="headline_stat.label" text={str(hs.label)} />
          </p>
        </div>
        {sections.map((s, i) => (
          <div key={i} className="mt-3">
            <p className="text-xs font-semibold">
              <T path={`sections[${i}].heading`} text={str(s.heading)} /> · <T path={`sections[${i}].stat_value`} text={str(s.stat_value)} />
            </p>
            <p className="text-xs text-muted">
              <T path={`sections[${i}].text`} text={str(s.text)} />
            </p>
          </div>
        ))}
        <H>Key messages</H>
        <Bullets base="key_messages" items={strs(c.key_messages)} />
      </div>
    </div>
  );
}

function Presentation({ c, images }: { c: Content; images: Images }) {
  const slides = arr(c.slides).map(obj);
  const [i, setI] = useState(0);
  const s = slides[Math.min(i, slides.length - 1)] ?? {};
  const layout = str(s.layout);
  const dark = layout === "title" || layout === "closing" || layout === "big_stat";
  const img = images[`slide-${i + 1}`];
  return (
    <div>
      <div className={cx("relative aspect-video overflow-hidden rounded-lg border border-border p-[6%]", dark ? "bg-[#0f1729] text-white" : "bg-white text-[#0f1729]")}>
        {img && layout === "title" && (
          <Illustration src={img} alt={`Slide ${i + 1} illustration`} className="absolute inset-y-0 right-0 w-[45%]" />
        )}
        {img && layout !== "title" && (
          <Illustration src={img} alt={`Slide ${i + 1} illustration`} className="absolute top-[26%] right-[5%] aspect-video w-[30%] rounded-md" />
        )}
        <div className="absolute top-[6%] left-[6%] h-1 w-12 rounded-full bg-[#6f9bff]" />
        {layout === "big_stat" ? (
          <div className="flex h-full flex-col justify-center">
            <p className="text-[clamp(28px,6vw,64px)] leading-none font-bold text-[#6f9bff]">
              <T path={`slides[${i}].stat_value`} text={str(s.stat_value)} />
            </p>
            <p className="mt-3 text-[clamp(12px,1.6vw,18px)] opacity-80">
              <T path={`slides[${i}].stat_label`} text={str(s.stat_label)} />
            </p>
          </div>
        ) : (
          <div className={cx("flex h-full flex-col justify-center", img && (layout === "title" ? "w-[50%]" : "w-[62%]"))}>
            <p className={cx("font-bold", layout === "title" ? "text-[clamp(18px,3.4vw,36px)]" : "text-[clamp(15px,2.4vw,26px)]")}>
              <T path={`slides[${i}].title`} text={str(s.title)} />
            </p>
            {layout === "title" && <p className="mt-2 text-[clamp(11px,1.4vw,16px)] opacity-70">{str(c.subtitle)}</p>}
            {layout === "quote" && (
              <p className="mt-4 border-l-4 border-[#6f9bff] pl-4 text-[clamp(12px,1.6vw,18px)] italic">
                <T path={`slides[${i}].quote`} text={str(s.quote)} />
              </p>
            )}
            <div className={cx("mt-4 grid gap-6", strs(s.right_bullets).length ? "grid-cols-2" : "grid-cols-1")}>
              {[strs(s.bullets), strs(s.right_bullets)]
                .filter((b) => b.length)
                .map((b, col) => (
                  <ul key={col} className="space-y-2">
                    {b.map((x, k) => (
                      <li key={k} className="flex gap-2 text-[clamp(10px,1.3vw,15px)] leading-snug">
                        <span className="mt-[0.5em] h-1.5 w-1.5 shrink-0 rounded-full bg-[#6f9bff]" />
                        <T path={`slides[${i}].${col ? "right_bullets" : "bullets"}[${k}]`} text={x} />
                      </li>
                    ))}
                  </ul>
                ))}
            </div>
          </div>
        )}
        <span className="absolute right-[4%] bottom-[5%] text-[10px] opacity-50">
          {i + 1} / {slides.length}
        </span>
      </div>
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Slides">
        {slides.map((sl, k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={k === i}
            onClick={() => setI(k)}
            className={cx("h-14 w-24 shrink-0 rounded-md border p-1.5 text-left text-[9px] leading-tight", k === i ? "border-accent ring-2 ring-accent-soft" : "border-border hover:border-border-strong")}
          >
            <span className="text-subtle">{k + 1}</span> <span className="line-clamp-2 text-fg">{str(sl.title)}</span>
          </button>
        ))}
      </div>
      <H>Speaker notes · slide {i + 1}</H>
      <p className="text-base leading-relaxed text-fg">
        <T path={`slides[${i}].speaker_notes`} text={str(s.speaker_notes)} />
      </p>
      {str(s.visual_suggestion) && <p className="mt-2 text-2xs text-muted">Visual: {str(s.visual_suggestion)}</p>}
    </div>
  );
}

function Video({ c, images, video }: { c: Content; images: Images; video?: { src: string; render: VideoRender; stale: boolean } }) {
  const scenes = arr(c.scenes).map(obj);
  return (
    <div>
      {video && <VideoPlayer {...video} />}
      <h2 className="text-xl font-bold">
        <T path="title" text={str(c.title)} />
      </h2>
      <p className="mt-1 text-sm text-muted italic">
        <T path="logline" text={str(c.logline)} />
      </p>
      <p className="mt-1 text-2xs text-subtle">
        {str(c.target_platform)} · {str(c.duration_seconds)}s · {scenes.length} scenes
      </p>
      <div className="mt-4 space-y-2.5">
        {scenes.map((s, i) => (
          <div key={i} className={cx("grid gap-3 rounded-lg border border-border p-3", images[`scene-${str(s.scene_number)}`] ? "sm:grid-cols-[220px_1fr]" : "sm:grid-cols-[110px_1fr]")}>
            <div>
              <Illustration src={images[`scene-${str(s.scene_number)}`]} alt={`Scene ${str(s.scene_number)} frame`} className="mb-2 aspect-video rounded-md" />
              <p className="text-xs font-bold">Scene {str(s.scene_number)}</p>
              <p className="inline-flex items-center gap-1 text-2xs text-muted tabular-nums">
                <Clock size={11} /> {str(s.start_sec)}–{str(s.end_sec)}s
              </p>
            </div>
            <div className="space-y-1 text-xs">
              <p className="font-semibold">
                <T path={`scenes[${i}].title`} text={str(s.title)} />
              </p>
              <p className="text-muted">
                <b className="text-fg">Visual:</b> <T path={`scenes[${i}].visual_description`} text={str(s.visual_description)} />
              </p>
              {str(s.on_screen_text) && (
                <p className="text-muted">
                  <b className="text-fg">On screen:</b> <T path={`scenes[${i}].on_screen_text`} text={str(s.on_screen_text)} />
                </p>
              )}
              <p>
                <b>Narration:</b> <T path={`scenes[${i}].narration`} text={str(s.narration)} />
              </p>
              <p className="text-2xs text-subtle">
                {str(s.camera_direction)} · {str(s.audio_cue)}
              </p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs">
        <b>Call to action:</b> <T path="call_to_action" text={str(c.call_to_action)} />
      </p>
    </div>
  );
}

export function ArtifactRenderer({
  type,
  content,
  svgUrl,
  images = {},
  video,
}: {
  type: OutputType;
  content: Content;
  svgUrl: string;
  images?: Images;
  video?: { src: string; render: VideoRender; stale: boolean };
}) {
  switch (type) {
    case "executive_summary":
      return <ExecutiveSummary c={content} />;
    case "advisory":
      return <Advisory c={content} />;
    case "linkedin":
      return <LinkedIn c={content} images={images} />;
    case "twitter":
      return <XThread c={content} />;
    case "infographic":
      return <Infographic c={content} svgUrl={svgUrl} />;
    case "presentation":
      return <Presentation c={content} images={images} />;
    case "video":
      return <Video c={content} images={images} video={video} />;
  }
}
