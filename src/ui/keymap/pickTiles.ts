// A Pick Key tile and a group of them, and the two ways to make a tile: a key
// by its HID code, or anything else by its action. No React.

import type { Action, HidKeyCode } from "../../model/action-types";
import { hidLabel } from "../labels";

/** What a tile puts on the key: an action for the slot being filled, "Transparent"
 *  (falls through to the layer below) or a tap pattern, which is the whole key. */
export type Pick = Action | "Transparent" | { Morse: number };

export interface Tile {
  /** Unique within the picker. */
  id: string;
  label: string;
  action: Pick;
  /** More words to find it by (lowercase). */
  search: string;
  /** It needs Shift or AltGr to type its character. */
  lilac?: boolean;
  /** The small caption it sits under inside its group. */
  cluster?: string;
}

export interface TileGroup {
  id: string;
  name: string;
  /** The quick link's word, for the groups people look for first. */
  chip?: string;
  tiles: Tile[];
}

export const LETTER_CODES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("") as HidKeyCode[];
export const DIGIT_CODES: HidKeyCode[] = ["Kc1", "Kc2", "Kc3", "Kc4", "Kc5", "Kc6", "Kc7", "Kc8", "Kc9", "Kc0"];
export const PUNCTUATION_CODES: HidKeyCode[] = [
  "Minus",
  "Equal",
  "LeftBracket",
  "RightBracket",
  "Backslash",
  "Semicolon",
  "Quote",
  "Grave",
  "Comma",
  "Dot",
  "Slash",
];
export const NON_US: HidKeyCode[] = ["NonusBackslash", "NonusHash"];

export function keyTile(code: HidKeyCode, label?: string, search = ""): Tile {
  return {
    id: `key:${code}`,
    label: label ?? hidLabel(code),
    action: { Key: { Hid: code } } as Action,
    search: `${code} ${label ?? ""} ${hidLabel(code)} ${search}`.toLowerCase(),
  };
}

export function actionTile(id: string, label: string, action: Pick, search = ""): Tile {
  return { id, label, action, search: `${label} ${search}`.toLowerCase() };
}


/** Whether a pick is a tap pattern, which is a whole key rather than one slot. */
export function isTapPattern(pick: Pick): pick is { Morse: number } {
  return typeof pick === "object" && "Morse" in pick;
}
