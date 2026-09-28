/* Single mapping from domain states to presentation (tone + label). */
import { tr } from "@/i18n";
import type { ArtifactStatus, ClaimStatus, PolicyAction, RefStatus, TaskStatus, TransformationStatus } from "./types";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export const TASK_STATUS: Record<TaskStatus, { tone: Tone; label: string }> = {
  queued: { tone: "neutral", get label() { return tr("Queued"); } },
  running: { tone: "info", get label() { return tr("Running"); } },
  completed: { tone: "success", get label() { return tr("Completed"); } },
  failed: { tone: "danger", get label() { return tr("Failed"); } },
  blocked: { tone: "danger", get label() { return tr("Blocked"); } },
  needs_review: { tone: "warning", get label() { return tr("Needs review"); } },
};

export const ARTIFACT_STATUS: Record<ArtifactStatus, { tone: Tone; label: string }> = {
  queued: { tone: "neutral", get label() { return tr("Queued"); } },
  generating: { tone: "info", get label() { return tr("Generating"); } },
  generated: { tone: "info", get label() { return tr("Generated"); } },
  verified: { tone: "success", get label() { return tr("Verified"); } },
  needs_review: { tone: "warning", get label() { return tr("Needs review"); } },
  blocked: { tone: "danger", get label() { return tr("Blocked"); } },
  stale: { tone: "warning", get label() { return tr("Evidence changed"); } },
  approved: { tone: "success", get label() { return tr("Approved"); } },
  rejected: { tone: "danger", get label() { return tr("Rejected"); } },
  exported: { tone: "success", get label() { return tr("Exported"); } },
  failed: { tone: "danger", get label() { return tr("Failed"); } },
};

export const TRANSFORMATION_STATUS: Record<TransformationStatus, { tone: Tone; label: string }> = {
  running: { tone: "info", get label() { return tr("Running"); } },
  awaiting_review: { tone: "warning", get label() { return tr("Awaiting review"); } },
  approved: { tone: "success", get label() { return tr("Approved"); } },
  reviewed: { tone: "neutral", get label() { return tr("Reviewed"); } },
  partial: { tone: "warning", get label() { return tr("Partial"); } },
  failed: { tone: "danger", get label() { return tr("Failed"); } },
};

export const CLAIM_STATUS: Record<ClaimStatus, { tone: Tone; label: string }> = {
  verified: { tone: "success", get label() { return tr("Verified"); } },
  human_verified: { tone: "success", get label() { return tr("Human verified"); } },
  needs_review: { tone: "warning", get label() { return tr("Needs review"); } },
  conflict: { tone: "danger", get label() { return tr("Source conflict"); } },
  unsupported: { tone: "danger", get label() { return tr("Unsupported"); } },
  superseded: { tone: "neutral", get label() { return tr("Superseded"); } },
  rejected: { tone: "neutral", get label() { return tr("Rejected"); } },
};

export const REF_STATUS: Record<RefStatus, { tone: Tone; label: string; symbol: string }> = {
  grounded: { tone: "success", get label() { return tr("Evidence grounded"); }, symbol: "✓" },
  review: { tone: "warning", get label() { return tr("Requires review"); }, symbol: "⚠" },
  drift: { tone: "danger", get label() { return tr("Contradicts evidence"); }, symbol: "✕" },
  unsupported: { tone: "danger", get label() { return tr("Unsupported"); }, symbol: "✕" },
  uncertainty: { tone: "danger", get label() { return tr("Uncertainty strengthened"); }, symbol: "✕" },
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
  get confirmed() { return tr("Confirmed"); },
  get probable() { return tr("Probable"); },
  get possible() { return tr("Possible"); },
  get suspected() { return tr("Suspected"); },
  get unverified() { return tr("Unverified"); },
  get estimated() { return tr("Estimated"); },
  get reported() { return tr("Reported"); },
  get alleged() { return tr("Alleged"); },
};

export const SECURITY_CLASS_LABEL: Record<string, string> = {
  get pii() { return tr("Personal data"); },
  get credential() { return tr("Credentials & secrets"); },
  get infrastructure() { return tr("Internal infrastructure"); },
  get threat_indicator() { return tr("Threat indicators"); },
  get location() { return tr("Sensitive location"); },
  get marking() { return tr("Confidential marking"); },
  get injection() { return tr("Prompt injection"); },
};

export const TONE_CLASSES: Record<Tone, { text: string; bg: string; border: string; dot: string }> = {
  neutral: { text: "text-muted", bg: "bg-surface-3", border: "border-border", dot: "bg-subtle" },
  info: { text: "text-accent", bg: "bg-accent-soft", border: "border-accent-line", dot: "bg-accent" },
  success: { text: "text-success", bg: "bg-success-soft", border: "border-success-line", dot: "bg-success" },
  warning: { text: "text-warning", bg: "bg-warning-soft", border: "border-warning-line", dot: "bg-warning" },
  danger: { text: "text-danger", bg: "bg-danger-soft", border: "border-danger-line", dot: "bg-danger" },
};
