// The status setup that is choosing its keys on the board, if one is
// (model/lighting/key-pick.ts). It starts in Layout properties (RGB Lighting,
// Advanced), which steps aside while it lasts; the keymap's canvas collects
// the keys with its selection, and its banner installs them or cancels. It
// ends with the workbench (ui/workbench-end.ts). The panel, the window and the
// canvas share this.

import { useSyncExternalStore } from "react";
import type { KeyPick } from "../../model/lighting/key-pick";

let pick: KeyPick | null = null;
const listeners = new Set<() => void>();

function set(next: KeyPick | null) {
  if (next === pick) return;
  pick = next;
  for (const listener of listeners) listener();
}

export const keyPick = {
  get: () => pick,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  start: (next: KeyPick) => set(next),
  /** Done or cancelled: Layout properties comes back. */
  stop: () => set(null),
};

export function useKeyPick(): KeyPick | null {
  return useSyncExternalStore(keyPick.subscribe, keyPick.get, keyPick.get);
}
