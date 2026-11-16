import { describe, expect, it, vi } from "vitest";
import { mockProvider, storedKeysOf } from "../session/mock/board";
import { glove80Board } from "../session/mock/glove80";
import type { RynkSession } from "../session/types";
import { openBundle } from "../ui/bundle";
import { initialWorkbenchState } from "./initial-state";
import { ioFeaturesFor, makeIo, type WorkbenchIo } from "./io";
import { makeWorkbenchReducer } from "./reducer";
import type { WorkbenchState } from "../model/workbench-state";
import { draftOf } from "./draft/want";

/** A simulated Glove80 in Live (or in Draft) with the io the workbench uses. */
async function withLayers(
  check: (session: RynkSession, io: WorkbenchIo, state: () => WorkbenchState) => Promise<void>,
  painted = false,
  draft = false,
) {
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
    let state: WorkbenchState = { ...initialWorkbenchState(bundle), batchMode: draft };
    const reducer = makeWorkbenchReducer(bundle.caps.num_cols);
    const io = makeIo(session, () => state, (action) => { state = reducer(state, action); }, {
      cols: bundle.caps.num_cols, onDisconnect: () => {}, features: ioFeaturesFor(bundle),
    });
    await check(session, io, () => state);
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
      expect(await io.deleteLayer(1)).toEqual({ ok: false, message: "flash failed; nothing was changed" });
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

describe("a layer operation in Draft", () => {
  it("rewrites what you want, writes nothing, and Send stores only what differs", async () => {
    await withLayers(async (session, io, state) => {
      const letter = { Single: { Key: { Hid: "A" } } } as const;
      for (const col of [0, 1, 2]) await io.setKey(1, 0, col, letter as never);
      const names = state().layerMetadata!.map((slot) => slot.name);
      const before = storedKeysOf(session);
      const rename = vi.spyOn(session.keymap, "setLayerMetadata");
      // The drafted keys move with their layer.
      expect(await io.moveLayer(1, 2)).toEqual({ ok: true });
      expect(storedKeysOf(session)).toBe(before);
      expect(rename).not.toHaveBeenCalled();
      expect(state().layerMetadata!.slice(1, 3).map((slot) => slot.name)).toEqual([names[2], names[1]]);
      expect(state().layers[2].slice(0, 3)).toEqual([letter, letter, letter]);
      expect(await io.applyBatch()).toEqual({ ok: true });
      expect(storedKeysOf(session) - before).toBe(3); // layer 1 never held them on the keyboard
      expect((await session.keymap.getLayerMetadata(2)).name).toBe(names[1]);
      expect(draftOf(state()).changes).toEqual([]);
    }, false, true);
  });

  it("names, macros and settings wait in the draft until Send", async () => {
    await withLayers(async (session, io, state) => {
      expect(await io.renameLayer(1, "Nav")).toEqual({ ok: true });
      io.setDefaultLayer(2);
      expect((await session.keymap.getLayerMetadata(1)).name).not.toBe("Nav");
      expect(draftOf(state()).changes.map(({ item }) => item.kind)).toEqual(["layerMetadata", "defaultLayer"]);
      expect(await io.applyBatch()).toEqual({ ok: true });
      expect((await session.keymap.getLayerMetadata(1)).name).toBe("Nav");
      expect((await session.keymap.layerState()).defaultLayer).toBe(2);
      expect(draftOf(state()).changes).toEqual([]);
    }, false, true);
  });
});
