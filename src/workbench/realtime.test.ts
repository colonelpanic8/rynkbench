import { describe, expect, it, vi } from "vitest";
import { mockProvider } from "../session/mock/board";
import { glove80Board } from "../session/mock/glove80";
import type { RynkSession } from "../session/types";
import { openBundle } from "../ui/bundle";
import { initialWorkbenchState } from "./initial-state";
import { ioFeaturesFor, makeIo, type WorkbenchIo } from "./io";
import { makeWorkbenchReducer } from "./reducer";
import type { WorkbenchState } from "../model/workbench-state";
import { draftOf } from "./draft/want";
import { mutableLighting } from "../sync";

/** A simulated Glove80 with realtime lighting on, in Live or Draft. */
async function withBoard(draft: boolean, check: (session: RynkSession, io: WorkbenchIo, state: () => WorkbenchState) => Promise<void>) {
  const session = await mockProvider(glove80Board).connect();
  try {
    const bundle = await openBundle(session);
    let state: WorkbenchState = { ...initialWorkbenchState(bundle), batchMode: draft };
    const reducer = makeWorkbenchReducer(bundle.caps.num_cols);
    const io = makeIo(session, () => state, (action) => (state = reducer(state, action)), {
      cols: bundle.caps.num_cols,
      onDisconnect: () => {},
      features: ioFeaturesFor(bundle),
      realtimeLighting: () => true,
    });
    await check(session, io, () => state);
  } finally {
    await session.close();
  }
}

const lights = (state: WorkbenchState) => mutableLighting(state.lightingState!);

describe("realtime lighting (ADR 0019)", () => {
  it("in Draft: brightness reaches the keyboard at once and leaves nothing in the draft", async () => {
    await withBoard(true, async (session, io, state) => {
      io.setLightingState({ ...lights(state()), output_brightness: 42 });
      expect(state().lightingState?.output_brightness).toBe(42);
      await io.realtimeSettled();
      expect((await session.lighting.state()).output_brightness).toBe(42);
      expect(draftOf(state()).changes).toEqual([]);
      expect(state().history.past).toHaveLength(1);
    });
  });

  it("a drag writes the latest value, not every one", async () => {
    await withBoard(true, async (session, io, state) => {
      const write = vi.spyOn(session.lighting, "setState");
      for (const value of [10, 20, 30, 40, 50]) io.setLightingState({ ...lights(state()), output_brightness: value });
      await io.realtimeSettled();
      expect((await session.lighting.state()).output_brightness).toBe(50);
      expect(write.mock.calls.length).toBeLessThanOrEqual(2);
      expect(draftOf(state()).changes).toEqual([]);
    });
  });

  it("in Draft: Undo puts the keyboard back too", async () => {
    await withBoard(true, async (session, io, state) => {
      const before = state().lightingState!.output_brightness;
      io.setLightingState({ ...lights(state()), output_brightness: before === 7 ? 8 : 7 });
      await io.realtimeSettled();
      expect(await io.travel("undo")).toEqual({ ok: true });
      await io.realtimeSettled();
      expect((await session.lighting.state()).output_brightness).toBe(before);
      expect(draftOf(state()).changes).toEqual([]);
    });
  });

  it("in Draft: a failed write stays in the draft, for Send", async () => {
    await withBoard(true, async (session, io, state) => {
      vi.spyOn(session.lighting, "setState").mockRejectedValueOnce(new Error("busy"));
      io.setLightingState({ ...lights(state()), output_brightness: 3 });
      await io.realtimeSettled();
      expect(state().lightingError).toBe("busy");
      expect(draftOf(state()).changes.map(({ item }) => item.kind)).toEqual(["lightingState"]);
    });
  });

  it("in Live: a failed write puts the controls back as the keyboard holds them", async () => {
    await withBoard(false, async (session, io, state) => {
      const before = state().lightingState!.output_brightness;
      vi.spyOn(session.lighting, "setState").mockRejectedValueOnce(new Error("busy"));
      io.setLightingState({ ...lights(state()), output_brightness: before === 3 ? 4 : 3 });
      await io.realtimeSettled();
      expect(state().lightingState?.output_brightness).toBe(before);
      expect(draftOf(state()).changes).toEqual([]);
    });
  });

  it("an effect's speed goes at once too", async () => {
    await withBoard(true, async (session, io, state) => {
      const extension = state().lightingExtension!.state;
      for (const speed of [11, 22, 33]) io.setExtensionState({ ...extension, speed }, [], state().lightingExtensionLayers?.overlay);
      await io.realtimeSettled();
      expect((await session.lighting.extension()).state.speed).toBe(33);
      expect(draftOf(state()).changes).toEqual([]);
    });
  });
});
