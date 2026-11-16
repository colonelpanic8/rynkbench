import { describe, expect, it, vi } from "vitest";
import { mockProvider, storedKeysOf } from "../session/mock/board";
import { glove80Board } from "../session/mock/glove80";
import type { RynkSession } from "../session/types";
import { openBundle } from "../ui/bundle";
import { initialWorkbenchState } from "./initial-state";
import { ioFeaturesFor, makeIo, type WorkbenchIo } from "./io";
import { makeWorkbenchReducer } from "./reducer";

async function withLayers(check: (session: RynkSession, io: WorkbenchIo) => Promise<void>, painted = false) {
  const session = await mockProvider({
    ...glove80Board,
    defaultLayers: glove80Board.defaultLayers.map((layer) => layer.map(() => "No")),
    initialDefaultLayer: 0,
    seedCombos: [], seedMorse: [], seedForks: [],
    seedScenes: painted ? [{ layer: 1, led_id: 4, effect: { Solid: { color: { r: 1, g: 2, b: 3 } } } }] : [],
    compiledScenes: [], conditionalScenes: [], seedRuntimeConditionalScenes: [],
  }).connect();
  try {
    const bundle = await openBundle(session);
    let state = initialWorkbenchState(bundle);
    const reducer = makeWorkbenchReducer(bundle.caps.num_cols);
    const io = makeIo(session, () => state, (action) => { state = reducer(state, action); }, {
      cols: bundle.caps.num_cols, onDisconnect: () => {}, features: ioFeaturesFor(bundle),
    });
    await check(session, io);
  } finally {
    await session.close();
  }
}

describe("layer transaction preflight", () => {
  it("rejects deleting painted lighting without writing a rollback snapshot", async () => {
    await withLayers(async (session, io) => {
      const write = vi.spyOn(session.keymap, "writeKeys");
      const rename = vi.spyOn(session.keymap, "setLayerMetadata");
      expect(await io.deleteLayer(1)).toEqual({
        ok: false, message: "Lower still has painted lighting; clear it first",
      });
      expect(write).not.toHaveBeenCalled();
      expect(rename).not.toHaveBeenCalled();
    }, true);
  });

  it("still restores the original snapshot when a write fails after preflight", async () => {
    await withLayers(async (session, io) => {
      const before = await session.keymap.readAll();
      const everything = vi.spyOn(session.keymap, "replaceAll");
      vi.spyOn(session.keymap, "setLayerMetadata").mockRejectedValueOnce(new Error("flash failed"));
      expect(await io.deleteLayer(1)).toEqual({ ok: false, message: "flash failed" });
      expect(everything).not.toHaveBeenCalled(); // only what changes is written, and written back (ADR 0012)
      expect(await session.keymap.readAll()).toEqual(before);
      expect((await session.keymap.getLayerMetadata(1)).name).toBe("Lower");
    });
  });

  it("stores only the keys that move, not the whole keymap", async () => {
    await withLayers(async (session, io) => {
      const letter = { Single: { Key: { Hid: "A" } } } as const;
      for (const col of [0, 1, 2]) await session.keymap.setKey(1, 0, col, letter as never);
      const before = storedKeysOf(session);
      expect(await io.moveLayer(1, 2)).toEqual({ ok: true });
      expect(storedKeysOf(session) - before).toBe(6); // three keys leave layer 1, three arrive on layer 2
    });
  });
});
