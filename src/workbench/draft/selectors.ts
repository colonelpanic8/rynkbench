// Questions asked of the workbench state about what is waiting: drafted
// edits, writes in flight, whether undo may travel. Pure.

import type { WorkbenchState } from "../../model/workbench-state";
import { pointingConfigsEqual } from "../../model/pointing";

/** How many key, encoder and slot edits the draft is holding, unsent. */
export function stagedEditCount(state: WorkbenchState): number {
  return Object.keys(state.stagedKeys).length + Object.keys(state.stagedEncoders).length + Object.keys(state.stagedSlots).length;
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
  if (stagedEditCount(state) > 0) return false;
  return direction === "undo"
    ? state.keyEditHistory.past.length > 0
    : state.keyEditHistory.future.length > 0;
}
