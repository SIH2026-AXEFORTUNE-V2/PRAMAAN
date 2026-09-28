import { msg, tr } from "@/i18n";
import { OUTPUT_SHORT } from "./outputs";
import type { Task } from "./types";

/** Latest task per key (regenerations append new tasks; the newest one is the live state). */
export function latestTasks(tasks: Task[]): Task[] {
  const byKey = new Map<string, Task>();
  tasks.forEach((t) => byKey.set(t.key, t));
  return tasks.filter((t) => byKey.get(t.key) === t);
}

export type TaskGroup = "running" | "completed" | "pending";

export function groupOf(t: Task): TaskGroup {
  if (t.status === "running") return "running";
  if (t.status === "completed" || t.status === "failed") return "completed";
  return "pending";
}

export const AGENT_ORDER = [
  "Orchestrator",
  "Source Understanding Agent",
  "Security Agent",
  "Evidence Extraction Agent",
  "Executive Summary Agent",
  "Advisory Agent",
  "Social Content Agent",
  "Infographic Agent",
  "Presentation Agent",
  "Video Package Agent",
  "Consistency Agent",
  "Red Team / Critic Agent",
  "Provenance Agent",
  "Human Reviewer",
];

/** Task titles are built by the server in English; rebuild them from the task key so they translate. */
export function taskTitle(t: Task): string {
  const [kind, arg] = t.key.split(":");
  if (kind === "write" && t.artifact) return t.title.startsWith("Regenerate") ? tr("Regenerate {label}", { label: OUTPUT_SHORT[t.artifact] }) : tr("Generate {label}", { label: OUTPUT_SHORT[t.artifact] });
  if (kind === "illustrate" && t.artifact) return tr("Illustrate {label}", { label: OUTPUT_SHORT[t.artifact] });
  if (kind === "source" && arg) return tr("Understand {name}", { name: t.title.replace(/^Understand /, "") });
  return tr(t.title);
}

export const agentName = (t: Task): string => tr(t.agent);
/* Progress details are composed by the server from a small set of templates joined with " · ".
   Each segment is matched back to its template so it can be shown in the interface language. */
const DETAIL_TEMPLATES: [RegExp, string][] = [
  [/^(\d+) pages$/, msg("{0} pages")],
  [/^([\d,]+) words$/, msg("{0} words")],
  [/^(\d+) sensitive item\(s\)$/, msg("{0} sensitive item(s)")],
  [/^(\d+) injection attempt\(s\)$/, msg("{0} injection attempt(s)")],
  [/^(\d+) claims$/, msg("{0} claims")],
  [/^(\d+) verified$/, msg("{0} verified")],
  [/^(\d+) source conflict\(s\)$/, msg("{0} source conflict(s)")],
  [/^(\d+) specialist agent\(s\)$/, msg("{0} specialist agent(s)")],
  [/^(\d+) parallel$/, msg("{0} parallel")],
  [/^(.+) output$/, msg("{0} output")],
  [/^v(\d+) generated$/, msg("v{0} generated")],
  [/^v(\d+) repaired$/, msg("v{0} repaired")],
  [/^(\d+) item\(s\) masked\/redacted$/, msg("{0} item(s) masked/redacted")],
  [/^(\d+) artefact\(s\) blocked$/, msg("{0} artefact(s) blocked")],
  [/^(\d+) conflict\(s\)$/, msg("{0} conflict(s)")],
  [/^Issues in (\d+) artefact\(s\)$/, msg("Issues in {0} artefact(s)")],
  [/^Ledger entry #(\d+)$/, msg("Ledger entry #{0}")],
  [/^(\d+)\/(\d+) approved$/, msg("{0}/{1} approved")],
  [/^Contract v(\d+)$/, msg("Contract v{0}")],
  [/^(\d+) outputs$/, msg("{0} outputs")],
  [/^Extracted (\d+)\/(\d+) source\(s\)$/, msg("Extracted {0}/{1} source(s)")],
  [/^Reading (\d+) source\(s\)$/, msg("Reading {0} source(s)")],
  [/^Scenes prepared (\d+)\/(\d+)$/, msg("Scenes prepared {0}/{1}")],
  [/^Encoding scene (\d+)\/(\d+)$/, msg("Encoding scene {0}/{1}")],
  [/^(\d+)\/(\d+) artefacts scanned$/, msg("{0}/{1} artefacts scanned")],
  [/^(\d+)\/(\d+) images$/, msg("{0}/{1} images")],
  [/^(\d+) illustration\(s\)$/, msg("{0} illustration(s)")],
  [/^Preparing (\d+) scenes$/, msg("Preparing {0} scenes")],
  [/^(\d+)s MP4$/, msg("{0}s MP4")],
  [/^(\d+)\/(\d+) motion$/, msg("{0}/{1} motion")],
  [/^(\d+)\/(\d+) motion scenes$/, msg("{0}/{1} motion scenes")],
  [/^JSON2Video: (.+)$/, msg("JSON2Video: {0}")],
  [/^Read-back: (\d+) mismatch\(es\)$/, msg("Read-back: {0} mismatch(es)")],
];

/* Fixed detail segments the server emits verbatim; listed so the extractor picks them up. */
export const DETAIL_PHRASES = [msg("no conflicts"), msg("No findings")];

export function translateDetail(detail: string): string {
  return detail
    .split(" · ")
    .map((seg) => {
      for (const [rx, tpl] of DETAIL_TEMPLATES) {
        const m = rx.exec(seg);
        if (m) return tr(tpl, Object.fromEntries(m.slice(1).map((v, i) => [String(i), tr(v)])));
      }
      return /[0-9a-f]{8,}…$/.test(seg) ? seg : tr(seg);
    })
    .join(" · ");
}

export const taskDetail = (t: Task): string => (t.error ? t.error : translateDetail(t.detail));
