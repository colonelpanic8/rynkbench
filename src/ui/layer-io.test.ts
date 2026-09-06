import { describe, expect, it, vi } from "vitest";
import { mockProvider } from "../session/mock/board";
import { glove80Board } from "../session/mock/glove80";
import type { RynkSession } from "../session/types";
import { openBundle } from "./bundle";
import { initialWorkbenchState, ioFeaturesFor, makeIo, makeWorkbenchReducer, type WorkbenchIo } from "./state";

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
      const write = vi.spyOn(session.keymap, "replaceAll");
      expect(await io.deleteLayer(1)).toEqual({
        ok: false, message: "layer 1 still has painted lighting; clear it first",
      });
      expect(write).not.toHaveBeenCalled();
    }, true);
  });

  it("still restores the original snapshot when a write fails after preflight", async () => {
    await withLayers(async (session, io) => {
      const before = await session.keymap.readAll();
      const write = vi.spyOn(session.keymap, "replaceAll");
      vi.spyOn(session.keymap, "setLayerMetadata").mockRejectedValueOnce(new Error("flash failed"));
      expect(await io.deleteLayer(1)).toEqual({ ok: false, message: "flash failed" });
      expect(write).toHaveBeenCalledTimes(2);
      expect(await session.keymap.readAll()).toEqual(before);
      expect((await session.keymap.getLayerMetadata(1)).name).toBe("Lower");
    });
  });
});
