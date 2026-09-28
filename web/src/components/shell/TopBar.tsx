import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Lock, Menu, Monitor, Moon, PanelLeft, Server, Sun } from "lucide-react";
import { api } from "@/lib/api";
import { cx, relative } from "@/lib/format";
import { useApp, type ThemePref } from "@/store/app";
import { IconButton } from "../ui/Button";
import { BrandMark } from "./Brand";

function Popover({ open, onClose, children, className }: { open: boolean; onClose: () => void; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.parentElement?.contains(e.target as Node) && onClose();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className={cx("animate-fade-in absolute top-full right-0 z-50 mt-2 rounded-xl border border-border bg-surface shadow-lg", className)}>
      {children}
    </div>
  );
}

function PostureChip() {
  const config = useApp((s) => s.config);
  const [open, setOpen] = useState(false);
  if (!config) return null;
  const d = config.deployment;
  const sm = config.secure_mode;
  return (
    <div className="relative hidden items-center gap-1.5 md:flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cx(
          "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-2xs font-semibold",
          d.mode === "on_prem" ? "border-success-line bg-success-soft text-success" : "border-border bg-surface-2 text-muted",
        )}
      >
        <Server size={13} /> {d.label}
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-accent-line bg-accent-soft px-2 text-2xs font-semibold text-accent"
      >
        <Lock size={12} /> Secure Mode
      </button>
      <Popover open={open} onClose={() => setOpen(false)} className="w-80 p-4">
        <p className="text-xs font-semibold">Deployment · {d.label}</p>
        <p className="mt-1 text-2xs leading-relaxed text-muted">{d.detail}</p>
        <div className="my-3 h-px bg-border" />
        <p className="text-xs font-semibold">Secure Mode controls</p>
        <ul className="mt-2 space-y-1.5 text-2xs">
          {[
            ["Source treated as untrusted data", true],
            ["Embedded instructions neutralised", sm.injection_defence],
            ["Credentials withheld from model context", sm.credential_withholding],
            ["Audience-aware release policy", true],
            ["Human approval required before export", sm.approval_gate],
          ].map(([label, on]) => (
            <li key={String(label)} className="flex items-center gap-2">
              <span className={cx("h-1.5 w-1.5 rounded-full", on ? "bg-success" : "bg-warning")} />
              <span className={on ? "text-fg" : "text-warning"}>
                {label}
                {!on && " (off)"}
              </span>
            </li>
          ))}
        </ul>
        <div className="my-3 h-px bg-border" />
        <p className="text-2xs text-muted">
          Engine: <span className="text-fg">{config.engine.route === "live" ? config.engine.model : "Offline extractive engine"}</span>
        </p>
        <Link to="/settings" onClick={() => setOpen(false)} className="mt-2 inline-block text-2xs font-semibold text-accent hover:underline">
          Security settings
        </Link>
      </Popover>
    </div>
  );
}

function Notifications() {
  const items = useApp((s) => s.notifications);
  const seen = useApp((s) => s.notificationsSeen);
  const refresh = useApp((s) => s.refreshNotifications);
  const markSeen = useApp((s) => s.markNotificationsSeen);
  const [open, setOpen] = useState(false);
  const unread = items.filter((n) => !seen || n.ts > seen).length;

  useEffect(() => {
    void refresh();
    const h = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(h);
  }, [refresh]);

  return (
    <div className="relative">
      <IconButton
        label={unread ? `Notifications (${unread} unread)` : "Notifications"}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) markSeen();
        }}
        active={open}
      >
        <Bell size={16} />
        {unread > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full border-2 border-surface bg-danger" aria-hidden />}
      </IconButton>
      <Popover open={open} onClose={() => setOpen(false)} className="w-[380px] max-w-[calc(100vw-1.5rem)]">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <p className="text-xs font-semibold">Notifications</p>
          <Link to="/audit" onClick={() => setOpen(false)} className="text-2xs font-semibold text-accent hover:underline">
            Audit log
          </Link>
        </div>
        <div className="max-h-96 overflow-y-auto p-1.5">
          {items.length === 0 && <p className="px-3 py-6 text-center text-2xs text-subtle">No notifications yet.</p>}
          {items.map((n) => (
            <Link
              key={n.id}
              to={n.transformation_id ? `/workspace/${n.transformation_id}` : "/audit"}
              onClick={() => setOpen(false)}
              className="flex gap-2.5 rounded-lg px-2.5 py-2 hover:bg-surface-3"
            >
              <span
                className={cx(
                  "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                  n.status === "failed" ? "bg-danger" : n.status === "warning" ? "bg-warning" : "bg-success",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-fg">{n.action}</span>
                <span className="block truncate text-2xs text-muted">{n.detail || n.object}</span>
                <span className="text-2xs text-subtle">
                  {n.transformation_id ?? "Workspace"} · {relative(n.ts)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </Popover>
    </div>
  );
}

function ThemeMenu() {
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const next: Record<ThemePref, ThemePref> = { light: "dark", dark: "system", system: "light" };
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <IconButton label={`Theme: ${theme} (switch to ${next[theme]})`} onClick={() => setTheme(next[theme])}>
      <Icon size={16} />
    </IconButton>
  );
}

function UserMenu() {
  const config = useApp((s) => s.config);
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    if (open) api.authStatus().then((s) => setSignedIn(s.enabled && s.authenticated)).catch(() => setSignedIn(false));
  }, [open]);
  const name = config?.operator.name ?? "Operator";
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Account: ${name}`}
        aria-expanded={open}
        className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-2xs font-bold text-accent-fg"
      >
        {initials}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} className="w-64 p-3">
        <p className="text-xs font-semibold">{name}</p>
        <p className="text-2xs text-muted">{config?.operator.role}</p>
        <p className="mt-1 text-2xs text-subtle">Workspace · {config?.workspace}</p>
        <div className="my-2.5 h-px bg-border" />
        <p className="text-2xs leading-relaxed text-muted">Single-operator local mode. SSO and role-based access are not configured in this build.</p>
        <div className="mt-3 flex items-center justify-between">
          <Link to="/settings" onClick={() => setOpen(false)} className="text-xs font-semibold text-accent hover:underline">
            Profile & access settings
          </Link>
          {signedIn && (
            <button
              type="button"
              onClick={() => void api.logout().finally(() => window.location.reload())}
              className="text-xs font-semibold text-muted hover:text-fg"
            >
              Sign out
            </button>
          )}
        </div>
      </Popover>
    </div>
  );
}

export function TopBar({ onToggleSidebar, onOpenMobileNav }: { onToggleSidebar: () => void; onOpenMobileNav: () => void }) {
  return (
    <header className="flex h-13 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
      <IconButton label="Open navigation" onClick={onOpenMobileNav} className="lg:hidden">
        <Menu size={17} />
      </IconButton>
      <span className="hidden lg:contents">
        <IconButton label="Collapse sidebar" onClick={onToggleSidebar}>
          <PanelLeft size={17} />
        </IconButton>
      </span>
      <Link to="/workspace" className="flex min-w-0 items-center gap-2.5 rounded-lg pr-2" aria-label="PRAMAAN home">
        <BrandMark size={26} />
        <span className="min-w-0 leading-tight">
          <span className="block text-sm font-bold tracking-[0.14em] text-fg">PRAMAAN</span>
          <span className="hidden truncate text-2xs text-muted sm:block">AI Transformation Workspace</span>
        </span>
      </Link>
      <div className="flex-1" />
      <PostureChip />
      <div className="mx-1 hidden h-5 w-px bg-border md:block" />
      <Notifications />
      <ThemeMenu />
      <UserMenu />
    </header>
  );
}
