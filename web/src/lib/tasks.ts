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
