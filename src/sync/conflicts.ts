// The three-way check (ADR 0012): what you started from, what the keyboard
// holds now, what you want. An item changed on both sides, to different
// values, is a conflict: writing would overwrite a change made elsewhere
// (another computer, another tool, the keyboard itself).

import { sameValue } from "../model/deep-equal";
import type { KeyboardImage } from "./image";
import { differences, itemKey, type SyncItem } from "./items";

/** Items you changed that the keyboard also changed since `base`, to something else. */
export function conflicts(base: KeyboardImage, now: KeyboardImage, want: KeyboardImage): SyncItem[] {
  const theirs = new Map(differences(base, now).map((change) => [itemKey(change.item), change.to]));
  return differences(base, want)
    .filter((mine) => theirs.has(itemKey(mine.item)) && !sameValue(theirs.get(itemKey(mine.item)), mine.to))
    .map((mine) => mine.item);
}
