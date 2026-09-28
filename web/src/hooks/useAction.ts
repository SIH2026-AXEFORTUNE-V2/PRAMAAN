import { useCallback, useState } from "react";
import { useApp } from "@/store/app";

/** Wraps a mutation: tracks pending state and reports failures as toasts. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>, opts: { success?: string; errorTitle?: string } = {}) {
  const toast = useApp((s) => s.toast);
  const [pending, setPending] = useState(false);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setPending(true);
      try {
        const r = await fn(...args);
        if (opts.success) toast({ tone: "success", title: opts.success });
        return r;
      } catch (e) {
        toast({ tone: "danger", title: opts.errorTitle ?? "Action failed", body: (e as Error).message });
        return undefined;
      } finally {
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn, toast, opts.success, opts.errorTitle],
  );
  return { run, pending };
}
