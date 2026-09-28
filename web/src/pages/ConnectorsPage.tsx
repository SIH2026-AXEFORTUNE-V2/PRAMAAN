import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Cloud, Database, FolderOpen, Globe, Library } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "@/lib/api";
import type { Connector } from "@/lib/types";
import { useFetch } from "@/hooks/useFetch";
import { Page } from "@/components/shell/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, IconTile } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Overlay";
import { Skeleton } from "@/components/ui/misc";
import { msg, tr } from "@/i18n";

const ICON: Record<string, ReactNode> = {
  "local-files": <FolderOpen size={17} />,
  url: <Globe size={17} />,
  "doc-repo": <Library size={17} />,
  "cloud-storage": <Cloud size={17} />,
  "knowledge-base": <Database size={17} />,
};

const STATUS: Record<Connector["status"], { tone: "success" | "neutral" | "warning"; label: string }> = {
  connected: { tone: "success", label: msg("Connected") },
  not_connected: { tone: "neutral", label: msg("Not connected") },
  configuration_required: { tone: "warning", label: msg("Configuration required") },
};

export function ConnectorsPage() {
  const { data, loading } = useFetch(api.connectors);
  const [open, setOpen] = useState<Connector | null>(null);
  const navigate = useNavigate();
  return (
    <Page title={tr("Connectors")} subtitle={tr("Where sources come from. Only connectors that are actually wired up are shown as connected.")}>
      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data ?? []).map((c) => {
            const s = STATUS[c.status];
            return (
              <Card key={c.id} className="flex flex-col p-4">
                <div className="flex items-start gap-3">
                  <IconTile tone={c.status === "connected" ? "accent" : "neutral"}>{ICON[c.id]}</IconTile>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{tr(c.name)}</p>
                    <Badge tone={s.tone} dot className="mt-1">
                      {tr(s.label)}
                    </Badge>
                  </div>
                </div>
                <p className="mt-3 flex-1 text-xs text-muted">{tr(c.description)}</p>
                <p className="mt-2 text-2xs text-subtle">{tr(c.detail)}</p>
                <div className="mt-3 border-t border-border pt-3">
                  {c.status === "connected" ? (
                    <Button size="sm" onClick={() => navigate("/workspace")}>
                      {tr("Use in workspace")}
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setOpen(c)}>
                      {c.status === "configuration_required" ? tr("Configure") : tr("Setup details")}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={tr(open?.name ?? "")} footer={<Button onClick={() => setOpen(null)}>{tr("Close")}</Button>}>
        <p className="text-xs text-muted">{tr(open?.detail ?? "")}</p>
        <p className="mt-3 text-xs text-muted">
          {tr("Connectors are configured by an administrator through environment variables on the server, so credentials never reach the browser. This build does not include this connector yet; it is listed so the integration surface is visible and honest.")}
        </p>
      </Modal>
    </Page>
  );
}
