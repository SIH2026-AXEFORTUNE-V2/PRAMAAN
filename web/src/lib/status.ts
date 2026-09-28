/* Single mapping from domain states to presentation (tone + label). */
import type { ArtifactStatus, ClaimStatus, PolicyAction, RefStatus, TaskStatus, TransformationStatus } from "./types";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export const TASK_STATUS: Record<TaskStatus, { tone: Tone; label: string }> = {
  queued: { tone: "neutral", label: "Queued" },
  running: { tone: "info", label: "Running" },
  completed: { tone: "success", label: "Completed" },
  failed: { tone: "danger", label: "Failed" },
  blocked: { tone: "danger", label: "Blocked" },
  needs_review: { tone: "warning", label: "Needs review" },
};

export const ARTIFACT_STATUS: Record<ArtifactStatus, { tone: Tone; label: string }> = {
  queued: { tone: "neutral", label: "Queued" },
  generating: { tone: "info", label: "Generating" },
  generated: { tone: "info", label: "Generated" },
  verified: { tone: "success", label: "Verified" },
  needs_review: { tone: "warning", label: "Needs review" },
  blocked: { tone: "danger", label: "Blocked" },
  stale: { tone: "warning", label: "Evidence changed" },
  approved: { tone: "success", label: "Approved" },
  rejected: { tone: "danger", label: "Rejected" },
  exported: { tone: "success", label: "Exported" },
  failed: { tone: "danger", label: "Failed" },
};

export const TRANSFORMATION_STATUS: Record<TransformationStatus, { tone: Tone; label: string }> = {
  running: { tone: "info", label: "Running" },
  awaiting_review: { tone: "warning", label: "Awaiting review" },
  approved: { tone: "success", label: "Approved" },
  reviewed: { tone: "neutral", label: "Reviewed" },
  partial: { tone: "warning", label: "Partial" },
  failed: { tone: "danger", label: "Failed" },
};

export const CLAIM_STATUS: Record<ClaimStatus, { tone: Tone; label: string }> = {
  verified: { tone: "success", label: "Verified" },
  human_verified: { tone: "success", label: "Human verified" },
  needs_review: { tone: "warning", label: "Needs review" },
  conflict: { tone: "danger", label: "Source conflict" },
  unsupported: { tone: "danger", label: "Unsupported" },
  superseded: { tone: "neutral", label: "Superseded" },
  rejected: { tone: "neutral", label: "Rejected" },
};

export const REF_STATUS: Record<RefStatus, { tone: Tone; label: string; symbol: string }> = {
  grounded: { tone: "success", label: "Evidence grounded", symbol: "✓" },
  review: { tone: "warning", label: "Requires review", symbol: "⚠" },
  drift: { tone: "danger", label: "Contradicts evidence", symbol: "✕" },
  unsupported: { tone: "danger", label: "Unsupported", symbol: "✕" },
  uncertainty: { tone: "danger", label: "Uncertainty strengthened", symbol: "✕" },
};

export const ACTION_TONE: Record<PolicyAction, Tone> = {
  ALLOW: "success",
  MASK: "info",
  REDACT: "info",
  RESTRICT: "info",
  REVIEW: "warning",
  BLOCK: "danger",
};

export const MODALITY_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  probable: "Probable",
  possible: "Possible",
  suspected: "Suspected",
  unverified: "Unverified",
  estimated: "Estimated",
  reported: "Reported",
  alleged: "Alleged",
};

export const SECURITY_CLASS_LABEL: Record<string, string> = {
  pii: "Personal data",
  credential: "Credentials & secrets",
  infrastructure: "Internal infrastructure",
  threat_indicator: "Threat indicators",
  location: "Sensitive location",
  marking: "Confidential marking",
  injection: "Prompt injection",
};

export const TONE_CLASSES: Record<Tone, { text: string; bg: string; border: string; dot: string }> = {
  neutral: { text: "text-muted", bg: "bg-surface-3", border: "border-border", dot: "bg-subtle" },
  info: { text: "text-accent", bg: "bg-accent-soft", border: "border-accent-line", dot: "bg-accent" },
  success: { text: "text-success", bg: "bg-success-soft", border: "border-success-line", dot: "bg-success" },
  warning: { text: "text-warning", bg: "bg-warning-soft", border: "border-warning-line", dot: "bg-warning" },
  danger: { text: "text-danger", bg: "bg-danger-soft", border: "border-danger-line", dot: "bg-danger" },
};
