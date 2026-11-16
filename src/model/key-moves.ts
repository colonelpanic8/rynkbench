// What dropping one key on another does, as in GLIDE: the two swap, or with
// Ctrl/⌘/Alt held the dropped key is copied. Pure: the writes, in order. The
// destination is written first, so a write that fails never loses the source.

import type { KeyAction } from "../vendor/rynk-wasm/rynk_wasm";

export interface KeyPlace {
  row: number;
  col: number;
}

export interface KeyWrite {
  place: KeyPlace;
  action: KeyAction;
}

const samePlace = (a: KeyPlace, b: KeyPlace) => a.row === b.row && a.col === b.col;

export function planKeyDrop(
  actionAt: (place: KeyPlace) => KeyAction,
  source: KeyPlace,
  destination: KeyPlace,
  copy: boolean,
): KeyWrite[] {
  if (samePlace(source, destination)) return [];
  const moving = actionAt(source);
  const replaced = actionAt(destination);
  if (JSON.stringify(moving) === JSON.stringify(replaced)) return [];
  const writes: KeyWrite[] = [{ place: destination, action: moving }];
  if (!copy) writes.push({ place: source, action: replaced });
  return writes;
}
