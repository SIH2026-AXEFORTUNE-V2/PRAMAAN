import { Sparkles } from "lucide-react";
import { cx } from "@/lib/format";

/** An AI-generated illustration with its mandatory label. Never evidence, so never a claim target. */
export function Illustration({ src, alt, className, imgClassName }: { src?: string; alt: string; className?: string; imgClassName?: string }) {
  if (!src) return null;
  return (
    <figure className={cx("overflow-hidden", !/\babsolute\b/.test(className ?? "") && "relative", className)}>
      <img src={src} alt={alt} loading="lazy" className={cx("h-full w-full object-cover", imgClassName)} />
      <figcaption className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] text-white backdrop-blur-sm">
        <Sparkles size={11} aria-hidden /> AI-generated illustration · not evidence
      </figcaption>
    </figure>
  );
}
