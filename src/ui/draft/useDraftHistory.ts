// Drives the undo and redo of what is staged (draftHistory.ts): records a step
// each time the staged keys or the layers' lighting change, stages them back
// on undo, and starts over when the draft is sent or discarded
// (resetDraftHistory). A Paint stroke (beginStroke, from pointer down to
// pointer up) is one step. In Live and in a file only lighting is staged, so
// its steps are lighting; the Workbench undoes them in turn with key writes.

import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { keyActionGlyph } from "../labels";
import { layerName, layerNamesOf } from "../layer-names";
import { showToast } from "../messages/store";
import { lightingDraftFor } from "../state";
import { nextEditOrder } from "../../model/history";
import type { WorkbenchAction, WorkbenchState } from "../../model/workbench-state";
import { layerLightingActions } from "./changes";
import { emptyHistory, isEmptyStep, record, redo, stepBetween, undo, type DraftHistory, type DraftImage, type Step } from "./draftHistory";

let history: DraftHistory = emptyHistory();
/** The next change is not an edit but a discard or an undo, which always
 *  change something: skip it. Never armed when nothing may change, or it would
 *  swallow the next real edit. */
let skipNext = false;
/** An open Paint stroke; once it has a step, what it changes joins that step. */
let stroke: { recorded: boolean } | null = null;
const listeners = new Set<() => void>();
function set(next: DraftHistory) {
  history = next;
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The draft was sent: a new history. What the send changed is already
 *  recorded (as nothing: the keyboard now holds what the draft held). */
export function resetDraftHistory() {
  set(emptyHistory());
}

/** The draft is being discarded: a new history, and the discard is no step.
 *  Called just before the discard's changes, in the same go. */
export function discardDraftHistory() {
  skipNext = true;
  set(emptyHistory());
}

/** A Paint stroke starts: until the pointer is let go, its changes are one step.
 *  It ends a moment after, so the last key's change still joins it. */
export function beginStroke() {
  const mine = { recorded: false };
  stroke = mine;
  const end = () => {
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    setTimeout(() => {
      if (stroke === mine) stroke = null;
    }, 0);
  };
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Called by the Workbench itself, above its context, so it is given what it needs. */
export function useDraftHistory(state: WorkbenchState, dispatch: (action: WorkbenchAction) => void, cols: number) {
  const current = useSyncExternalStore(subscribe, () => history, () => history);
  const image = useMemo(
    (): DraftImage => ({
      layers: state.layers,
      stagedKeys: state.stagedKeys,
      lighting: state.layers.map((_, layer) => lightingDraftFor(state, layer)),
      rules: state.runtimeConditionalDraft,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.layers, state.stagedKeys, state.layerDrafts, state.scenes, state.runtimeConditionalDraft],
  );
  const previous = useRef(image);
  // An Undo toast's action can run after later renders: it reads the state then.
  const latest = useRef(state);
  useLayoutEffect(() => {
    latest.current = state;
  });

  useEffect(() => {
    const before = previous.current;
    previous.current = image;
    if (skipNext) {
      skipNext = false;
      return;
    }
    const step = stepBetween(before, image, cols);
    if (isEmptyStep(step)) return;
    set(record(history, { ...step, order: nextEditOrder() }, stroke?.recorded ?? false));
    if (stroke) stroke.recorded = true;
  }, [image, cols]);

  const label = (step: Step | undefined) => {
    if (!step) return null;
    const { keys, lights, rules } = step;
    if (lights.length + (rules ? 1 : 0) === 0) {
      if (keys.length > 1) return plural(keys.length, "key");
      const [change] = keys;
      return `${keyActionGlyph(change.to, state.morse, layerNamesOf(state.layerMetadata)).text || "an empty key"} on ${layerName(state.layerMetadata, change.layer)}`;
    }
    if (keys.length > 0) return plural(keys.length + lights.length + (rules ? 1 : 0), "change");
    return lights.length === 1 ? `RGB Lighting on ${layerName(state.layerMetadata, lights[0].layer)}` : "RGB Lighting";
  };
  const travel = (direction: "undo" | "redo") => {
    const moved = direction === "undo" ? undo(history) : redo(history);
    if (!moved) return;
    skipNext = true;
    set(moved.history);
    const back = direction === "undo";
    for (const change of moved.step.keys) {
      dispatch({ type: "keyStage", layer: change.layer, row: change.row, col: change.col, action: back ? change.from : change.to });
    }
    for (const change of moved.step.lights) {
      const cells = Object.values(back ? change.from : change.to);
      for (const action of layerLightingActions(latest.current, change.layer, cells)) dispatch(action);
    }
    if (moved.step.rules) dispatch({ type: "conditionalDraft", cells: back ? moved.step.rules.from : moved.step.rules.to });
    const again = back ? "Redo" : "Undo";
    showToast(`${back ? "Undone" : "Redone"}: ${label(moved.step)}`, {
      action: { label: again, run: () => travel(back ? "redo" : "undo") },
    });
  };

  return {
    /** When the steps undo and redo would take were done (model/history.ts). */
    tops: { past: current.past.at(-1)?.order, future: current.future.at(-1)?.order },
    canUndo: current.past.length > 0,
    canRedo: current.future.length > 0,
    undoLabel: label(current.past.at(-1)),
    redoLabel: label(current.future.at(-1)),
    undo: () => travel("undo"),
    redo: () => travel("redo"),
  };
}
