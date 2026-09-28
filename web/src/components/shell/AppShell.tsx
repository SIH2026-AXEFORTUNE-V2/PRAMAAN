import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { cx } from "@/lib/format";
import { useApp } from "@/store/app";
import { Toaster } from "../ui/Toaster";
import { ClaimDrawer } from "../evidence/ClaimDrawer";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell() {
  const collapsed = useApp((s) => s.sidebarCollapsed);
  const toggle = useApp((s) => s.toggleSidebar);
  const mobileOpen = useApp((s) => s.mobileNavOpen);
  const setMobile = useApp((s) => s.setMobileNav);
  const loadConfig = useApp((s) => s.loadConfig);
  const refreshList = useApp((s) => s.refreshList);
  const configError = useApp((s) => s.configError);
  const loc = useLocation();

  useEffect(() => {
    void loadConfig();
    void refreshList();
  }, [loadConfig, refreshList]);

  useEffect(() => setMobile(false), [loc.pathname, setMobile]);

  return (
    <div className="flex h-full flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <TopBar onToggleSidebar={toggle} onOpenMobileNav={() => setMobile(true)} />
      {configError && (
        <div className="border-b border-danger-line bg-danger-soft px-4 py-2 text-xs text-danger" role="alert">
          {configError}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <aside className={cx("hidden shrink-0 border-r border-border bg-surface transition-[width] duration-150 lg:block", collapsed ? "w-[64px]" : "w-[264px]")}>
          <Sidebar collapsed={collapsed} />
        </aside>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="absolute inset-0 bg-[var(--overlay)]" onClick={() => setMobile(false)} />
            <aside className="animate-fade-in absolute inset-y-0 left-0 w-[272px] border-r border-border bg-surface shadow-lg">
              <Sidebar collapsed={false} onNavigate={() => setMobile(false)} />
            </aside>
          </div>
        )}
        <main id="main" className="min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <ClaimDrawer />
      <Toaster />
    </div>
  );
}

/** Standard page frame for non-workspace screens. */
export function Page({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-fg">{title}</h1>
            {subtitle && <p className="mt-1.5 max-w-[72ch] text-sm text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}
