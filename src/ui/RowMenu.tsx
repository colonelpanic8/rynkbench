// The menu of a list row (layers, combos) and of a top-bar "▾" button, as in
// GLIDE: right-click a row, long-press it on a touch screen, or press its ⋮.
// Drawn on document.body, so a scrolled list or a drawer never clips it. The
// menu only asks; the list does the work.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "./kit";

export interface MenuItem {
  id: string;
  label: ReactNode;
  /** A second, quieter line under the label. */
  hint?: string;
  disabled?: boolean;
  /** Why it is disabled, shown on hover. */
  reason?: string;
  danger?: boolean;
}
/** A heading over the items after it. */
export interface MenuHeading {
  heading: string;
}
export type MenuEntry = MenuItem | MenuHeading | "-";

const LONG_PRESS_MS = 500;

export function RowMenu({
  x,
  y,
  label,
  items,
  onAction,
  onClose,
  width = 230,
}: {
  x: number;
  y: number;
  label: string;
  items: MenuEntry[];
  onAction: (id: string) => void;
  onClose: () => void;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - box.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - box.height - 8)),
    });
  }, [x, y]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    ref.current?.querySelector<HTMLButtonElement>("button:not([aria-disabled])")?.focus();
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[70]"
      onClick={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        ref={ref}
        role="menu"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
        style={{ left: pos.left, top: pos.top, width }}
        className="fixed rounded-2xl border border-line-strong bg-panel py-1.5 shadow-2xl animate-fade-up"
      >
        {items.map((item, index) => {
          if (item === "-") return <div key={index} className="my-1.5 border-t border-line" />;
          if ("heading" in item) {
            return (
              <div
                key={index}
                className="px-4 pt-2.5 pb-1 text-caption font-semibold uppercase tracking-widest text-faint"
              >
                {item.heading}
              </div>
            );
          }
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              aria-disabled={item.disabled || undefined}
              title={item.disabled ? item.reason : undefined}
              onClick={() => {
                if (item.disabled) return;
                onClose();
                onAction(item.id);
              }}
              className={cx(
                "mx-1.5 flex w-[calc(100%-0.75rem)] cursor-pointer flex-col items-start rounded-lg px-2.5 py-1.5 text-left transition-colors duration-120",
                item.disabled ? "cursor-not-allowed opacity-40" : "hover:bg-hover",
              )}
            >
              <span
                className={cx("text-body font-semibold", item.danger && !item.disabled ? "text-danger" : "text-ink")}
              >
                {item.label}
              </span>
              {item.hint && <span className="text-small text-faint">{item.hint}</span>}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

/** Where a row menu is open, and the handlers that open it: right-click, a
 *  long press on touch, or a ⋮ button (`openFrom`). */
export function useRowMenu<Id>() {
  const [at, setAt] = useState<{ x: number; y: number; id: Id } | null>(null);
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const rowProps = (id: Id) => ({
    onContextMenu: (event: ReactMouseEvent) => {
      event.preventDefault();
      cancelPress();
      setAt({ x: event.clientX, y: event.clientY, id });
    },
    onPointerDown: (event: ReactPointerEvent) => {
      if (event.pointerType !== "touch") return;
      const { clientX: x, clientY: y } = event;
      cancelPress();
      press.current = { timer: setTimeout(() => setAt({ x, y, id }), LONG_PRESS_MS), x, y };
    },
    // a scroll, not a press
    onPointerMove: (event: ReactPointerEvent) => {
      if (press.current && Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > 8) {
        cancelPress();
      }
    },
    onPointerUp: cancelPress,
    onPointerLeave: cancelPress,
  });
  const openFrom = (event: ReactMouseEvent<HTMLElement>, id: Id) => {
    event.stopPropagation();
    const box = event.currentTarget.getBoundingClientRect();
    setAt({ x: box.left, y: box.bottom + 4, id });
  };
  return { at, openFor: at?.id ?? null, rowProps, openFrom, close: () => setAt(null) };
}
