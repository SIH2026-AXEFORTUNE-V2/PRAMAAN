import { Sparkles } from "lucide-react";
import { cx } from "@/lib/format";

const FULL = "AI-generated illustration · not evidence";

/**
 * An AI-generated illustration with its mandatory label. Never evidence, so never a claim target.
 * The label adapts to the image's rendered width so it never covers the picture: the full wording on
 * large images, a compact one-line chip on small ones (full wording kept in the tooltip / accessible name).
 */
export function Illustration({ src, alt, className, imgClassName }: { src?: string; alt: string; className?: string; imgClassName?: string }) {
  if (!src) return null;
  return (
    <figure className={cx("@container overflow-hidden", !/\babsolute\b/.test(className ?? "") && "relative", className)}>
      <img src={src} alt={alt} loading="lazy" className={cx("h-full w-full object-cover", imgClassName)} />
      <figcaption
        title={FULL}
        aria-label={FULL}
        className="absolute bottom-1.5 left-1.5 inline-flex max-w-[calc(100%-0.75rem)] items-center gap-1 rounded bg-black/55 px-1.5 py-px text-[10.5px] leading-4 whitespace-nowrap text-white backdrop-blur-sm @min-[360px]:bottom-2 @min-[360px]:left-2 @min-[360px]:text-[11px]"
      >
        <Sparkles size={10} aria-hidden />
        <span className="hidden @min-[360px]:inline" aria-hidden>
          {FULL}
        </span>
        <span className="@min-[360px]:hidden" aria-hidden>
          AI image
        </span>
      </figcaption>
    </figure>
  );
}
