// Selecting several keys on the keymap canvas (model/key-selection.ts): ⌘ on
// Apple computers, Ctrl elsewhere, with a click adds or removes a key, and held
// through a drag does the same for every key the pointer crosses; Shift with a
// click extends to that key. A secondary click (Ctrl with a click on a Mac)
// never selects.
// From the keyboard the same modifiers work with Enter or Space. While the
// canvas is choosing keys (the RGB Lighting tab's Select, a pick for a status
// setup) a plain press does it. A drag that selects never moves a key, and it
// ends when the pointer is let go anywhere or the window loses it.

import { useEffect, useMemo, useState } from "react";
import type { KeyPlace } from "../../model/key-moves";
import { secondaryPress, selectedKeys, selectGesture, selectionExtended, type Held, type SelectHow } from "../../model/key-selection";
import { detectOs } from "../preferences";
import { useWorkbench } from "../state";

/** The computer this page runs on is an Apple one: its modifiers decide. */
export const onApple = () => detectOs() === "mac";
const idOf = (key: KeyPlace) => `${key.row},${key.col}`;

/** The selecting drag under way: from a press that selected until the pointer
 *  is let go or cancelled anywhere on what it listens to, or that loses focus. */
export function selectDrag() {
  // What the drag does to each key it crosses (null: nothing, yet it selects); undefined between drags.
  let how: SelectHow | null | undefined;
  const end = () => {
    how = undefined;
  };
  const ENDS = ["pointerup", "pointercancel", "blur"];
  return {
    start: (next: SelectHow | null) => {
      how = next;
    },
    end,
    /** Whether a drag that selects is under way. */
    active: () => how !== undefined,
    /** What a key the drag crosses gets; null when it gets nothing. */
    crossing: () => how ?? null,
    listen(target: EventTarget) {
      for (const name of ENDS) target.addEventListener(name, end);
      return () => ENDS.forEach((name) => target.removeEventListener(name, end));
    },
  };
}

export function useKeySelection(choosing: "one" | "many" | null) {
  const { bundle, state, dispatch } = useWorkbench();
  const chosen = useMemo(() => new Set(selectedKeys(state.selection).map(idOf)), [state.selection]);
  const [drag] = useState(selectDrag);
  useEffect(() => drag.listen(window), [drag]);

  const apple = useMemo(onApple, []);

  /** Selects as `held` says; what a drag from here would do to the keys it crosses, or undefined when it does not select. */
  const act = (key: KeyPlace, held: Held): SelectHow | null | undefined => {
    const gesture = selectGesture(choosing, held, apple);
    const place = { row: key.row, col: key.col };
    if (gesture === null) return undefined;
    if (gesture === "only") dispatch({ type: "select", selection: { type: "key", ...place } });
    else if (gesture === "extend") dispatch({ type: "select", selection: selectionExtended(state.selection, place, bundle.model.keys) });
    else {
      const how = chosen.has(idOf(key)) ? "remove" : "add";
      dispatch({ type: "selectKeys", keys: [place], how });
      return how;
    }
    return null;
  };

  return {
    /** How many keys are selected. */
    count: chosen.size,
    has: (key: KeyPlace) => chosen.has(idOf(key)),
    /** A secondary press opens the quick menu: no click, Paint, move or selection. */
    secondary: (event: Held & { button: number }) => secondaryPress(event, apple),
    /** A press on a key: whether it changed the selection, and so is no click, Paint or move. */
    press(key: KeyPlace, event: Held & { button: number }): boolean {
      const how = secondaryPress(event, apple) ? undefined : act(key, event);
      if (how === undefined) drag.end();
      else drag.start(how);
      return how !== undefined;
    },
    /** The pointer came onto a key with the button down: whether a selecting drag took it. */
    cross(key: KeyPlace): boolean {
      if (!drag.active()) return false;
      const how = drag.crossing();
      if (how) dispatch({ type: "selectKeys", keys: [{ row: key.row, col: key.col }], how });
      return true;
    },
    /** Enter or Space on a key: whether it changed the selection. */
    activate: (key: KeyPlace, event: Held) => act(key, event) !== undefined,
    /** Whether the press under way selects: such a drag does not pick the key up. */
    dragSelects: drag.active,
  };
}
