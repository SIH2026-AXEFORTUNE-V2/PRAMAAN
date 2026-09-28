import { useEffect, type ReactNode } from "react";
import { useI18n } from "./index";

/** Loads the saved language before first paint and re-renders the whole app when it changes. */
export function LanguageRoot({ children }: { children: ReactNode }) {
  const lang = useI18n((s) => s.lang);
  const ready = useI18n((s) => s.ready);
  const init = useI18n((s) => s.init);
  useEffect(() => {
    void init();
  }, [init]);
  if (!ready) return <div className="h-full bg-bg" />;
  return <div key={lang} className="contents">{children}</div>;
}
