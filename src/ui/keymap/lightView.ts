// While the key editor's RGB Lighting tab is open the canvas shows the real board
// under its lights (GLIDE's lit view), and with Paint on, clicking or dragging
// over keys gives them the tab's light. The tab and the canvas share this.

import { useSyncExternalStore } from "react";
import type { KeyLight } from "../../model/lighting/key-light";

export interface LightView {
  open: boolean;
  /** The light Paint gives keys; null while Paint is off. */
  brush: KeyLight | null;
}

let view: LightView = { open: false, brush: null };
const listeners = new Set<() => void>();

function set(next: LightView) {
  view = next;
  for (const listener of listeners) listener();
}

export const lightView = {
  get: () => view,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Leaving the tab closes the lit view and stops painting. */
  setOpen: (open: boolean) => set(open ? { ...view, open } : { open: false, brush: null }),
  setBrush: (brush: KeyLight | null) => set({ ...view, brush }),
};

export function useLightView(): LightView {
  return useSyncExternalStore(lightView.subscribe, lightView.get, lightView.get);
}
