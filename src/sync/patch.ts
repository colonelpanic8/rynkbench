// A patch: items with their value before and after (ADR 0018). The draft is the
// patch from what the keyboard holds to what you want; a history step is the
// patch one edit made; the kept draft is a patch with what each item was based
// on. Pure.

import { sameValue } from "../model/deep-equal";
import type { KeyboardImage } from "./image";
import { differences, itemKey, valueAt, withValues, type SyncItem } from "./items";

export interface PatchEntry {
  item: SyncItem;
  before: unknown;
  after: unknown;
}

export type Patch = readonly PatchEntry[];

/** What turns `from` into `to`. */
export function patchBetween(from: KeyboardImage, to: KeyboardImage): PatchEntry[] {
  return differences(from, to).map(({ item, from: before, to: after }) => ({ item, before, after }));
}

/** The image with each item of the patch set to its value on one side. */
export function applyPatch(image: KeyboardImage, patch: Patch, side: "before" | "after" = "after"): KeyboardImage {
  return withValues(image, patch.map((entry) => ({ item: entry.item, value: entry[side] })));
}

/** The patch that undoes this one. */
export function invertPatch(patch: Patch): PatchEntry[] {
  return patch.map(({ item, before, after }) => ({ item, before: after, after: before }));
}

/** Two patches one after the other as one: each item from where the first found
 *  it to where the second left it; what ends where it started drops out. */
export function joinPatches(first: Patch, second: Patch): PatchEntry[] {
  const joined = new Map(first.map((entry) => [itemKey(entry.item), entry]));
  for (const entry of second) {
    const earlier = joined.get(itemKey(entry.item));
    joined.set(itemKey(entry.item), earlier ? { ...entry, before: earlier.before } : entry);
  }
  return [...joined.values()].filter((entry) => !sameValue(entry.before, entry.after));
}

/** What you want after what the keyboard holds moved from `oldBase` to
 *  `newBase`: an item you had not changed follows the keyboard; an item you
 *  changed stays as you want it. */
export function rebase(oldBase: KeyboardImage, newBase: KeyboardImage, want: KeyboardImage): KeyboardImage {
  const follow = differences(oldBase, newBase).filter(({ item, from }) => sameValue(valueAt(want, item), from));
  return withValues(want, follow.map(({ item, to }) => ({ item, value: to })));
}
