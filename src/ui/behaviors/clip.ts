// The behaviors last copied (ADR 0020): kept here for Paste, and put on the
// system clipboard as text so they can go to another keyboard or a note.

import { useSyncExternalStore } from "react";
import { behaviorsAsText, type CopiedBehavior } from "../../operations";

export interface BehaviorClip {
  text: string;
  count: number;
}

let clip: BehaviorClip | null = null;
const listeners = new Set<() => void>();

export function setBehaviorClip(items: readonly CopiedBehavior[]): BehaviorClip {
  clip = { text: behaviorsAsText(items), count: items.length };
  try {
    void navigator.clipboard?.writeText(clip.text).catch(() => {});
  } catch {
    // No clipboard here: Paste still has them.
  }
  for (const listener of listeners) listener();
  return clip;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useBehaviorClip(): BehaviorClip | null {
  return useSyncExternalStore(subscribe, () => clip, () => null);
}
