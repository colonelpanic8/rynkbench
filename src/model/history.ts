// The history's shape (ADR 0018; the rules are in workbench/draft/history.ts)
// and the keyboard shortcuts for Undo and Redo.

import type { PatchEntry } from "../sync";
import type { BehaviorLabels } from "./behavior-labels";

/** The behavior labels before and after a commit that changed them (ADR 0020). */
export interface LabelsChange {
  before: BehaviorLabels;
  after: BehaviorLabels;
}

/** One commit: its items with their value before and after, and the labels when it changed them. */
export interface HistoryStep {
  changes: readonly PatchEntry[];
  labels?: LabelsChange;
}

export interface History {
  past: HistoryStep[];
  future: HistoryStep[];
  /** A Paint stroke is open: "open" until its first step, then "joined". */
  stroke: "none" | "open" | "joined";
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
