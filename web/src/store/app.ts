import { create } from "zustand";
import { api } from "@/lib/api";
import type { AppConfig, AuditEvent, OutputType, Transformation, TransformationSummary } from "@/lib/types";

export type ThemePref = "light" | "dark" | "system";

export interface Toast {
  id: number;
  tone: "success" | "danger" | "info" | "warning";
  title: string;
  body?: string;
}

export interface ClaimFocus {
  tid: string;
  claimId: string;
  artifact?: OutputType;
  refId?: string;
}

function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode); preference is session-only */
  }
}

function readTheme(): ThemePref {
  try {
    const v = localStorage.getItem("pramaan.theme");
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function applyTheme(pref: ThemePref): void {
  const dark = pref === "dark" || (pref === "system" && !!media?.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

interface AppState {
  config: AppConfig | null;
  configError: string | null;
  loadConfig: () => Promise<void>;

  theme: ThemePref;
  setTheme: (t: ThemePref) => void;

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  mobileNavOpen: boolean;
  setMobileNav: (open: boolean) => void;
  taskPanelOpen: boolean;
  setTaskPanel: (open: boolean) => void;

  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;

  claimFocus: ClaimFocus | null;
  openClaim: (f: ClaimFocus) => void;
  closeClaim: () => void;

  list: TransformationSummary[];
  refreshList: () => Promise<void>;
  pinned: string[];
  togglePin: (id: string) => void;

  transformations: Record<string, Transformation>;
  setTransformation: (t: Transformation) => void;
  fetchTransformation: (id: string) => Promise<Transformation>;
  dropTransformation: (id: string) => void;

  notifications: AuditEvent[];
  notificationsSeen: string | null;
  refreshNotifications: () => Promise<void>;
  markNotificationsSeen: () => void;
}

let toastSeq = 1;

export const useApp = create<AppState>((set, get) => ({
  config: null,
  configError: null,
  async loadConfig() {
    try {
      set({ config: await api.config(), configError: null });
    } catch (e) {
      set({ configError: (e as Error).message });
    }
  },

  theme: readTheme(),
  setTheme(t) {
    // stored as a raw string: the pre-paint script in index.html reads it before React loads
    try {
      localStorage.setItem("pramaan.theme", t);
    } catch {
      /* storage unavailable; theme applies for this session only */
    }
    applyTheme(t);
    set({ theme: t });
  },

  sidebarCollapsed: readLocal("pramaan.sidebar", false),
  toggleSidebar() {
    const v = !get().sidebarCollapsed;
    writeLocal("pramaan.sidebar", v);
    set({ sidebarCollapsed: v });
  },
  mobileNavOpen: false,
  setMobileNav: (open) => set({ mobileNavOpen: open }),
  taskPanelOpen: readLocal("pramaan.taskpanel", true),
  setTaskPanel(open) {
    writeLocal("pramaan.taskpanel", open);
    set({ taskPanelOpen: open });
  },

  toasts: [],
  toast(t) {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    window.setTimeout(() => get().dismissToast(id), t.tone === "danger" ? 7000 : 4200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),

  claimFocus: null,
  openClaim: (f) => set({ claimFocus: f }),
  closeClaim: () => set({ claimFocus: null }),

  list: [],
  async refreshList() {
    try {
      set({ list: await api.list() });
    } catch {
      /* list is non-critical; keep previous */
    }
  },
  pinned: readLocal<string[]>("pramaan.pinned", []),
  togglePin(id) {
    const cur = get().pinned;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    writeLocal("pramaan.pinned", next);
    set({ pinned: next });
  },

  transformations: {},
  setTransformation: (t) => set((s) => ({ transformations: { ...s.transformations, [t.id]: t } })),
  async fetchTransformation(id) {
    const t = await api.get(id);
    get().setTransformation(t);
    return t;
  },
  dropTransformation: (id) =>
    set((s) => {
      const next = { ...s.transformations };
      delete next[id];
      return { transformations: next, list: s.list.filter((x) => x.id !== id) };
    }),

  notifications: [],
  notificationsSeen: readLocal<string | null>("pramaan.notif.seen", null),
  async refreshNotifications() {
    try {
      set({ notifications: await api.notifications() });
    } catch {
      /* non-critical */
    }
  },
  markNotificationsSeen() {
    const latest = get().notifications[0]?.ts ?? new Date().toISOString();
    writeLocal("pramaan.notif.seen", latest);
    set({ notificationsSeen: latest });
  },
}));

media?.addEventListener("change", () => {
  if (useApp.getState().theme === "system") applyTheme("system");
});
applyTheme(useApp.getState().theme);
