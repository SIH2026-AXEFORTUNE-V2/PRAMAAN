import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cx } from "@/lib/format";

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open, close]);
  return ref;
}

/** Listbox dropdown used by the configuration chips and filters. */
export function Select({
  value,
  options,
  onChange,
  label,
  icon,
  disabled,
  variant = "chip",
  className,
  align = "left",
  display = (v: string) => v,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  variant?: "chip" | "field";
  className?: string;
  align?: "left" | "right";
  display?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useOutside(open, () => setOpen(false));
  const id = useId();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open) setActive(Math.max(0, options.indexOf(value)));
  }, [open, options, value]);

  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") setActive((a) => Math.min(options.length - 1, a + 1));
    else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
    else if (e.key === "Enter") {
      onChange(options[active]);
      setOpen(false);
    } else return;
    e.preventDefault();
  };

  return (
    <div ref={ref} className={cx("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${label}: ${display(value)}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
        className={cx(
          "flex w-full items-center gap-2.5 text-left transition-colors disabled:opacity-60",
          variant === "chip"
            ? "h-14 rounded-xl border border-border bg-surface px-3.5 hover:border-border-strong"
            : "h-10 rounded-lg border border-border bg-surface px-3 text-sm hover:border-border-strong",
          open && "border-accent ring-2 ring-accent-soft",
        )}
      >
        {icon && <span className="text-muted">{icon}</span>}
        {variant === "chip" ? (
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-2xs text-subtle">{label}</span>
            <span className="block truncate text-sm font-semibold text-fg">{display(value)}</span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate">{display(value)}</span>
        )}
        <ChevronDown size={14} className={cx("shrink-0 text-subtle transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={id}
          role="listbox"
          aria-label={label}
          className={cx(
            "animate-fade-in absolute z-40 mt-1.5 max-h-72 min-w-full overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {options.map((o, i) => (
            <li
              key={o}
              data-idx={i}
              role="option"
              aria-selected={o === value}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(o);
                setOpen(false);
              }}
              className={cx(
                "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap",
                i === active ? "bg-surface-3 text-fg" : "text-muted",
              )}
            >
              <span className="flex-1">{display(o)}</span>
              {o === value && <Check size={13} className="text-accent" aria-hidden />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Popover menu for actions (export formats, overflow). */
export function MenuButton({
  trigger,
  items,
  align = "right",
  label,
}: {
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  items: { label: string; onSelect: () => void; disabled?: boolean; hint?: string; icon?: ReactNode; danger?: boolean }[];
  align?: "left" | "right";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      {trigger(open, () => setOpen((o) => !o))}
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={cx(
            "animate-fade-in absolute z-40 mt-1.5 min-w-52 rounded-xl border border-border bg-surface p-1 shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              disabled={it.disabled}
              title={it.hint}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={cx(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-3 disabled:opacity-45 disabled:hover:bg-transparent",
                it.danger ? "text-danger" : "text-fg",
              )}
            >
              {it.icon && <span className="text-muted">{it.icon}</span>}
              <span className="flex-1">{it.label}</span>
              {it.hint && <span className="text-2xs text-subtle">{it.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
