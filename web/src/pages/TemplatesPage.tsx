import { useNavigate } from "react-router-dom";
import { ShieldCheck, FileCheck2 } from "lucide-react";
import { api } from "@/lib/api";
import { OUTPUT_SHORT, OutputIcon } from "@/lib/outputs";
import type { Template } from "@/lib/types";
import { useFetch } from "@/hooks/useFetch";
import { useApp } from "@/store/app";
import { DEFAULT_PARAMS, useDraft } from "@/store/draft";
import { Page } from "@/components/shell/AppShell";
import { Tag } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/misc";

function TemplateCard({ t, onUse }: { t: Template; onUse: () => void }) {
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-center gap-1.5 text-accent">
        {t.outputs.map((o) => (
          <OutputIcon key={o} type={o} size={15} />
        ))}
      </div>
      <p className="mt-2 text-sm font-semibold">{t.name}</p>
      <p className="mt-0.5 text-xs text-muted">{t.description}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-2xs">
        {(["audience", "tone", "objective", "detail", "style", "classification"] as const).map((k) => (
          <div key={k} className="flex justify-between gap-2 border-b border-border py-0.5">
            <dt className="text-subtle capitalize">{k}</dt>
            <dd className="truncate text-fg">{t.params[k]}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-2xs text-muted">
        <b className="text-fg">Structure:</b> {t.structure.join(" · ")}
      </p>
      <p className="mt-1.5 flex gap-1.5 text-2xs text-muted">
        <ShieldCheck size={12} className="mt-0.5 shrink-0 text-accent" /> {t.security_policy}
      </p>
      <p className="mt-1 flex gap-1.5 text-2xs text-muted">
        <FileCheck2 size={12} className="mt-0.5 shrink-0 text-success" /> {t.evidence}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        {t.outputs.map((o) => (
          <Tag key={o}>{OUTPUT_SHORT[o]}</Tag>
        ))}
        <Button size="sm" variant="primary" className="ml-auto" onClick={onUse}>
          Use template
        </Button>
      </div>
    </Card>
  );
}

export function TemplatesPage() {
  const { data, loading } = useFetch(api.templates);
  const set = useDraft((s) => s.set);
  const toast = useApp((s) => s.toast);
  const navigate = useNavigate();
  return (
    <Page title="Templates" subtitle="Reusable transformation contracts: audience, tone, objective, output structure, security policy and evidence requirements.">
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data ?? []).map((t) => (
            <TemplateCard
              key={t.id}
              t={t}
              onUse={() => {
                set({ params: { ...DEFAULT_PARAMS, ...t.params }, outputs: t.outputs, templateId: t.id });
                toast({ tone: "info", title: `${t.name} applied`, body: "Configuration and outputs set. Add a source to start." });
                navigate("/workspace");
              }}
            />
          ))}
        </div>
      )}
    </Page>
  );
}
