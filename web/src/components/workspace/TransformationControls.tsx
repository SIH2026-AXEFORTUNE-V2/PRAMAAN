import { AlignLeft, Globe, Layers, MessageSquareText, ShieldCheck, Target, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { AppConfig } from "@/lib/types";
import type { DraftParams } from "@/store/draft";
import { Select } from "../ui/Menu";
import { TextInput } from "../ui/misc";

type Key = "audience" | "tone" | "language" | "detail" | "objective" | "style" | "classification";

const CHIPS: { key: Key; icon: ReactNode; tip: string }[] = [
  { key: "audience", icon: <Users size={16} />, tip: "Who will read the artefacts" },
  { key: "tone", icon: <MessageSquareText size={16} />, tip: "Voice of the writing" },
  { key: "language", icon: <Globe size={16} />, tip: "Output language (facts stay locked to the evidence)" },
  { key: "detail", icon: <AlignLeft size={16} />, tip: "Depth and length" },
  { key: "objective", icon: <Target size={16} />, tip: "What the communication should achieve" },
  { key: "style", icon: <Layers size={16} />, tip: "Text-led, visual-led or mixed" },
  { key: "classification", icon: <ShieldCheck size={16} />, tip: "Security classification drives the release policy" },
];

/** The configuration bar. Controlled: the caller owns the params (draft or live contract). */
export function TransformationControls({
  config,
  params,
  onChange,
  disabled,
}: {
  config: AppConfig;
  params: DraftParams;
  onChange: <K extends keyof DraftParams>(k: K, v: DraftParams[K]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="@container">
      <div className="grid grid-cols-2 gap-2 @xl:grid-cols-4 @7xl:grid-cols-7" role="group" aria-label="Transformation configuration">
        {CHIPS.map(({ key, icon, tip }) => {
          const meta = config.parameters[key];
          return (
            <div key={key} title={tip}>
              <Select label={meta.label} value={params[key]} options={meta.options} onChange={(v) => onChange(key, v)} icon={icon} disabled={disabled} />
            </div>
          );
        })}
      </div>
      {params.audience === "Custom" && (
        <div className="mt-2 max-w-md">
          <TextInput
            aria-label="Custom audience"
            placeholder="Describe the audience, e.g. District disaster management officers"
            value={params.audience_custom}
            onChange={(e) => onChange("audience_custom", e.target.value)}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
