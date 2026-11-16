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
    state.history.suspended ||
    state.lightingBusy ||
    state.pointingBusy ||
    state.batchBusy ||
    Object.values(state.pending).some((item) => item.status === "pending")
  );
}

/** Whether Undo or Redo may go now: there is a step, and nothing is being written. */
export function canTravel(state: WorkbenchState, direction: "undo" | "redo"): boolean {
  if (state.batchBusy || hasPendingConfigurationWrite(state)) return false;
  return (direction === "undo" ? state.history.past : state.history.future).length > 0;
}
