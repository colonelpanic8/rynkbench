// The one Undo and Redo the top bar and Ctrl/⌘ Z use (ADR 0018): the
// workbench's history, the same in Draft, Live and a file. Each says what it
// did, with the way back on the toast. A Paint stroke (beginStroke, from
// pointer down to pointer up) is one step.

import { useCallback, useMemo, useRef } from "react";
import type { HistoryStep, WorkbenchAction, WorkbenchIo, WorkbenchState } from "../../workbench";
import { canTravel, hasPendingConfigurationWrite } from "../../workbench";
import type { WorkbenchContextValue } from "../state";
import { keyActionGlyph } from "../labels";
import { layerName, layerNamesOf } from "../layer-names";
import { showToast } from "../messages/store";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What a step changed, in a few words. */
export function stepLabel(step: HistoryStep, state: WorkbenchState): string {
  const kinds = new Set(step.changes.map(({ item }) => item.kind));
  const [first] = step.changes;
  if (kinds.size === 1 && first.item.kind === "key") {
    if (step.changes.length > 1) return plural(step.changes.length, "key");
    const text = keyActionGlyph(first.after as never, state.morse, layerNamesOf(state.layerMetadata)).text;
    return `${text || "an empty key"} on ${layerName(state.layerMetadata, first.item.layer)}`;
  }
  if (kinds.size === 1 && first.item.kind === "lighting") {
    return step.changes.length === 1 ? `RGB Lighting on ${layerName(state.layerMetadata, first.item.layer)}` : "RGB Lighting";
  }
  return plural(step.changes.length, "change");
}

/** A Paint stroke starts: until the pointer is let go, its changes are one step. */
export function beginStroke(dispatch: (action: WorkbenchAction) => void) {
  dispatch({ type: "historyStroke", open: true });
  const end = () => {
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    // A moment after, so the last key's change still joins the stroke.
    setTimeout(() => dispatch({ type: "historyStroke", open: false }), 0);
  };
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

export function useHistory(state: WorkbenchState, io: WorkbenchIo, dispatch: (action: WorkbenchAction) => void): WorkbenchContextValue["history"] {
  // A toast's way back can run after later renders: it reads the state then.
  const latest = useRef(state);
  latest.current = state;

  const travel = useCallback(
    async (direction: "undo" | "redo"): Promise<void> => {
      const before = latest.current;
      const step = (direction === "undo" ? before.history.past : before.history.future).at(-1);
      if (!step) return;
      const label = stepLabel(step, before);
      const result = await io.travel(direction);
      if (!result.ok) {
        if (!result.guarded) showToast(`${direction === "undo" ? "Undo" : "Redo"} did not reach the keyboard: ${result.message}`, { tone: "danger" });
        return;
      }
      const back = direction === "undo" ? "redo" : "undo";
      showToast(`${direction === "undo" ? "Undone" : "Redone"}: ${label}`, {
        action: { label: back === "undo" ? "Undo" : "Redo", run: () => void (canTravel(latest.current, back) && travel(back)) },
      });
    },
    [io],
  );

  const writing = hasPendingConfigurationWrite(state) || state.batchBusy;
  const { past, future } = state.history;
  return useMemo(
    () => ({
      canUndo: canTravel(state, "undo"),
      canRedo: canTravel(state, "redo"),
      phase: writing ? ("writing" as const) : ("idle" as const),
      error: null,
      undoLabel: past.length > 0 ? stepLabel(past.at(-1)!, state) : null,
      redoLabel: future.length > 0 ? stepLabel(future.at(-1)!, state) : null,
      undo: () => travel("undo"),
      redo: () => travel("redo"),
      clear: () => dispatch({ type: "historyClear" }),
    }),
    // Labels name layers and morse entries as they are now.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [past, future, writing, state.layerMetadata, state.morse, travel, dispatch],
  );
}
