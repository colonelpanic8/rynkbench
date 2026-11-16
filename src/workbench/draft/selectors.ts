// Questions asked of the workbench state about what is waiting: drafted
// changes, writes in flight, whether undo may travel. Pure.

import type { WorkbenchState } from "../../model/workbench-state";
import { pointingConfigsEqual } from "../../model/pointing";
import { draftOf } from "./want";

/** How many keys, encoders and slots the draft changes, unsent. */
export function draftEditCount(state: WorkbenchState): number {
  return draftOf(state).changes.filter(({ item }) => item.kind === "key" || item.kind === "encoder" || item.kind === "slot").length;
}

export function pointingDraftDirty(state: WorkbenchState): boolean {
  return !pointingConfigsEqual(state.pointingConfig, state.pointingDraft);
}

export function hasPendingConfigurationWrite(state: WorkbenchState): boolean {
  return (
    state.keyEditHistorySuspended ||
    state.lightingBusy ||
    state.pointingBusy ||
    state.batchBusy ||
    Object.values(state.pending).some((item) => item.status === "pending")
  );
}

export function canTravelKeyEditHistory(
  state: WorkbenchState,
  direction: "undo" | "redo",
): boolean {
  if (state.keyEditHistory.operation || hasPendingConfigurationWrite(state)) return false;
  // Staged batch edits sit between the history's device state and the boards':
  // traveling would write under them and stale their restore points.
  if (draftEditCount(state) > 0) return false;
  return direction === "undo"
    ? state.keyEditHistory.past.length > 0
    : state.keyEditHistory.future.length > 0;
}
