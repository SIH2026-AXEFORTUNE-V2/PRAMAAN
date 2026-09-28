/* Centralised API layer. Every network call in the app goes through here. */
import type {
  AgentInfo,
  ArtifactRow,
  AppConfig,
  AuditEvent,
  Connector,
  Content,
  DemoSource,
  LedgerEntry,
  Metric,
  ModelRoute,
  OutputType,
  Params,
  Settings,
  Template,
  Transformation,
  TransformationSummary,
  VersionMeta,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, "The PRAMAAN server is not reachable. Check that it is running.");
  }
  if (!res.ok) {
    let message = res.statusText || `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") message = body.detail;
      else if (Array.isArray(body.detail)) message = "The request was not valid.";
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const T = (id: string) => `/api/transformations/${encodeURIComponent(id)}`;

export interface CreatePayload {
  files: File[];
  text: string;
  url: string;
  request: string;
  outputs: OutputType[];
  params: Partial<Params>;
}

export const api = {
  config: () => request<AppConfig>("/api/config"),
  samples: () => request<DemoSource[]>("/api/samples"),
  async sampleFile(s: DemoSource): Promise<File> {
    const res = await fetch(s.url);
    if (!res.ok) throw new ApiError(res.status, "Could not load the demo source.");
    const blob = await res.blob();
    return new File([blob], s.file, { type: blob.type || (s.file.endsWith(".pdf") ? "application/pdf" : "text/plain") });
  },

  list: () => request<TransformationSummary[]>("/api/transformations"),
  artifacts: () => request<ArtifactRow[]>("/api/artifacts"),
  get: (id: string) => request<Transformation>(T(id)),
  create(p: CreatePayload) {
    const fd = new FormData();
    p.files.forEach((f) => fd.append("files", f));
    fd.append("text", p.text);
    fd.append("url", p.url);
    fd.append("request", p.request);
    fd.append("outputs", JSON.stringify(p.outputs));
    fd.append("params", JSON.stringify(p.params));
    return request<Transformation>("/api/transformations", { method: "POST", body: fd });
  },
  retry: (id: string) => request<Transformation>(`${T(id)}/retry`, { method: "POST" }),
  remove: (id: string) => request<{ deleted: string }>(T(id), { method: "DELETE" }),
  message: (id: string, text: string) => request<{ accepted: boolean }>(`${T(id)}/messages`, json("POST", { text })),
  applyContract: (id: string, params: Partial<Params>) =>
    request<{ accepted: boolean }>(`${T(id)}/contract`, json("PUT", { params })),

  updateClaim: (id: string, cid: string, body: { value?: string; modality?: string; note: string }) =>
    request<{ dependents: OutputType[]; transformation: Transformation }>(`${T(id)}/claims/${cid}`, json("PATCH", body)),
  regenerateStale: (id: string) => request<{ accepted: boolean; artifacts: OutputType[] }>(`${T(id)}/regenerate-stale`, { method: "POST" }),
  resolveSourceConflict: (id: string, scid: string, claim_id: string, note: string) =>
    request<{ dependents: OutputType[]; transformation: Transformation }>(
      `${T(id)}/source-conflicts/${scid}/resolve`,
      json("POST", { claim_id, note }),
    ),
  repairConflict: (id: string, cxid: string) =>
    request<{ accepted: boolean; artifacts: OutputType[] }>(`${T(id)}/consistency/${cxid}/repair`, { method: "POST" }),

  regenerate: (id: string, o: OutputType, instruction: string) =>
    request<{ accepted: boolean }>(`${T(id)}/artifacts/${o}/regenerate`, json("POST", { instruction })),
  repairUncertainty: (id: string, o: OutputType) =>
    request<{ accepted: boolean }>(`${T(id)}/artifacts/${o}/repair-uncertainty`, { method: "POST" }),
  edit: (id: string, o: OutputType, content: Content, note: string) =>
    request<Transformation>(`${T(id)}/artifacts/${o}`, json("PUT", { content, note })),
  simulateDrift: (id: string, o: OutputType) =>
    request<{ change: { claim_id: string; from: string; to: string; path: string }; transformation: Transformation }>(
      `${T(id)}/artifacts/${o}/simulate-drift`,
      { method: "POST" },
    ),
  decide: (id: string, o: OutputType, decision: "approve" | "reject" | "request_changes", comment: string) =>
    request<Transformation>(`${T(id)}/artifacts/${o}/approval`, json("POST", { decision, comment })),
  version: (id: string, o: OutputType, v: number) =>
    request<VersionMeta & { content: Content }>(`${T(id)}/artifacts/${o}/versions/${v}`),

  exportUrl: (id: string, o: OutputType, fmt: string) => `${T(id)}/artifacts/${o}/export.${fmt}`,
  bundleUrl: (id: string) => `${T(id)}/bundle.zip`,
  previewSvgUrl: (id: string, o: OutputType, version: number, released = true) =>
    `${T(id)}/artifacts/${o}/preview.svg?released=${released}&v=${version}`,
  pageImageUrl: (id: string, sid: string, page: number) => `${T(id)}/sources/${sid}/pages/${page}.png`,
  sourceText: (id: string, sid: string, start: number, end: number) =>
    request<{ text: string; start: number; end: number; length: number; name: string }>(
      `${T(id)}/sources/${sid}/text?start=${start}&end=${end}`,
    ),

  audit: (q: { page: number; size: number; transformation_id?: string; q?: string; status?: string; actor_type?: string }) => {
    const sp = new URLSearchParams();
    Object.entries(q).forEach(([k, v]) => v !== undefined && v !== "" && sp.set(k, String(v)));
    return request<{ total: number; page: number; size: number; items: AuditEvent[] }>(`/api/audit?${sp}`);
  },
  ledger: (transformation_id = "") =>
    request<{ verification: { valid: boolean; entries: number; broken_at: number | null; head: string }; entries: LedgerEntry[]; note: string }>(
      `/api/ledger?transformation_id=${encodeURIComponent(transformation_id)}`,
    ),
  notifications: () => request<AuditEvent[]>("/api/notifications"),
  agents: () => request<AgentInfo[]>("/api/agents"),
  models: () => request<{ deployment: AppConfig["deployment"]; routes: ModelRoute[] }>("/api/models"),
  templates: () => request<Template[]>("/api/templates"),
  connectors: () => request<Connector[]>("/api/connectors"),
  evaluation: () => request<{ label: string; runs: number; metrics: Metric[] }>("/api/evaluation"),
  settings: () => request<{ values: Settings; locked: string[] }>("/api/settings"),
  saveSettings: (s: Partial<Settings>) => request<{ values: Settings; locked: string[] }>("/api/settings", json("PUT", s)),
};
