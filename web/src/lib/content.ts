/* Narrow helpers over schema-driven artefact JSON. */
import type { Content, Json } from "./types";

export const str = (v: Json | undefined): string => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
export const arr = (v: Json | undefined): Json[] => (Array.isArray(v) ? v : []);
export const obj = (v: Json | undefined): Content => (v && typeof v === "object" && !Array.isArray(v) ? (v as Content) : {});
export const strs = (v: Json | undefined): string[] => arr(v).map(str).filter(Boolean);

/** Every editable string field of an artefact with its JSON path (mirrors the backend path format). */
export function stringFields(v: Json, path = "", out: { path: string; value: string }[] = []): { path: string; value: string }[] {
  const SKIP = new Set(["color_palette", "layout", "icon", "chart_type", "priority", "mode", "severity", "classification", "subtitles", "chars"]);
  if (typeof v === "string") out.push({ path, value: v });
  else if (Array.isArray(v)) v.forEach((x, i) => stringFields(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object")
    Object.entries(v).forEach(([k, x]) => {
      if (!SKIP.has(k)) stringFields(x, path ? `${path}.${k}` : k, out);
    });
  return out;
}

export function setPath(root: Content, path: string, value: string): Content {
  const copy = structuredClone(root) as Content;
  const tokens = path.match(/[^.[\]]+|\[\d+\]/g) ?? [];
  let cur: unknown = copy;
  tokens.slice(0, -1).forEach((t) => {
    cur = t.startsWith("[") ? (cur as Json[])[Number(t.slice(1, -1))] : (cur as Content)[t];
  });
  const last = tokens[tokens.length - 1];
  if (last.startsWith("[")) (cur as Json[])[Number(last.slice(1, -1))] = value;
  else (cur as Content)[last] = value;
  return copy;
}

export function prettyPath(path: string): string {
  return path
    .replace(/\[(\d+)\]/g, (_, n: string) => ` ${Number(n) + 1}`)
    .replace(/\./g, " › ")
    .replace(/_/g, " ");
}
