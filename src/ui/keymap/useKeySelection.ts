// Selecting several keys on the keymap canvas (model/key-selection.ts): ⌘ on
// Apple computers, Ctrl elsewhere, with a click adds or removes a key, and held
// through a drag does the same for every key the pointer crosses; Shift with a
// click extends to that key. A secondary click (Ctrl with a click on a Mac)
// never selects.
// From the keyboard the same modifiers work with Enter or Space. While the
// canvas is choosing keys (the RGB Lighting tab's Select, a pick for a status
// setup) a plain press does it. A drag that selects never moves a key.

import { useMemo, useRef } from "react";
import type { KeyPlace } from "../../model/key-moves";
import { secondaryPress, selectedKeys, selectGesture, selectionExtended, type Held, type SelectHow } from "../../model/key-selection";
import { detectOs } from "../preferences";
import { useWorkbench } from "../state";

/** The computer this page runs on is an Apple one: its modifiers decide. */
export const onApple = () => detectOs() === "mac";
const idOf = (key: KeyPlace) => `${key.row},${key.col}`;

export function useKeySelection(choosing: "one" | "many" | null) {
  const { bundle, state, dispatch } = useWorkbench();
  const chosen = useMemo(() => new Set(selectedKeys(state.selection).map(idOf)), [state.selection]);
  // What the drag under way does to each key it crosses; null when it does not select.
  const stroke = useRef<SelectHow | null>(null);
  const selecting = useRef(false);

  const apple = useMemo(onApple, []);

  const act = (key: KeyPlace, held: Held): boolean => {
    const gesture = selectGesture(choosing, held, apple);
    const place = { row: key.row, col: key.col };
    stroke.current = null;
    if (gesture === "only") dispatch({ type: "select", selection: { type: "key", ...place } });
    else if (gesture === "extend") dispatch({ type: "select", selection: selectionExtended(state.selection, place, bundle.model.keys) });
    else if (gesture === "toggle") {
      stroke.current = chosen.has(idOf(key)) ? "remove" : "add";
      dispatch({ type: "selectKeys", keys: [place], how: stroke.current });
    }
    return gesture !== null;
  };

  return {
    /** How many keys are selected. */
    count: chosen.size,
    has: (key: KeyPlace) => chosen.has(idOf(key)),
    /** A secondary press opens the quick menu: no click, Paint, move or selection. */
    secondary: (event: Held & { button: number }) => secondaryPress(event, apple),
    /** A press on a key: whether it changed the selection, and so is no click, Paint or move. */
    press(key: KeyPlace, event: Held & { button: number }): boolean {
      selecting.current = !secondaryPress(event, apple) && act(key, event);
      if (!selecting.current) stroke.current = null;
      return selecting.current;
    },
    /** The pointer came onto a key with the button down: whether a selecting drag took it. */
    cross(key: KeyPlace): boolean {
      if (!selecting.current) return false;
      if (stroke.current) dispatch({ type: "selectKeys", keys: [{ row: key.row, col: key.col }], how: stroke.current });
      return true;
    },
    /** Enter or Space on a key: whether it changed the selection. */
    activate: (key: KeyPlace, event: Held) => act(key, event),
    /** Whether the press under way selects: such a drag does not pick the key up. */
    dragSelects: () => selecting.current,
  };
}
