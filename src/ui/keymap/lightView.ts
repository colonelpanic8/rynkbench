// While the key editor's Key Lighting tab is open the canvas shows the real board
// under its lights (GLIDE's lit view). With Paint on, clicking or dragging over
// keys gives them the tab's light; with Select on, it selects them, so one
// choice in the tab reaches them all. While trying out, the tab, Paint and
// the selection give keys try-out lights (useTryOut.ts); trying out outlasts
// the tab, as the lights it put on the keyboard do, but not the workbench
// (ui/workbench-end.ts). The tab and the canvas share this.

import { useSyncExternalStore } from "react";
import type { KeyLight } from "../../model/lighting/key-light";

export interface LightView {
  open: boolean;
  /** The light Paint gives keys; null while Paint is off. */
  brush: KeyLight | null;
  /** Select is on: a press or a drag over keys adds them to the selection, or
   *  removes them when it starts on a selected key. Never on with Paint. */
  selecting: boolean;
  /** Trying out: lights go on the keyboard at once and are never stored. */
  tryingOut: boolean;
  /** How long each try-out light stays on; null until it is cleared or the keyboard restarts. */
  lifetimeMs: number | null;
}

const CLOSED: LightView = { open: false, brush: null, selecting: false, tryingOut: false, lifetimeMs: null };
let view = CLOSED;
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
  /** Leaving the tab closes the lit view and stops painting and selecting. */
  setOpen: (open: boolean) => set(open ? { ...view, open } : { ...CLOSED, tryingOut: view.tryingOut, lifetimeMs: view.lifetimeMs }),
  setTryingOut: (tryingOut: boolean) => set({ ...view, tryingOut }),
  setLifetime: (lifetimeMs: number | null) => set({ ...view, lifetimeMs }),
  setBrush: (brush: KeyLight | null) => set({ ...view, brush, selecting: brush ? false : view.selecting }),
  setSelecting: (selecting: boolean) => set({ ...view, selecting, brush: selecting ? null : view.brush }),
  /** The workbench went away: the next keyboard starts with trying out off. */
  end: () => set(CLOSED),
};

export function useLightView(): LightView {
  return useSyncExternalStore(lightView.subscribe, lightView.get, lightView.get);
}
