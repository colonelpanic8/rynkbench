// The keys selected on the keymap. One key is the one the key editor shows:
// the last one selected. Others can be selected with it, and a change made for
// the selection (a light) reaches them all; everything that works on one key
// (its slots, copy and paste, the quick menu) works on the last one. Pure.

import type { KeyPlace } from "./key-moves";
import type { Selection } from "./workbench-state";

const same = (a: KeyPlace, b: KeyPlace) => a.row === b.row && a.col === b.col;
const among = (keys: readonly KeyPlace[], key: KeyPlace) => keys.some((each) => same(each, key));

/** The selected keys in the order they were selected; none when no key is. */
export function selectedKeys(selection: Selection | null): KeyPlace[] {
  if (selection?.type !== "key") return [];
  return [...(selection.more ?? []), { row: selection.row, col: selection.col }];
}

/** The LEDs of these keys, in their order; a key without one is left out. */
export function ledsOf(board: ReadonlyArray<KeyPlace & { ledId?: number }>, keys: readonly KeyPlace[]): number[] {
  return keys.flatMap((key) => {
    const led = board.find((each) => same(each, key))?.ledId;
    return led === undefined ? [] : [led];
  });
}

/** The selection of these keys, the last of them the one the editor shows. */
function selectionOf(keys: readonly KeyPlace[]): Selection | null {
  const last = keys.at(-1);
  if (!last) return null;
  const { row, col } = last;
  return keys.length === 1 ? { type: "key", row, col } : { type: "key", row, col, more: keys.slice(0, -1).map((key) => ({ row: key.row, col: key.col })) };
}

export type SelectHow = "add" | "remove";

/** The selection with keys added (each new one becomes the last selected) or
 *  removed. Keys already selected keep their place, so a drag back over them
 *  changes nothing. */
export function selectionWith(selection: Selection | null, keys: readonly KeyPlace[], how: SelectHow): Selection | null {
  const chosen = selectedKeys(selection);
  if (how === "remove") {
    if (selection?.type !== "key") return selection;
    return selectionOf(chosen.filter((key) => !among(keys, key)));
  }
  for (const key of keys) if (!among(chosen, key)) chosen.push(key);
  return selectionOf(chosen);
}

/** The selection grown to `to`, which becomes the last selected: with it,
 *  every key of the board in the rows and columns between it and the last one. */
export function selectionExtended(selection: Selection | null, to: KeyPlace, board: readonly KeyPlace[]): Selection | null {
  if (selection?.type !== "key") return selectionOf([to]);
  const [top, bottom] = [Math.min(selection.row, to.row), Math.max(selection.row, to.row)];
  const [left, right] = [Math.min(selection.col, to.col), Math.max(selection.col, to.col)];
  const between = board.filter((key) => key.row >= top && key.row <= bottom && key.col >= left && key.col <= right);
  const chosen = selectedKeys(selection);
  for (const key of between) if (!among(chosen, key)) chosen.push(key);
  return selectionOf([...chosen.filter((key) => !same(key, to)), to]);
}

/** The selection with `key` the one the editor shows: the others stay when it
 *  is one of them, and go when it is not. */
export function selectionShowing(selection: Selection | null, key: KeyPlace): Selection | null {
  const chosen = selectedKeys(selection);
  return among(chosen, key) ? selectionOf([...chosen.filter((each) => !same(each, key)), key]) : selectionOf([key]);
}

/** What a press on a key, or Enter or Space on it, does to the selection.
 *  `choosing`: the canvas is collecting keys, one (each press replaces it) or
 *  many (a press adds or removes). Without it Ctrl or ⌘ adds or removes and
 *  Shift extends; null is an ordinary press. */
export function selectGesture(
  choosing: "one" | "many" | null,
  held: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
): "only" | "toggle" | "extend" | null {
  if (choosing === "one") return "only";
  if (choosing === "many" || held.ctrlKey || held.metaKey) return "toggle";
  return held.shiftKey ? "extend" : null;
}
