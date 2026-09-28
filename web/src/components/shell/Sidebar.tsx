import { useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Boxes,
  ChartNoAxesColumn,
  ChevronDown,
  Clock3,
  FileClock,
  Files,
  LayoutDashboard,
  LayoutTemplate,
  Pin,
  PinOff,
  Plug,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import { cx, relative } from "@/lib/format";
import { TRANSFORMATION_STATUS, TONE_CLASSES } from "@/lib/status";
import { useApp } from "@/store/app";
import { useDraft } from "@/store/draft";

const NAV = [
  { to: "/workspace", label: "Dashboard", icon: LayoutDashboard },
  { to: "/artifacts", label: "Artifacts", icon: Files },
  { to: "/agents", label: "Skills / Agents", icon: Boxes },
  { to: "/connectors", label: "Connectors", icon: Plug },
  { to: "/audit", label: "Audit Logs", icon: FileClock },
  { to: "/templates", label: "Templates", icon: LayoutTemplate },
  { to: "/evaluation", label: "Evaluation", icon: ChartNoAxesColumn },
  { to: "/settings", label: "Settings", icon: Settings },
];

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1 px-3 text-xs font-semibold text-subtle hover:text-muted"
      >
        {title}
        <ChevronDown size={12} className={cx("transition-transform", !open && "-rotate-90")} />
      </button>
      {open && <div className="mt-1.5 space-y-0.5">{children}</div>}
    </div>
  );
}

export function Sidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const list = useApp((s) => s.list);
  const pinned = useApp((s) => s.pinned);
  const togglePin = useApp((s) => s.togglePin);
  const resetDraft = useDraft((s) => s.reset);
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return list;
    return list.filter((t) => `${t.id} ${t.title} ${t.source_names.join(" ")}`.toLowerCase().includes(ql));
  }, [list, q]);
  const pinnedRows = list.filter((t) => pinned.includes(t.id));
  const recent = filtered.slice(0, q ? 12 : 6);

  const item = (active: boolean) =>
    cx(
      "group flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
      active ? "bg-accent-soft font-semibold text-accent" : "text-muted hover:bg-surface-3 hover:text-fg",
      collapsed && "justify-center px-0",
    );

  return (
    <nav aria-label="Primary" className="flex h-full flex-col overflow-y-auto px-2.5 pt-3 pb-4">
      {!collapsed && (
        <label className="relative mb-2 block">
          <span className="sr-only">Search transformations</span>
          <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search transformations…"
            className="h-9 w-full rounded-lg border border-border bg-surface-2 pr-2 pl-8 text-sm placeholder:text-subtle focus:border-accent focus:bg-surface focus:outline-none"
          />
        </label>
      )}
      <button
        type="button"
        onClick={() => {
          resetDraft();
          navigate("/workspace");
          onNavigate?.();
        }}
        className={cx(item(false), "mb-1 font-medium text-fg")}
        title="New transformation"
      >
        <Plus size={16} />
        {!collapsed && "New transformation"}
      </button>
      <div className="space-y-0.5">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to !== "/workspace"} onClick={onNavigate} className={({ isActive }) => item(isActive)} title={collapsed ? label : undefined}>
            <Icon size={16} strokeWidth={1.8} aria-hidden />
            {!collapsed && label}
          </NavLink>
        ))}
      </div>

      {!collapsed && (
        <>
          <Section title="Pinned">
            <NavLink to="/about" onClick={onNavigate} className={({ isActive }) => item(isActive)}>
              <BookOpen size={15} aria-hidden />
              <span className="truncate">Project overview</span>
            </NavLink>
            {pinnedRows.map((t) => (
              <div key={t.id} className="group relative">
                <NavLink to={`/workspace/${t.id}`} onClick={onNavigate} className={({ isActive }) => cx(item(isActive), "pr-8")}>
                  <Pin size={14} aria-hidden />
                  <span className="truncate">{t.title}</span>
                </NavLink>
                <button
                  type="button"
                  aria-label={`Unpin ${t.title}`}
                  onClick={() => togglePin(t.id)}
                  className="absolute top-1/2 right-1.5 hidden -translate-y-1/2 rounded p-1 text-subtle group-hover:block hover:text-fg"
                >
                  <PinOff size={12} />
                </button>
              </div>
            ))}
          </Section>

          <Section title={q ? `Results (${filtered.length})` : "Recent"}>
            {recent.length === 0 && <p className="px-2.5 text-2xs text-subtle">{q ? "No matches." : "No transformations yet."}</p>}
            {recent.map((t) => {
              const st = TRANSFORMATION_STATUS[t.status];
              return (
                <NavLink
                  key={t.id}
                  to={`/workspace/${t.id}`}
                  onClick={onNavigate}
                  className={({ isActive }) => cx(item(isActive), "h-auto py-1.5")}
                  title={`${t.id} · ${st.label}`}
                >
                  <Clock3 size={14} className="shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{t.title}</span>
                    <span className="flex items-center gap-2 text-2xs font-normal text-subtle">
                      <span className={cx("h-1.5 w-1.5 rounded-full", TONE_CLASSES[st.tone].dot)} aria-hidden />
                      <span className="font-mono">{t.id}</span>
                      <span>{relative(t.created_at)}</span>
                    </span>
                  </span>
                </NavLink>
              );
            })}
          </Section>
        </>
      )}
    </nav>
  );
}
