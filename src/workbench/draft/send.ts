// Send: the draft goes to the keyboard through the one write path (ADR 0012).
// Read the keyboard fresh, check that nothing you changed was also changed on
// the keyboard since, write only what differs, read back once. What does not
// reach the keyboard stays in the draft; sending again plans what is left.

import type { WorkbenchState } from "../../model/workbench-state";
import type { RynkSession } from "../../session/types";
import { conflicts, readImage, syncTo, type KeyboardImage, type ImageFeatures, type SyncItem } from "../../sync";
import { same } from "../../model/deep-equal";
import { errorMessage } from "../../session/errors";
import { draftBase, draftImage } from "./image";
import { changedRuleLeds, lightingLayers } from "./changes";
import { stagedEditCount } from "./selectors";
import type { WorkbenchDispatch } from "../io";

export interface SendOptions {
  /** Asked when items you changed were also changed on the keyboard; true sends anyway. */
  confirmOverwrite?: (items: SyncItem[]) => Promise<boolean>;
}

export interface SendDeps {
  session: RynkSession;
  getState: () => WorkbenchState;
  dispatch: WorkbenchDispatch;
  cols: number;
  features: ImageFeatures;
}

export type SendResult = { ok: true } | { ok: false; message: string; guarded?: true };

/** Marks every drafted key and encoder the keyboard now holds as sent. */
function markSent(image: KeyboardImage, state: WorkbenchState, cols: number, dispatch: WorkbenchDispatch): number {
  let keys = 0;
  for (const edit of Object.values(state.stagedKeys)) {
    if (!same(image.layers[edit.layer]?.[edit.row * cols + edit.col], edit.action)) continue;
    dispatch({ type: "keyStageApplied", layer: edit.layer, row: edit.row, col: edit.col });
    keys += 1;
  }
  for (const edit of Object.values(state.stagedEncoders)) {
    if (same(image.encoders[edit.layer]?.[edit.id], edit.action)) {
      dispatch({ type: "encoderStageApplied", layer: edit.layer, id: edit.id });
    }
  }
  for (const edit of Object.values(state.stagedSlots)) {
    if (same(image[edit.kind][edit.index], edit.value)) dispatch({ type: "slotStageApplied", kind: edit.kind, index: edit.index });
  }
  // Sent keys are a bulk write outside per-key history, like an import.
  if (keys > 0) dispatch({ type: "keyHistoryClear" });
  return keys;
}

export async function sendStaged(deps: SendDeps, options: SendOptions = {}): Promise<SendResult> {
  const { session, getState, dispatch, cols, features } = deps;
  const start = getState();
  if (start.batchBusy) return { ok: false, message: "the draft is already being sent" };
  const lighting = lightingLayers(start).size > 0;
  const rules = changedRuleLeds(start.runtimeConditionalDraft, start.runtimeConditionalScenes).size > 0;
  if (stagedEditCount(start) === 0 && !lighting && !rules) {
    return { ok: true };
  }
  dispatch({ type: "batchApplyStart" });
  try {
    const now = await readImage(session, features);
    const want = draftImage(now, start, cols);
    const clashes = conflicts(draftBase(now, start, cols), now, want);
    if (clashes.length > 0 && options.confirmOverwrite && !(await options.confirmOverwrite(clashes))) {
      dispatch({ type: "batchApplyDone", error: null });
      return { ok: false, message: "Not sent: the keyboard keeps its own changes", guarded: true };
    }
    const { readback } = await syncTo(session, now, want, features);
    markSent(readback, start, cols, dispatch);
    if (lighting || rules) {
      const lightingState = await session.lighting.state();
      if (lighting) dispatch({ type: "scenesApplied", state: lightingState, cells: readback.scenes });
      if (rules) dispatch({ type: "conditionalApplied", state: lightingState, cells: readback.runtimeConditionalScenes });
    }
    dispatch({ type: "batchApplyDone", error: null });
    return { ok: true };
  } catch (error) {
    const message = errorMessage(error);
    // Whatever reached the keyboard leaves the draft; the rest is sent next time.
    try {
      markSent(await readImage(session, features), start, cols, dispatch);
    } catch {
      // The keyboard cannot be read now: everything stays in the draft.
    }
    dispatch({ type: "batchApplyDone", error: message });
    return { ok: false, message };
  }
}
