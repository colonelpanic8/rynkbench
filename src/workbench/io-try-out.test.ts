// Try-out lights through the io on a simulated Glove80: what reaches the
// keyboard's overlay, when, and that none of it touches the draft, what you
// want or the history, until "Keep these lights" makes it one change.

import { describe, expect, it, vi } from "vitest";
import { mockProvider } from "../session/mock/board";
import { glove80Board } from "../session/mock/glove80";
import type { WorkbenchState } from "../model/workbench-state";
import type { RynkSession } from "../session/types";
import { DEFAULT_TIMING } from "../model/lighting/effect";
import { tryOutPlan } from "../model/lighting/try-out";
import type { KeyLight } from "../model/lighting/key-light";
import { openBundle } from "../ui/bundle";
import { ledNodesOf } from "./apply";
import { draftOf, wantOf } from "./draft/want";
import { initialWorkbenchState } from "./initial-state";
import { ioFeaturesFor, makeIo, type WorkbenchIo } from "./io";
import { TRY_OUT_PAUSE_MS } from "./io-try-out";
import { lightingDraftFor } from "./lighting-drafts";
import { makeWorkbenchReducer } from "./reducer";

const color = (r: number, g: number, b: number): KeyLight => ({ kind: "color", color: { r, g, b }, effect: "Solid", timing: DEFAULT_TIMING });
const RED = color(255, 0, 0);
const BLUE = color(0, 0, 255);

async function onBoard(draft: boolean, check: (io: WorkbenchIo, state: () => WorkbenchState, session: RynkSession) => Promise<void>) {
  const session = await mockProvider({ ...glove80Board, seedScenes: [] }).connect();
  try {
    const bundle = await openBundle(session);
    let state: WorkbenchState = { ...initialWorkbenchState(bundle), batchMode: draft };
    const reducer = makeWorkbenchReducer(bundle.caps.num_cols);
    const io = makeIo(session, () => state, (action) => { state = reducer(state, action); }, {
      cols: bundle.caps.num_cols, onDisconnect: () => {}, features: ioFeaturesFor(bundle), ledNodes: ledNodesOf(bundle),
    });
    await check(io, () => state, session);
  } finally {
    await session.close();
  }
}

/** Gives keys a try-out light, as the tab and Paint do. */
function tryOn(io: WorkbenchIo, light: KeyLight, leds: number[], lifetimeMs: number | null = null) {
  const plan = tryOutPlan(light, leds, lifetimeMs)!;
  io.tryOut(plan.cells, plan.erase);
}

/** Long enough for the pause and the write after it. */
const sent = () => new Promise((resolve) => setTimeout(resolve, TRY_OUT_PAUSE_MS + 150));

describe("try-out lights", () => {
  it("reach the keyboard's overlay and change nothing you want, the draft or the history", async () => {
    for (const draft of [true, false]) {
      await onBoard(draft, async (io, state, session) => {
        const before = state();
        tryOn(io, RED, [3, 4]);
        await sent();
        expect((await session.lighting.readOverlay()).map((cell) => cell.led_id).sort()).toEqual([3, 4]);
        expect(Object.keys(state().applied)).toEqual(["3", "4"]);
        expect(wantOf(state())).toEqual(wantOf(before));
        expect(draftOf(state()).changes).toEqual([]);
        expect(state().history).toBe(before.history);
        expect(state().base).toEqual(before.base);
      });
    }
  });

  it("carry their lifetime to the keyboard", async () => {
    await onBoard(true, async (io, _state, session) => {
      tryOn(io, RED, [3], 5000);
      await sent();
      const [cell] = await session.lighting.readOverlay();
      expect(cell.ttl_ms).toBeGreaterThan(4000);
      expect(cell.ttl_ms).toBeLessThanOrEqual(5000);
    });
  });

  it("go from a key with Off", async () => {
    await onBoard(true, async (io, state, session) => {
      tryOn(io, RED, [3, 4]);
      await sent();
      tryOn(io, { kind: "off" }, [3]);
      expect(Object.keys(state().tryOut)).toEqual(["4"]);
      await sent();
      expect((await session.lighting.readOverlay()).map((cell) => cell.led_id)).toEqual([4]);
    });
  });

  it("from a Paint stroke over many keys are one write", async () => {
    await onBoard(true, async (io, _state, session) => {
      const replace = vi.spyOn(session.lighting, "replaceOverlay");
      for (const led of [1, 2, 3, 4, 5, 6]) {
        tryOn(io, RED, [led]);
        await new Promise((resolve) => setTimeout(resolve, TRY_OUT_PAUSE_MS / 4));
      }
      await sent();
      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace.mock.calls[0][0]).toHaveLength(6);
    });
  });

  it("are cleared off the keyboard", async () => {
    await onBoard(true, async (io, state, session) => {
      tryOn(io, RED, [3, 4]);
      await sent();
      expect(await io.clearTryOut()).toEqual({ ok: true });
      expect(await session.lighting.readOverlay()).toEqual([]);
      expect(state().applied).toEqual({});
      expect(state().tryOut).toEqual({});
    });
  });

  it("kept on a layer are one change and one Undo step, and leave the overlay empty", async () => {
    await onBoard(true, async (io, state, session) => {
      tryOn(io, RED, [3], 5000);
      tryOn(io, BLUE, [4]);
      await sent();
      expect(await io.keepTryOut(1)).toEqual({ ok: true });
      expect(Object.values(lightingDraftFor(state(), 1)).map((cell) => [cell.led_id, cell.ttl_ms])).toEqual([[3, undefined], [4, undefined]]);
      expect(draftOf(state()).changes.map((change) => change.item)).toEqual([{ kind: "lighting", layer: 1 }]);
      expect(state().history.past).toHaveLength(1);
      expect(await session.lighting.readOverlay()).toEqual([]);
      expect(await io.travel("undo")).toEqual({ ok: true });
      expect(lightingDraftFor(state(), 1)).toEqual({});
    });
  });
});
