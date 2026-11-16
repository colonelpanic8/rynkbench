// Which behavior the editor window shows (ADR 0020): one at a time, opened
// from the library, All your behaviors or a kind's list; nothing when closed.

import { useSyncExternalStore } from "react";
import type { LibraryKind } from "../library";
import type { BehaviorFocus } from "../focus";

export interface EditorTarget {
  kind: LibraryKind;
  /** A slot to edit, or "new" for one that Apply adds in the first free slot. */
  focus: BehaviorFocus;
}

let target: EditorTarget | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

export function openBehaviorEditor(kind: LibraryKind, focus: BehaviorFocus): void {
  target = { kind, focus };
  changed();
}

export function closeBehaviorEditor(): void {
  target = null;
  changed();
}

export function useBehaviorEditor(): EditorTarget | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => target,
    () => null,
  );
}
