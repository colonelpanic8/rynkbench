// Selecting several keys on the keymap canvas (model/key-selection.ts): Ctrl or
// ⌘ with a click adds or removes a key, and held through a drag does the same
// for every key the pointer crosses; Shift with a click extends to that key.
// From the keyboard the same modifiers work with Enter or Space. While the
// canvas is choosing keys (the RGB Lighting tab's Select, a pick for a status
// setup) a plain press does it. A drag that selects never moves a key.

import { useMemo, useRef } from "react";
import type { KeyPlace } from "../../model/key-moves";
import { selectedKeys, selectGesture, selectionExtended, type SelectHow } from "../../model/key-selection";
import { useWorkbench } from "../state";

type Held = { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean };
const idOf = (key: KeyPlace) => `${key.row},${key.col}`;

export function useKeySelection(choosing: "one" | "many" | null) {
  const { bundle, state, dispatch } = useWorkbench();
  const chosen = useMemo(() => new Set(selectedKeys(state.selection).map(idOf)), [state.selection]);
  // What the drag under way does to each key it crosses; null when it does not select.
  const stroke = useRef<SelectHow | null>(null);
  const selecting = useRef(false);

  const act = (key: KeyPlace, held: Held): boolean => {
    const gesture = selectGesture(choosing, held);
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
    /** A press on a key: whether it changed the selection, and so is no click, Paint or move. */
    press(key: KeyPlace, event: Held & { button: number }): boolean {
      selecting.current = event.button === 0 && act(key, event);
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
