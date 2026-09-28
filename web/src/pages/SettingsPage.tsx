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
import { LANGUAGES, msg, tr, useI18n } from "@/i18n";

const SECTIONS: [string, string][] = [
  ["appearance", msg("Appearance")],
  ["interface-language", msg("Interface language")],
  ["profile-workspace", msg("Profile & workspace")],
  ["security", msg("Security")],
  ["model-routing", msg("Model routing")],
  ["language", msg("Output language")],
  ["notifications", msg("Notifications")],
  ["audit", msg("Audit")],
  ["data-retention", msg("Data retention")],
  ["access-control", msg("Access control")],
];

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
  const lang = useI18n((st) => st.lang);
  const setLang = useI18n((st) => st.setLang);
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
  }, { success: tr("Settings saved") });

  if (loading || !v) return <Page title={tr("Settings")}><Skeleton className="h-96 w-full" /></Page>;
  const dirty = JSON.stringify(v) !== JSON.stringify(data?.values);
  const up = <K extends keyof Settings>(k: K, val: Settings[K]) => setV({ ...v, [k]: val });

  return (
    <Page
      title={tr("Settings")}
      subtitle={tr("Workspace preferences. Security-relevant changes are recorded in the audit log.")}
      actions={
        <Button variant="primary" disabled={!dirty} loading={save.pending} onClick={() => void save.run(v)}>
          {tr("Save changes")}
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <nav aria-label={tr("Settings sections")} className="hidden lg:block">
          <ul className="sticky top-0 space-y-0.5">
            {SECTIONS.map(([sid, s]) => (
              <li key={sid}>
                <a href={`#${sid}`} className="block rounded-lg px-2.5 py-1.5 text-xs text-muted hover:bg-surface-3 hover:text-fg">
                  {tr(s)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-4">
          <Section id="appearance" title={tr("Appearance")} desc={tr("Theme applies to the entire application.")}>
            <div className="grid max-w-md grid-cols-3 gap-2" role="radiogroup" aria-label={tr("Theme")}>
              {(
                [
                  ["light", tr("Light"), Sun],
                  ["dark", tr("Dark"), Moon],
                  ["system", tr("System"), Monitor],
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

          <Section id="interface-language" title={tr("Interface language")} desc={tr("Language of menus, labels and messages. Documents and generated artefacts follow each transformation's output language.")}>
            <div className="grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={tr("Interface language")}>
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  role="radio"
                  aria-checked={lang === l.code}
                  onClick={() => void setLang(l.code)}
                  className={cx("rounded-xl border px-3 py-2.5 text-left", lang === l.code ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong")}
                >
                  <span className={cx("block text-sm font-semibold", lang === l.code ? "text-accent" : "text-fg")}>{l.native}</span>
                  <span className="block text-xs text-muted">{l.name}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-subtle">{tr("Translations are machine-generated and can be corrected in web/src/i18n/locales.")}</p>
          </Section>

          <Section id="profile-workspace" title={tr("Profile & workspace")} desc={tr("The operator name is the actor recorded on approvals and audit events.")}>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-2xs text-muted">
                {tr("Operator name")}
                <TextInput className="mt-1" value={v.operator_name} onChange={(e) => up("operator_name", e.target.value)} />
              </label>
              <label className="text-2xs text-muted">
                {tr("Role")}
                <TextInput className="mt-1" value={v.operator_role} onChange={(e) => up("operator_role", e.target.value)} />
              </label>
              <label className="text-2xs text-muted">
                {tr("Workspace")}
                <TextInput className="mt-1" value={v.workspace_name} onChange={(e) => up("workspace_name", e.target.value)} />
              </label>
            </div>
          </Section>

          <Section id="security" title={tr("Security")} desc={tr("Controls applied before any model call and before any release.")}>
            <div className="divide-y divide-border">
              <Toggle
                label={tr("Neutralise embedded instructions")}
                description={tr("Detected prompt-injection text is removed from what the model sees and never used as evidence.")}
                checked={v.neutralise_injection}
                onChange={(x) => up("neutralise_injection", x)}
              />
              <Toggle
                label={tr("Withhold credentials from model context")}
                description={tr("Passwords, API keys and tokens found in sources are replaced before the model gateway.")}
                checked={v.withhold_credentials}
                onChange={(x) => up("withhold_credentials", x)}
              />
              <Toggle label={tr("Require human approval before export")} description={tr("Enforced by the server. Cannot be disabled.")} checked disabled onChange={() => undefined} />
              <div className="flex items-center justify-between gap-4 py-2.5">
                <span>
                  <span className="block text-xs font-medium">{tr("Default security classification")}</span>
                  <span className="block text-2xs text-muted">{tr("Pre-selected for new transformations; drives the release policy.")}</span>
                </span>
                <Select
                  variant="field"
                  label={tr("Default classification")}
                  value={v.default_classification}
                  options={config?.parameters.classification.options ?? [tr("Public"), tr("Internal"), tr("Confidential"), tr("Restricted")]}
                  onChange={(x) => up("default_classification", x)}
                  className="w-44"
                  align="right"
                />
              </div>
            </div>
          </Section>

          <Section id="model-routing" title={tr("Model routing")} desc={tr("Users choose what to create; the router chooses the model.")}>
            <p className="text-xs text-muted">
              {tr("Deployment")}: <b className="text-fg">{tr(config?.deployment.label ?? "")}</b> · {tr(config?.deployment.detail ?? "")}
            </p>
            <p className="mt-2 text-xs text-muted">
              {tr("Models and keys are configured on the server, so keys never reach the browser:")}{" "}
              <code>GROQ_API_KEY</code>, <code>HF_TOKEN</code>, <code>MODEL_GATEWAY_URL</code>.{" "}
              <Link to="/agents" className="font-semibold text-accent hover:underline">
                {tr("View routing table")}
              </Link>
            </p>
          </Section>

          <Section id="language" title={tr("Output language")} desc={tr("Default output language for new transformations. Facts stay locked to the evidence ledger in every language.")}>
            <Select
              variant="field"
              label={tr("Default output language")}
              value={draftLang}
              options={config?.parameters.language.options ?? ["English"]}
              onChange={(x) => setParam("language", x)}
              className="w-56"
            />
          </Section>

          <Section id="notifications" title={tr("Notifications")}>
            <div className="divide-y divide-border">
              <Toggle label={tr("Items needing review")} checked={v.notify_on_review} onChange={(x) => up("notify_on_review", x)} />
              <Toggle label={tr("Agent and processing failures")} checked={v.notify_on_failure} onChange={(x) => up("notify_on_failure", x)} />
              <Toggle label={tr("Security events (injection, blocks)")} checked={v.notify_on_security} onChange={(x) => up("notify_on_security", x)} />
            </div>
          </Section>

          <Section id="audit" title={tr("Audit")} desc={tr("The audit log and provenance ledger are append-only. Source content is never written to them.")}>
            <label className="text-2xs text-muted">
              {tr("Audit page size")}
              <TextInput type="number" min={10} max={200} className="mt-1 w-32" value={v.audit_page_size} onChange={(e) => up("audit_page_size", Number(e.target.value))} />
            </label>
          </Section>

          <Section id="data-retention" title={tr("Data retention")}>
            <label className="text-2xs text-muted">
              {tr("Retain transformations (days)")}
              <TextInput type="number" min={1} max={3650} className="mt-1 w-32" value={v.retention_days} onChange={(e) => up("retention_days", Number(e.target.value))} />
            </label>
            <p className="mt-2 text-2xs text-subtle">{tr("Recorded policy. Automatic purging is not scheduled in this build; delete transformations from the workspace.")}</p>
          </Section>

          <Section id="access-control" title={tr("Access control")}>
            <p className="text-xs text-muted">
              {tr("Single-operator local mode. SSO, role-based approval (analyst vs approver) and separation of duties are not configured in this build.")}
            </p>
          </Section>
        </div>
      </div>
    </Page>
  );
}
