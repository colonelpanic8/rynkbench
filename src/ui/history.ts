import type { KeyAction } from "../vendor/rynk-wasm/rynk_wasm";

export const KEY_EDIT_HISTORY_LIMIT = 100;

export interface KeyEditHistoryEntry {
  sequence: number;
  layer: number;
  row: number;
  col: number;
  before: KeyAction;
  after: KeyAction;
}

export interface KeyEditHistory {
  past: KeyEditHistoryEntry[];
  future: KeyEditHistoryEntry[];
  operation: { direction: "undo" | "redo"; entry: KeyEditHistoryEntry } | null;
  error: string | null;
}

export type KeyEditHistoryAction =
  | { type: "record"; entry: KeyEditHistoryEntry }
  | { type: "start"; direction: "undo" | "redo"; entry: KeyEditHistoryEntry }
  | { type: "finish"; direction: "undo" | "redo"; entry: KeyEditHistoryEntry }
  | { type: "fail"; direction: "undo" | "redo"; message: string }
  | { type: "clear" }
  | { type: "dismissError" };

export function initialKeyEditHistory(): KeyEditHistory {
  return { past: [], future: [], operation: null, error: null };
}

export function reduceKeyEditHistory(
  history: KeyEditHistory,
  action: KeyEditHistoryAction,
): KeyEditHistory {
  switch (action.type) {
    case "record": {
      if (JSON.stringify(action.entry.before) === JSON.stringify(action.entry.after)) {
        return history;
      }
      const past = [...history.past, action.entry]
        .sort((a, b) => a.sequence - b.sequence)
        .slice(-KEY_EDIT_HISTORY_LIMIT);
      return { past, future: [], operation: null, error: null };
    }
    case "start":
      return {
        ...history,
        operation: { direction: action.direction, entry: action.entry },
        error: null,
      };
    case "finish":
      return action.direction === "undo"
        ? {
            past: history.past.slice(0, -1),
            future: [...history.future, action.entry],
            operation: null,
            error: null,
          }
        : {
            past: [...history.past, action.entry],
            future: history.future.slice(0, -1),
            operation: null,
            error: null,
          };
    case "fail":
      return {
        ...history,
        operation: null,
        error: `${action.direction === "undo" ? "Undo" : "Redo"} failed: ${action.message}`,
      };
    case "clear":
      return initialKeyEditHistory();
    case "dismissError":
      return { ...history, error: null };
  }
}

export function keyEditHistoryLabel(entry: KeyEditHistoryEntry): string {
  return `Layer ${entry.layer}, row ${entry.row}, column ${entry.col}`;
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
