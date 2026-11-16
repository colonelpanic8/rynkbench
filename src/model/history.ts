// The history's shape (ADR 0018; the rules are in workbench/draft/history.ts)
// and the keyboard shortcuts for Undo and Redo.

import type { PatchEntry } from "../sync";

/** One commit: its items with their value before and after. */
export interface HistoryStep {
  changes: readonly PatchEntry[];
}

export interface History {
  past: HistoryStep[];
  future: HistoryStep[];
  /** A Paint stroke is open: "open" until its first step, then "joined". */
  stroke: "none" | "open" | "joined";
  /** A bulk write (an import, a transform) is running: its changes are no step. */
  suspended: boolean;
}

export type HistoryShortcut = "undo" | "redo";

interface HistoryKeyboardEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  target: EventTarget | null;
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  const candidate = target as {
    closest?: (selectors: string) => unknown;
  } | null;
  return Boolean(
    candidate?.closest?.(
      'input, textarea, select, [role="textbox"], [contenteditable]:not([contenteditable="false"])',
    ),
  );
}

export function historyShortcut(event: HistoryKeyboardEvent): HistoryShortcut | null {
  if (
    event.defaultPrevented ||
    (!event.ctrlKey && !event.metaKey) ||
    event.altKey ||
    isTextEntryTarget(event.target)
  ) {
    return null;
  }
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !event.shiftKey) return "redo";
  return null;
}
