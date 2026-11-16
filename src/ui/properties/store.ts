// Whether Layout properties is open, and on which tab: one small store, so the
// top bar's button and links elsewhere (Combos' "set in Layout properties")
// open the same window. Opening it ends a pick of keys on the board, for which
// the window had stepped aside (ui/lighting/keyPick.ts).

import { useSyncExternalStore } from "react";
import { keyPick } from "../lighting/keyPick";

export type PropertiesTab = "details" | "options" | "lighting" | "effects";

let shown: PropertiesTab | null = null;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((listener) => listener());

export function openProperties(tab: PropertiesTab = "details"): void {
  keyPick.stop();
  shown = tab;
  tell();
}

export function closeProperties(): void {
  shown = null;
  tell();
}

/** The open tab, or null while the window is closed. */
export function usePropertiesTab(): PropertiesTab | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => shown,
    () => shown,
  );
}
