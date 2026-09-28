import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Monitor, Moon, Sun } from "lucide-react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import type { Settings } from "@/lib/types";
import { useAction } from "@/hooks/useAction";
import { useFetch } from "@/hooks/useFetch";
import { useApp, type ThemePref } from "@/store/app";
import { useDraft } from "@/store/draft";
import { Page } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Menu";
import { Skeleton, TextInput, Toggle } from "@/components/ui/misc";

const SECTIONS = ["Appearance", "Profile & workspace", "Security", "Model routing", "Language", "Notifications", "Audit", "Data retention", "Access control"];

function Section({ id, title, desc, children }: { id: string; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-4 p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {desc && <p className="mt-0.5 text-xs text-muted">{desc}</p>}
      <div className="mt-3">{children}</div>
    </Card>
  );
}

export function SettingsPage() {
  const { data, loading } = useFetch(api.settings);
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const loadConfig = useApp((s) => s.loadConfig);
  const config = useApp((s) => s.config);
  const setParam = useDraft((s) => s.setParam);
  const draftLang = useDraft((s) => s.params.language);
  const [v, setV] = useState<Settings | null>(null);
  useEffect(() => {
    if (data) setV(data.values);
  }, [data]);
  const save = useAction(async (s: Settings) => {
    const r = await api.saveSettings(s);
    setV(r.values);
    await loadConfig();
    setParam("classification", r.values.default_classification);
  }, { success: "Settings saved" });

  if (loading || !v) return <Page title="Settings"><Skeleton className="h-96 w-full" /></Page>;
  const dirty = JSON.stringify(v) !== JSON.stringify(data?.values);
  const up = <K extends keyof Settings>(k: K, val: Settings[K]) => setV({ ...v, [k]: val });
  const id = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, "-");

  return (
    <Page
      title="Settings"
      subtitle="Workspace preferences. Security-relevant changes are recorded in the audit log."
      actions={
        <Button variant="primary" disabled={!dirty} loading={save.pending} onClick={() => void save.run(v)}>
          Save changes
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-0 space-y-0.5">
            {SECTIONS.map((s) => (
              <li key={s}>
                <a href={`#${id(s)}`} className="block rounded-lg px-2.5 py-1.5 text-xs text-muted hover:bg-surface-3 hover:text-fg">
                  {s}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-4">
          <Section id="appearance" title="Appearance" desc="Theme applies to the entire application.">
            <div className="grid max-w-md grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
              {(
                [
                  ["light", "Light", Sun],
                  ["dark", "Dark", Moon],
                  ["system", "System", Monitor],
                ] as [ThemePref, string, typeof Sun][]
              ).map(([k, label, I]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={theme === k}
                  onClick={() => setTheme(k)}
                  className={cx("flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs", theme === k ? "border-accent bg-accent-soft text-accent" : "border-border hover:border-border-strong")}
                >
                  <I size={17} />
                  {label}
                </button>
              ))}
            </div>
          </Section>

          <Section id="profile-workspace" title="Profile & workspace" desc="The operator name is the actor recorded on approvals and audit events.">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-2xs text-muted">
                Operator name
                <TextInput className="mt-1" value={v.operator_name} onChange={(e) => up("operator_name", e.target.value)} />
              </label>
              <label className="text-2xs text-muted">
                Role
                <TextInput className="mt-1" value={v.operator_role} onChange={(e) => up("operator_role", e.target.value)} />
              </label>
              <label className="text-2xs text-muted">
                Workspace
                <TextInput className="mt-1" value={v.workspace_name} onChange={(e) => up("workspace_name", e.target.value)} />
              </label>
            </div>
          </Section>

          <Section id="security" title="Security" desc="Controls applied before any model call and before any release.">
            <div className="divide-y divide-border">
              <Toggle
                label="Neutralise embedded instructions"
                description="Detected prompt-injection text is removed from what the model sees and never used as evidence."
                checked={v.neutralise_injection}
                onChange={(x) => up("neutralise_injection", x)}
              />
              <Toggle
                label="Withhold credentials from model context"
                description="Passwords, API keys and tokens found in sources are replaced before the model gateway."
                checked={v.withhold_credentials}
                onChange={(x) => up("withhold_credentials", x)}
              />
              <Toggle label="Require human approval before export" description="Enforced by the server. Cannot be disabled." checked disabled onChange={() => undefined} />
              <div className="flex items-center justify-between gap-4 py-2.5">
                <span>
                  <span className="block text-xs font-medium">Default security classification</span>
                  <span className="block text-2xs text-muted">Pre-selected for new transformations; drives the release policy.</span>
                </span>
                <Select
                  variant="field"
                  label="Default classification"
                  value={v.default_classification}
                  options={config?.parameters.classification.options ?? ["Public", "Internal", "Confidential", "Restricted"]}
                  onChange={(x) => up("default_classification", x)}
                  className="w-44"
                  align="right"
                />
              </div>
            </div>
          </Section>

          <Section id="model-routing" title="Model routing" desc="Users choose what to create; the router chooses the model.">
            <p className="text-xs text-muted">
              Deployment: <b className="text-fg">{config?.deployment.label}</b> · {config?.deployment.detail}
            </p>
            <p className="mt-2 text-xs text-muted">
              Models are configured on the server (<code>HF_TEXT_MODEL</code>, <code>HF_VISION_MODEL</code>, <code>HF_ASR_MODEL</code>, or a self-hosted{" "}
              <code>MODEL_GATEWAY_URL</code>) so keys never reach the browser.{" "}
              <Link to="/agents" className="font-semibold text-accent hover:underline">
                View routing table
              </Link>
            </p>
          </Section>

          <Section id="language" title="Language" desc="Default output language for new transformations. Facts stay locked to the evidence ledger in every language.">
            <Select
              variant="field"
              label="Default output language"
              value={draftLang}
              options={config?.parameters.language.options ?? ["English"]}
              onChange={(x) => setParam("language", x)}
              className="w-56"
            />
          </Section>

          <Section id="notifications" title="Notifications">
            <div className="divide-y divide-border">
              <Toggle label="Items needing review" checked={v.notify_on_review} onChange={(x) => up("notify_on_review", x)} />
              <Toggle label="Agent and processing failures" checked={v.notify_on_failure} onChange={(x) => up("notify_on_failure", x)} />
              <Toggle label="Security events (injection, blocks)" checked={v.notify_on_security} onChange={(x) => up("notify_on_security", x)} />
            </div>
          </Section>

          <Section id="audit" title="Audit" desc="The audit log and provenance ledger are append-only. Source content is never written to them.">
            <label className="text-2xs text-muted">
              Audit page size
              <TextInput type="number" min={10} max={200} className="mt-1 w-32" value={v.audit_page_size} onChange={(e) => up("audit_page_size", Number(e.target.value))} />
            </label>
          </Section>

          <Section id="data-retention" title="Data retention">
            <label className="text-2xs text-muted">
              Retain transformations (days)
              <TextInput type="number" min={1} max={3650} className="mt-1 w-32" value={v.retention_days} onChange={(e) => up("retention_days", Number(e.target.value))} />
            </label>
            <p className="mt-2 text-2xs text-subtle">Recorded policy. Automatic purging is not scheduled in this build; delete transformations from the workspace.</p>
          </Section>

          <Section id="access-control" title="Access control">
            <p className="text-xs text-muted">
              Single-operator local mode. SSO, role-based approval (analyst vs approver) and separation of duties are not configured in this build.
            </p>
          </Section>
        </div>
      </div>
    </Page>
  );
}
