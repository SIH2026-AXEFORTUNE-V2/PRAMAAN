/* Domain types mirroring the PRAMAAN API (app/orchestrator.py). */

export type OutputType =
  | "executive_summary"
  | "advisory"
  | "linkedin"
  | "twitter"
  | "infographic"
  | "presentation"
  | "video";

export type TaskStatus = "queued" | "running" | "completed" | "failed" | "blocked" | "needs_review";
export type ArtifactStatus =
  | "queued"
  | "generating"
  | "generated"
  | "verified"
  | "needs_review"
  | "blocked"
  | "stale"
  | "approved"
  | "rejected"
  | "exported"
  | "failed";
export type TransformationStatus = "running" | "awaiting_review" | "approved" | "reviewed" | "partial" | "failed";
export type ClaimStatus = "verified" | "needs_review" | "unsupported" | "conflict" | "human_verified" | "superseded" | "rejected";
export type Modality = "confirmed" | "probable" | "possible" | "suspected" | "unverified" | "estimated" | "reported" | "alleged";
export type RefStatus = "grounded" | "review" | "drift" | "unsupported" | "uncertainty";
export type PolicyAction = "ALLOW" | "MASK" | "REDACT" | "RESTRICT" | "REVIEW" | "BLOCK";
export type SecurityClass = "pii" | "credential" | "infrastructure" | "threat_indicator" | "location" | "marking" | "injection";

export interface Params {
  audience: string;
  audience_custom: string;
  tone: string;
  language: string;
  detail: string;
  objective: string;
  style: string;
  classification: string;
  video_duration: string;
  twitter_mode: string;
  slide_count: string;
  instructions: string;
}

export interface ParameterMeta {
  label: string;
  options: string[];
  default: string;
}

export interface OutputTypeMeta {
  key: OutputType;
  label: string;
  agent: string;
  description: string;
  exports: string[];
}

export interface AppConfig {
  app: string;
  descriptor: string;
  version: string;
  engine: { route: "live" | "offline"; mode: string; model: string; fallback: string | null };
  deployment: { mode: "on_prem" | "hybrid" | "offline"; label: string; detail: string };
  secure_mode: { enabled: boolean; injection_defence: boolean; credential_withholding: boolean; approval_gate: boolean };
  max_upload_mb: number;
  output_types: OutputTypeMeta[];
  parameters: Record<keyof Omit<Params, "audience_custom" | "instructions">, ParameterMeta>;
  operator: { name: string; role: string };
  workspace: string;
  image_generation: { available: boolean; model: string | null };
  video_production: { available: boolean; motion: boolean; narration_model: string; motion_model: string | null };
}

export interface SourceInfo {
  id: string;
  kind: string;
  name: string;
  mime: string;
  url: string;
  size_bytes: number;
  sha256: string;
  uploaded_at: string;
  chars: number;
  words: number;
  page_count: number | null;
  has_media: boolean;
  notes: string[];
  status: "received" | "parsed" | "failed";
}

export interface Task {
  id: string;
  key: string;
  agent: string;
  title: string;
  stage: string;
  description: string;
  status: TaskStatus;
  progress: number;
  detail: string;
  started: string | null;
  ended: string | null;
  seconds: number | null;
  capability: string;
  model: string | null;
  tokens: number;
  error: string | null;
  depends_on: string[];
  artifact: OutputType | null;
}

export interface PlanStep {
  step: number;
  stage: string;
  title: string;
  detail: string;
  status: TaskStatus;
  tasks: string[];
}

export interface Claim {
  claim_id: string;
  claim: string;
  label: string;
  category: string;
  entity: string;
  attribute: string;
  value: string;
  normalized: { type: "date" | "number" | "text"; value: string | number; unit?: string };
  display_value: string;
  modality: Modality;
  source_id: string;
  source_name: string;
  page: number | null;
  char_span: [number, number] | null;
  location: { bbox: [number, number, number, number]; page_size: [number, number] } | null;
  evidence_text: string;
  status: ClaimStatus;
  grounding_note: string;
  extracted_by: string;
  model: string | null;
  corroborated_by: { source_id: string; source_name: string; page: number | null; evidence_text: string; modality?: Modality }[];
  version: number;
  history: { version: number; at: string; by: string; note: string; before: { display_value: string; modality: string } }[];
}

export interface SourceConflict {
  id: string;
  attribute: string;
  status: "unresolved" | "resolved";
  claim_ids: string[];
  values: { claim_id: string; source_id: string; source_name: string; value: string; page: number | null; evidence_text: string }[];
  resolution: { claim_id: string; value: string; source_name: string; by: string; at: string; note: string } | null;
}

export interface RefIssue {
  kind: "drift" | "unsupported" | "uncertainty";
  claim_id?: string;
  expected?: string;
  found?: string;
  detail: string;
}

export interface ClaimRef {
  ref_id: string;
  path: string;
  offset: number;
  sentence: string;
  claim_ids: string[];
  observed: Record<string, string>;
  status: RefStatus;
  issues: RefIssue[];
  modality: Modality;
}

export interface Verification {
  refs: ClaimRef[];
  counts: Record<RefStatus, number>;
  claims_used: string[];
  status: "passed" | "needs_review" | "failed";
}

export interface SecurityFinding {
  id?: string;
  category: string;
  class: SecurityClass;
  label: string;
  text: string;
  span: [number, number];
  path?: string;
  action?: PolicyAction;
  reason?: string;
  released_as?: string | null;
  source_id?: string;
  source_name?: string;
  page?: number | null;
}

export interface ArtifactSecurity {
  exposure: "public" | "leadership" | "technical";
  exposure_label: string;
  findings: SecurityFinding[];
  counts: Record<SecurityClass, number>;
  actions: Record<PolicyAction, number>;
  blocked: boolean;
  review_required: boolean;
  status: "passed" | "review" | "blocked";
}

export interface RedTeam {
  factual_drift: number;
  unsupported_claims: number;
  cross_output_conflicts: number;
  security_leaks: number;
  uncertainty_violations: number;
  status: "passed" | "failed" | "pending";
}

export interface ApprovalState {
  status: "pending" | "approved" | "rejected" | "changes_requested";
  by: string | null;
  at: string | null;
  comment: string;
  history: { status: string; by: string | null; at: string | null; comment: string }[];
  ledger_index?: number;
}

export interface VersionMeta {
  version: number;
  created_at: string;
  author: string;
  model: string | null;
  reason: string;
  hash: string;
}

// Artefact content is schema-driven JSON; renderers narrow it per type.
export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type Content = { [k: string]: Json };

export interface Illustration {
  slot: string;
  label: string;
  brief: string;
  prompt: string;
  removed: string[];
  model: string;
  sha256: string;
  created_at: string;
  bytes: number;
}

export interface Artifact {
  type: OutputType;
  label: string;
  agent: string;
  description: string;
  exports: string[];
  status: ArtifactStatus;
  version: number;
  content: Content | null;
  released: Content | null;
  verification: Verification | null;
  security: ArtifactSecurity | null;
  red_team: RedTeam | null;
  format_warnings: string[];
  approval: ApprovalState;
  output_hash: string | null;
  versions: VersionMeta[];
  stale: { claim_id: string; reason: string; old_surfaces: string[]; new_value: string } | null;
  error: string | null;
  exported: { version: number; format: string; at: string; by: string }[];
  illustrations?: Illustration[];
  video_render?: VideoRender;
}

export interface VideoRender {
  sha256: string;
  bytes: number;
  seconds: number;
  created_at: string;
  artifact_version: number;
  resolution: string;
  models: { narration: string; motion: string | null; stills: string | null };
  scenes: { scene: number; title: string; source: "motion" | "still" | "title card"; prompt: string }[];
}

export interface ConsistencyConflict {
  id: string;
  claim_id: string;
  attribute: string;
  source_value: string;
  observations: { artifact: OutputType; value: string; path: string; sentence: string; matches: boolean }[];
  affected: OutputType[];
  dependents: OutputType[];
  status: "open";
}

export interface Message {
  role: "user" | "orchestrator";
  author: string;
  text: string;
  ts: string;
  kind?: "plan" | "result" | "reply";
  sources?: string[];
}

export interface Contract {
  transformation_id: string;
  version: number;
  audience: string;
  tone: string;
  language: string;
  detail_level: string;
  objective: string;
  style: string;
  security_classification: string;
  requested_outputs: string[];
  truth_constraints: Record<string, boolean>;
  security_constraints: Record<string, boolean>;
  signed_at: string;
  sources: { id: string; name: string; sha256: string }[];
}

export interface Transformation {
  id: string;
  created_at: string;
  updated_at: string;
  status: TransformationStatus;
  error: string | null;
  title: string;
  request: string;
  params: Params;
  contract: Contract;
  engine: AppConfig["engine"];
  sources: SourceInfo[];
  messages: Message[];
  tasks: Task[];
  plan: PlanStep[];
  summary: string;
  claims: Claim[];
  source_conflicts: SourceConflict[];
  artifacts: Partial<Record<OutputType, Artifact>>;
  consistency: { status: "pending" | "passed" | "failed"; conflicts: ConsistencyConflict[]; checked_at: string | null; claims_compared?: number };
  red_team: RedTeam & { checked_at?: string; failed_artifacts?: string[] };
  security: {
    status: "pending" | "passed" | "review";
    source_findings: SecurityFinding[];
    summary: Partial<Record<SecurityClass, number>>;
    injections: { span: [number, number]; text: string; trigger: string; action: string; reason: string; source_name: string; page: number | null }[];
    model_context_notes: string[];
  };
  provenance: {
    transformation_id: string;
    source_hashes: Record<string, string>;
    contract_hash: string | null;
    evidence_hash: string | null;
    ledger_entries: number[];
  };
  total_seconds: number | null;
}

export interface TransformationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  status: TransformationStatus;
  outputs: OutputType[];
  source_names: string[];
  approved: number;
  total: number;
  red_team: string | null;
}

export interface AuditEvent {
  id: string;
  ts: string;
  actor: string;
  actor_type: "user" | "agent" | "system";
  action: string;
  object: string;
  status: "success" | "warning" | "failed" | "info";
  transformation_id: string | null;
  detail: string;
  kind?: "failure" | "security" | "review" | "info";
}

export interface LedgerEntry {
  index: number;
  ts: string;
  kind: string;
  transformation_id: string;
  actor: string;
  payload: Record<string, Json>;
  prev_hash: string;
  entry_hash: string;
}

export interface AgentInfo {
  name: string;
  role: string;
  capability: string;
  inputs: string[];
  outputs: string[];
  kind: "control" | "perception" | "evidence" | "specialist" | "verification";
  runs: number;
  failed: number;
  last_run: string | null;
  transformations: number;
}

export interface ModelRoute {
  capability: string;
  label: string;
  models: string[];
  status: "active" | "offline" | "not_configured";
  via: string;
  note: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  params: Partial<Params>;
  outputs: OutputType[];
  structure: string[];
  security_policy: string;
  evidence: string;
}

export interface Connector {
  id: string;
  name: string;
  description: string;
  status: "connected" | "not_connected" | "configuration_required";
  detail: string;
}

export interface Metric {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  basis: string;
  lower_is_better?: boolean;
}

export interface Settings {
  workspace_name: string;
  operator_name: string;
  operator_role: string;
  default_classification: string;
  neutralise_injection: boolean;
  withhold_credentials: boolean;
  require_approval_for_export: boolean;
  retention_days: number;
  notify_on_review: boolean;
  notify_on_failure: boolean;
  notify_on_security: boolean;
  audit_page_size: number;
}

export interface DemoSource {
  file: string;
  description: string;
  size_bytes: number;
  url: string;
}

export interface ArtifactRow {
  transformation_id: string;
  transformation_title: string;
  type: OutputType;
  label: string;
  status: ArtifactStatus;
  version: number;
  approval: ApprovalState["status"];
  approved_by: string | null;
  counts: Record<RefStatus, number> | null;
  output_hash: string | null;
  updated_at: string;
  exposure: string | null;
}
