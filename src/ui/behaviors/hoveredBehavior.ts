// Hovering a behavior's row in the Behavior Library lights the keys that use
// it on the layer shown, as in GLIDE; on touch, pressing the row does. The row
// sets it, the keymap reads it. It ends with the workbench (ui/workbench-end.ts).

import { useSyncExternalStore } from "react";
import type { PointerEvent } from "react";
import type { SiteRef } from "../../workbench/usage";

export interface HoveredBehavior {
  /** The row's key (all-behaviors.ts `rowKey`). */
  id: string;
  /** Where it is used, as its row says. */
  places: readonly SiteRef[];
}

let hovered: HoveredBehavior | null = null;
const listeners = new Set<() => void>();

function set(next: HoveredBehavior | null) {
  if (next === hovered) return;
  hovered = next;
  for (const listener of listeners) listener();
}

export const hoveredBehavior = {
  get: () => hovered,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  enter: (next: HoveredBehavior) => set(next),
  /** Only the row still hovered clears it, so moving from one row to the next never flickers. */
  leave: (id: string) => {
    if (hovered?.id === id) set(null);
  },
  end: () => set(null),
};

export function useHoveredBehavior(): HoveredBehavior | null {
  return useSyncExternalStore(hoveredBehavior.subscribe, hoveredBehavior.get, hoveredBehavior.get);
}

/** The pointer handlers a row spreads to light its keys: hover with a mouse, press on touch. */
export function hoverHandlers(row: HoveredBehavior) {
  const touchOff = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") hoveredBehavior.leave(row.id);
  };
  return {
    onMouseEnter: () => hoveredBehavior.enter(row),
    onMouseLeave: () => hoveredBehavior.leave(row.id),
    onPointerDown: (event: PointerEvent) => {
      if (event.pointerType !== "mouse") hoveredBehavior.enter(row);
    },
    onPointerUp: touchOff,
    onPointerCancel: touchOff,
  };
}

/** The keys among `places` on `layer`, as "row,col". */
export function keysOnLayer(places: readonly SiteRef[], layer: number): Set<string> {
  const keys = new Set<string>();
  for (const { target } of places) {
    if (target?.kind === "cell" && target.layer === layer) keys.add(`${target.row},${target.col}`);
  }
  return keys;
}
