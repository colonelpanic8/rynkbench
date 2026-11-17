// How the layers you want differ in structure from the ones the keyboard
// holds: which were deleted or added, which moved to another slot, and which
// was only renamed. Review & send shows a layer delete or move as one change
// with this (workbench/draft/changes.ts), since every key of a layer that
// moves changes with it. Pure.

/** A layer slot as the keyboard stores it. */
export interface LayerSlot {
  occupied: boolean;
  name: string;
}

export interface LayerStructure {
  /** Names of the layers that are gone. */
  deleted: string[];
  /** Names of the layers that are new. */
  added: string[];
  /** How many layers sit in another slot now. */
  moved: number;
  /** [old name, new name] of layers renamed in place. */
  renamed: Array<[string, string]>;
  /** Slots whose layer changed in any of these ways: the keys and lights on them change with it. */
  slots: number[];
}

const names = (slots: readonly LayerSlot[]) => slots.map((slot) => (slot.occupied ? slot.name : null));

/** The structure change, or null when the layers are the same (or only renamed in place). */
export function layerStructure(before: readonly LayerSlot[], after: readonly LayerSlot[]): LayerStructure | null {
  const was = names(before);
  const now = names(after);
  const length = Math.max(was.length, now.length);
  const changed = Array.from({ length }, (_, slot) => slot).filter((slot) => (was[slot] ?? null) !== (now[slot] ?? null));
  if (changed.length === 0) return null;
  const wasNames = new Set(was.filter((name): name is string => name !== null));
  const nowNames = new Set(now.filter((name): name is string => name !== null));
  const renamed: Array<[string, string]> = [];
  const deleted: string[] = [];
  const added: string[] = [];
  let moved = 0;
  for (const slot of changed) {
    const old = was[slot] ?? null;
    const neu = now[slot] ?? null;
    // A slot that keeps a layer whose old name is gone and whose new name is new: renamed in place.
    if (old !== null && neu !== null && !nowNames.has(old) && !wasNames.has(neu)) renamed.push([old, neu]);
    else {
      if (old !== null && !nowNames.has(old)) deleted.push(old);
      if (neu !== null && !wasNames.has(neu)) added.push(neu);
      if (neu !== null && wasNames.has(neu)) moved += 1;
    }
  }
  // Only renames: no layer moves, so no key changes with them.
  if (deleted.length === 0 && added.length === 0 && moved === 0) return null;
  return { deleted, added, moved, renamed, slots: changed };
}
