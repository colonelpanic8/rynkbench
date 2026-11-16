// Send: the draft goes to the keyboard through the one write path (ADR 0012).
// Read the keyboard fresh, check that nothing you changed was also changed on
// the keyboard since, write only what differs, read back once. What does not
// reach the keyboard stays in the draft; sending again plans what is left.

import type { WorkbenchState } from "../../model/workbench-state";
import type { RynkSession } from "../../session/types";
import { applyPatch, conflicts, readImage, syncTo, valueAt, type KeyboardImage, type ImageFeatures, type SyncItem } from "../../sync";
import { sameValue } from "../../model/deep-equal";
import { errorMessage } from "../../session/errors";
import { draftOf } from "./want";
import type { WorkbenchDispatch } from "../io";

export interface SendOptions {
  /** Asked when items you changed were also changed on the keyboard; true sends anyway. */
  confirmOverwrite?: (items: SyncItem[]) => Promise<boolean>;
}

export interface SendDeps {
  session: RynkSession;
  getState: () => WorkbenchState;
  dispatch: WorkbenchDispatch;
  features: ImageFeatures;
}

export type SendResult = { ok: true } | { ok: false; message: string; guarded?: true };

export async function sendStaged(deps: SendDeps, options: SendOptions = {}): Promise<SendResult> {
  const { session, getState, dispatch, features } = deps;
  const start = getState();
  if (start.batchBusy) return { ok: false, message: "the draft is already being sent" };
  const patch = draftOf(start).changes;
  if (patch.length === 0) return { ok: true };
  dispatch({ type: "batchApplyStart" });
  try {
    // The draft on top of what the keyboard holds now; what you started from is
    // the same with each drafted item as it was based on (an item never read,
    // such as an encoder, was based on nothing and cannot clash).
    const now = await readImage(session, features);
    const want = applyPatch(now, patch, "after");
    const startedFrom = applyPatch(now, patch.filter(({ before }) => before !== undefined), "before");
    const clashes = conflicts(startedFrom, now, want);
    if (clashes.length > 0 && options.confirmOverwrite && !(await options.confirmOverwrite(clashes))) {
      dispatch({ type: "batchApplyDone", error: null });
      return { ok: false, message: "Not sent: the keyboard keeps its own changes", guarded: true };
    }
    const { readback } = await syncTo(session, now, want, features);
    stored(readback);
    if (patch.some(({ item }) => item.kind === "lighting" || item.kind === "rules")) {
      dispatch({ type: "lightingStateSet", state: await session.lighting.state() });
    }
    dispatch({ type: "batchApplyDone", error: null });
    return { ok: true };
  } catch (error) {
    const message = errorMessage(error);
    // Whatever reached the keyboard leaves the draft; the rest is sent next time.
    try {
      stored(await readImage(session, features));
    } catch {
      // The keyboard cannot be read now: everything stays in the draft.
    }
    dispatch({ type: "batchApplyDone", error: message });
    return { ok: false, message };
  }

  /** The keyboard now holds `image`: what reached it is no longer in the draft. */
  function stored(image: KeyboardImage) {
    dispatch({ type: "draftStored", image });
    // Sent keys are a bulk write outside per-key history, like an import.
    if (patch.some(({ item, after }) => item.kind === "key" && sameValue(valueAt(image, item), after))) {
      dispatch({ type: "keyHistoryClear" });
    }
  }
}
