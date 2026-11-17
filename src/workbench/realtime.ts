// RGB Apply to the keyboard (ADR 0019, amended): with the preference on, the
// panels' Apply for the lights as a whole (on or off, brightness, background)
// and the effects (effect, overlay, palette, value, speed, parameters) writes
// to the keyboard at once, in Draft as in Live. The panels write nothing
// before Apply: these controls are stored in flash.
//
// An Apply is still a commit to what you want and one Undo step. The writer
// then brings the keyboard to what you want for these items only, through the
// one write path's planner and writer, read back: one write in flight, and
// never two within 250 ms (a quick second Apply waits and sends the latest).
// A write that fails leaves the items in the draft in Draft, and in Live puts
// them back as the keyboard holds them.

import { differences, planSync, readSettings, valueAt, withValues, writePlan, type ItemKind, type KeyboardImage, type SyncItem } from "../sync";
import { errorMessage } from "../session/errors";
import { wantOf } from "./draft/want";
import type { IoContext } from "./io";

export const REALTIME_KINDS: ReadonlySet<ItemKind> = new Set(["lightingState", "extension", "extensionOverlay", "effectParam"]);

/** The least time between two realtime writes, in milliseconds. */
export const REALTIME_GAP_MS = 250;

export interface RealtimeWriter {
  /** Whether lighting changes go to the keyboard at once (the person's preference). */
  enabled(): boolean;
  /** Commits these items to what you want and has them written soon. */
  commit(values: Array<{ item: SyncItem; value: unknown }>): void;
  /** Has the realtime items that differ from the keyboard written soon (after Undo in Draft). */
  schedule(): void;
  /** Resolves once nothing is waiting or being written (for tests). */
  settled(): Promise<void>;
}

/** The realtime items where what you want differs from what the keyboard holds. */
export function realtimeChanges(base: KeyboardImage, want: KeyboardImage): Array<{ item: SyncItem; value: unknown }> {
  return differences(base, want)
    .filter(({ item }) => REALTIME_KINDS.has(item.kind))
    .map(({ item, to }) => ({ item, value: to }));
}

export function realtimeWriter(
  context: Pick<IoContext, "session" | "getState" | "dispatch" | "cols">,
  enabled: () => boolean,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): RealtimeWriter {
  const { session, getState, dispatch, cols } = context;
  let running: Promise<void> | null = null;
  let again = false;
  let last = -Infinity;

  async function writeOnce(): Promise<boolean> {
    const state = getState();
    const values = realtimeChanges(state.base, wantOf(state));
    if (values.length === 0) return false;
    const gap = last + REALTIME_GAP_MS - Date.now();
    if (gap > 0) await wait(gap);
    // The latest value: what you want may have moved on while waiting.
    const now = getState();
    const latest = realtimeChanges(now.base, wantOf(now));
    if (latest.length === 0) return false;
    last = Date.now();
    try {
      await writePlan(session, planSync(now.base, withValues(now.base, latest), cols));
      const kinds = new Set(latest.map(({ item }) => item.kind));
      const params = [...new Set(latest.flatMap(({ item }) => (item.kind === "effectParam" ? [item.effect] : [])))];
      const [parts, lighting] = await Promise.all([
        readSettings(session, {
          scenesSupported: false,
          conditionalScenesSupported: false,
          pointingSupported: false,
          lightingOutputSupported: false,
          extension: kinds.has("extension"),
          extensionOverlay: kinds.has("extensionOverlay"),
          paramEffects: params,
        }),
        kinds.has("lightingState") ? session.lighting.state() : Promise.resolve(undefined),
      ]);
      dispatch({ type: "realtimeStored", parts, lighting });
    } catch (error) {
      const message = errorMessage(error);
      dispatch({ type: "lightingBusy", busy: false, error: message });
      // Live has no draft to keep them in: put back what the keyboard holds.
      const after = getState();
      if (!after.batchMode) {
        const back = latest.map(({ item }) => ({ item, value: valueAt(after.base, item) }));
        dispatch({ type: "commit", image: withValues(wantOf(after), back), join: true });
      }
      return false;
    }
    return true;
  }

  function schedule() {
    if (running) {
      again = true;
      return;
    }
    running = (async () => {
      do {
        again = false;
        while (await writeOnce()) {
          // Keep going while what you want moves on.
        }
      } while (again);
    })().finally(() => {
      running = null;
    });
  }

  return {
    enabled,
    commit(values) {
      if (getState().batchBusy) return;
      dispatch({ type: "wantSet", values });
      schedule();
    },
    schedule,
    async settled() {
      while (running) await running;
    },
  };
}
