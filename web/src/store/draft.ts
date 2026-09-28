/* Draft of the next transformation (composer state), kept across navigation. */
import { create } from "zustand";
import type { OutputType, Params } from "@/lib/types";

export type DraftParams = Omit<Params, "instructions">;

export const DEFAULT_PARAMS: DraftParams = {
  audience: "Senior Officials",
  audience_custom: "",
  tone: "Formal",
  language: "English",
  detail: "Medium",
  objective: "Inform",
  style: "Mixed",
  classification: "Internal",
  video_duration: "60",
  twitter_mode: "thread",
  slide_count: "6",
};

interface DraftState {
  files: File[];
  text: string;
  url: string;
  request: string;
  outputs: OutputType[];
  params: DraftParams;
  templateId: string | null;
  addFiles: (f: File[]) => void;
  removeFile: (name: string) => void;
  set: (patch: Partial<Omit<DraftState, "set" | "addFiles" | "removeFile" | "toggleOutput" | "setParam" | "reset">>) => void;
  toggleOutput: (o: OutputType) => void;
  setParam: <K extends keyof DraftParams>(k: K, v: DraftParams[K]) => void;
  reset: () => void;
}

export const useDraft = create<DraftState>((set, get) => ({
  files: [],
  text: "",
  url: "",
  request: "",
  outputs: [],
  params: DEFAULT_PARAMS,
  templateId: null,
  addFiles(f) {
    const names = new Set(get().files.map((x) => x.name));
    set({ files: [...get().files, ...f.filter((x) => !names.has(x.name))] });
  },
  removeFile: (name) => set({ files: get().files.filter((f) => f.name !== name) }),
  set: (patch) => set(patch),
  toggleOutput(o) {
    const cur = get().outputs;
    set({ outputs: cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o] });
  },
  setParam: (k, v) => set({ params: { ...get().params, [k]: v } }),
  reset: () => set({ files: [], text: "", url: "", request: "", outputs: [], templateId: null }),
}));
