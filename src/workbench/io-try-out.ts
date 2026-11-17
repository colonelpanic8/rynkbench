// The io's try-out lights: the keyboard's overlay, shown at once and never
// stored (the firmware keeps it in memory only), so they stay out of the
// draft, the wanted image and the history. A change waits a moment for more,
// then the overlay is replaced whole: a Paint stroke is one write.

import { overlaysEqual } from "../model/lighting/compare";
import { keptCells } from "../model/lighting/try-out";
import { errorMessage } from "../session/errors";
import { applyOperation } from "./apply";
import type { IoContext, IoWriteResult, WorkbenchIo } from "./io";

/** How long a try-out change waits for more before it is sent. */
export const TRY_OUT_PAUSE_MS = 200;

type TryOutIo = Pick<WorkbenchIo, "tryOut" | "clearTryOut" | "keepTryOut">;

export function tryOutIo(context: IoContext): TryOutIo {
  const { session, getState, dispatch } = context;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let sending = false;

  const waiting = () => !overlaysEqual(getState().tryOut, getState().applied);
  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const schedule = () => {
    cancel();
    timer = setTimeout(() => void send(), TRY_OUT_PAUSE_MS);
  };
  const failed = (err: unknown): IoWriteResult => {
    const message = errorMessage(err);
    dispatch({ type: "tryOutFailed", error: message });
    return { ok: false, message };
  };

  // One write at a time; what changed meanwhile goes after it.
  async function send() {
    timer = null;
    if (sending || !waiting()) return;
    sending = true;
    const cells = Object.values(getState().tryOut);
    try {
      dispatch({ type: "tryOutSent", state: await session.lighting.replaceOverlay(cells), cells });
      sending = false;
      if (waiting()) schedule();
    } catch (err) {
      sending = false;
      failed(err);
    }
  }

  async function clear(): Promise<IoWriteResult> {
    cancel();
    try {
      dispatch({ type: "tryOutCleared", state: await session.lighting.clearOverlay() });
      return { ok: true };
    } catch (err) {
      return failed(err);
    }
  }

  return {
    tryOut(cells, erase) {
      dispatch({ type: "tryOutSet", cells, erase });
      schedule();
    },
    clearTryOut: clear,
    async keepTryOut(layer) {
      const cells = keptCells(getState().tryOut);
      if (cells.length === 0) return { ok: true };
      const kept = await applyOperation(context, "set_key_effects", { layer, cells });
      return kept.ok ? clear() : kept;
    },
  };
}
