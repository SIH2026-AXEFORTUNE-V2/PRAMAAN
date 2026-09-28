import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import type { Transformation } from "@/lib/types";
import { useApp } from "@/store/app";

export function isBusy(t: Transformation | undefined): boolean {
  if (!t) return false;
  return (
    t.status === "running" ||
    t.tasks.some((x) => x.status === "running") ||
    Object.values(t.artifacts).some((a) => a && (a.status === "queued" || a.status === "generating"))
  );
}

/**
 * Subscribes to one transformation. Polls the server while agents are running and stops when idle,
 * so the workspace, task panel and artefact views all render the same server state.
 */
export function useTransformation(id: string | undefined) {
  const t = useApp((s) => (id ? s.transformations[id] : undefined));
  const fetchT = useApp((s) => s.fetchTransformation);
  const refreshList = useApp((s) => s.refreshList);
  const refreshNotifications = useApp((s) => s.refreshNotifications);
  const [error, setError] = useState<ApiError | null>(null);
  const [kick, setKick] = useState(0);
  const wasBusy = useRef(false);
  const busy = isBusy(t);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      await fetchT(id);
      setError(null);
    } catch (e) {
      setError(e as ApiError);
    }
    setKick((k) => k + 1);
  }, [id, fetchT]);

  useEffect(() => {
    if (!id) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id || !busy) return;
    const h = window.setInterval(() => {
      fetchT(id).catch((e: unknown) => setError(e as ApiError));
    }, 1100);
    return () => window.clearInterval(h);
  }, [id, busy, fetchT, kick]);

  useEffect(() => {
    if (wasBusy.current && !busy) {
      void refreshList();
      void refreshNotifications();
    }
    wasBusy.current = busy;
  }, [busy, refreshList, refreshNotifications]);

  return useMemo(() => ({ t, busy, error, refresh }), [t, busy, error, refresh]);
}
