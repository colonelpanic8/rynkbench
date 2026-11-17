// Send: the draft goes to the keyboard through the one write path (ADR 0012).
// Read the keyboard fresh, check that nothing you changed was also changed on
// the keyboard since, write only what differs, read back once. What does not
// reach the keyboard stays in the draft; sending again plans what is left.

import type { WorkbenchState } from "../../model/workbench-state";
import type { RynkSession } from "../../session/types";
import {
  applyPatch,
  conflicts,
  differences,
  itemKey,
  partsOf,
  readImage,
  syncTo,
  valueAt,
  withValues,
  type ImageFeatures,
  type ReadImage,
  type SyncItem,
} from "../../sync";
import { errorMessage } from "../../session/errors";
import { sameValue } from "../../model/deep-equal";
import { draftOf, draftWithBasis } from "./want";
import type { WorkbenchDispatch } from "../io";

export interface SendOptions {
  /** Asked when items you changed were also changed on the keyboard; true sends anyway. */
  confirmOverwrite?: (items: SyncItem[]) => Promise<boolean>;
  /** Live: the items being set right now, written without asking. Any other
   *  drafted item that was also changed on the keyboard is not sent and stays
   *  in the draft, where Send asks about it. */
  settingNow?: readonly SyncItem[];
}

/** Live's own send once edits pause: nobody is there to ask, so nothing the
 *  keyboard changed is overwritten. */
export const UNATTENDED: SendOptions = { settingNow: [] };

export interface SendDeps {
  session: RynkSession;
  getState: () => WorkbenchState;
  dispatch: WorkbenchDispatch;
  features: ImageFeatures;
}

/** `unread`: the keyboard could not be read after the failure, so what reached it is not known. */
export type SendResult = { ok: true } | { ok: false; message: string; guarded?: true; unread?: true };

export async function sendStaged(deps: SendDeps, options: SendOptions = {}): Promise<SendResult> {
  const { session, getState, dispatch, features } = deps;
  const start = getState();
  if (start.batchBusy) return { ok: false, message: "the draft is already being sent" };
  const patch = draftWithBasis(start);
  if (patch.length === 0) return { ok: true };
  dispatch({ type: "batchApplyStart" });
  // Read what the base holds, so the read-back can take its place.
  const reading = { ...features, ...partsOf(start.base) };
  let sent: SyncItem[] = [];
  try {
    // The draft on top of what the keyboard holds now; what you started from is
    // the same with each drafted item as it was based on (an item never read,
    // such as an encoder, was based on nothing and cannot clash).
    const now = await readImage(session, reading);
    const want = applyPatch(now, patch, "after");
    const startedFrom = applyPatch(now, patch.filter(({ before }) => before !== undefined), "before");
    const clashes = conflicts(startedFrom, now, want);
    let sending = want;
    if (options.settingNow) {
      const mine = new Set(options.settingNow.map(itemKey));
      const others = clashes.filter((item) => !mine.has(itemKey(item)));
      sending = withValues(want, others.map((item) => ({ item, value: valueAt(now, item) })));
    } else if (clashes.length > 0 && options.confirmOverwrite && !(await options.confirmOverwrite(clashes))) {
      // The read stays: Discard lands on what the keyboard holds.
      stored(now);
      const message = "Not sent: the keyboard keeps its own changes";
      dispatch({ type: "batchApplyDone", error: message });
      return { ok: false, message, guarded: true };
    }
    sent = differences(now, sending).map(({ item }) => item);
    const { readback } = await syncTo(session, now, sending, reading);
    stored(readback, sent);
    if (patch.some(({ item }) => item.kind === "lighting" || item.kind === "rules")) {
      dispatch({ type: "lightingStateSet", state: await session.lighting.state() });
    }
    dispatch({ type: "batchApplyDone", error: leftBehind() });
    return { ok: true };
  } catch (error) {
    const message = errorMessage(error);
    // Whatever reached the keyboard leaves the draft; the rest is sent next time.
    let unread = false;
    try {
      stored(await readImage(session, reading), sent);
    } catch {
      // The keyboard cannot be read now: everything stays in the draft.
      unread = true;
    }
    dispatch({ type: "batchApplyDone", error: message });
    return unread ? { ok: false, message, unread } : { ok: false, message };
  }

  /** Why changes this send held are still in the draft as they were; null when none are. */
  function leftBehind(): string | null {
    const drafted = new Map(draftOf(getState()).changes.map(({ item, after }) => [itemKey(item), after]));
    const left = patch.filter(({ item, after }) => drafted.has(itemKey(item)) && sameValue(drafted.get(itemKey(item)), after)).length;
    return left === 0 ? null : `${left} ${left === 1 ? "change waits" : "changes wait"} for Send: the keyboard holds something else there`;
  }

  /** The keyboard now holds what was read: what reached it is no longer in the
   *  draft, and what this send wrote (`wrote`) is based on it. */
  function stored({ activeLayers: _layers, layerStateComplete: _complete, ...image }: ReadImage, wrote: SyncItem[] = []) {
    dispatch({ type: "draftStored", image, wrote });
  }
}
