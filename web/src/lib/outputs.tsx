import type { ReactNode } from "react";
import { Clapperboard, FileText, Image, Presentation, ShieldAlert } from "lucide-react";
import type { OutputType } from "./types";

/* Brand glyphs drawn inline (icon libraries no longer ship brand marks). */
function LinkedInGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7" />
    </svg>
  );
}

function XGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
      <path d="M4 4l16 16M20 4l-6.5 7M4 20l6.5-7" />
    </svg>
  );
}

export const OUTPUT_ORDER: OutputType[] = [
  "executive_summary",
  "advisory",
  "linkedin",
  "twitter",
  "infographic",
  "presentation",
  "video",
];

export const OUTPUT_SHORT: Record<OutputType, string> = {
  executive_summary: "Executive Summary",
  advisory: "Advisory",
  linkedin: "LinkedIn",
  twitter: "X Thread",
  infographic: "Infographic",
  presentation: "Presentation",
  video: "Video Package",
};

export function OutputIcon({ type, size = 16 }: { type: OutputType; size?: number }): ReactNode {
  const p = { size, strokeWidth: 1.8, "aria-hidden": true } as const;
  switch (type) {
    case "executive_summary":
      return <FileText {...p} />;
    case "advisory":
      return <ShieldAlert {...p} />;
    case "linkedin":
      return <LinkedInGlyph size={size} />;
    case "twitter":
      return <XGlyph size={size} />;
    case "infographic":
      return <Image {...p} />;
    case "presentation":
      return <Presentation {...p} />;
    case "video":
      return <Clapperboard {...p} />;
  }
}

/* Keyword intent parsing mirrors the orchestrator, so chips pre-select as the user types. */
const KEYWORDS: [OutputType, RegExp][] = [
  ["executive_summary", /exec(?:utive)?\s*(?:summary|brief)|\bsummary\b|\bbluf\b/i],
  ["advisory", /advisor(?:y|ies)/i],
  ["linkedin", /linked\s?in/i],
  ["twitter", /\btwitter\b|\btweets?\b|\bx\s*(?:\/\s*social\s*)?(?:thread|post)\b|social thread/i],
  ["infographic", /info\s?graphic/i],
  ["presentation", /presentation|\bdeck\b|\bslides?\b|\bppt/i],
  ["video", /\bvideo\b|storyboard|\bscript\b/i],
];

export function parseOutputs(text: string): OutputType[] {
  return KEYWORDS.filter(([, rx]) => rx.test(text)).map(([k]) => k);
}
