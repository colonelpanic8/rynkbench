import { describe, expect, it } from "vitest";
import { mockProvider } from "../../session/mock/board";
import { glove80Board } from "../../session/mock/glove80";
import type { RynkSession } from "../../session/types";
import { openBundle } from "../../ui/bundle";
import type { WorkbenchState } from "../../model/workbench-state";
import { initialWorkbenchState } from "../initial-state";
import { ioFeaturesFor, makeIo, type WorkbenchIo } from "../io";
import { makeWorkbenchReducer } from "../reducer";
import { draftOf } from "./want";
import { draftGroups } from "./changes";

/** A simulated Glove80 in Draft, with the io the workbench uses. */
async function inDraft(check: (h: { session: RynkSession; io: WorkbenchIo; state: () => WorkbenchState }) => Promise<void>) {
  const session = await mockProvider(glove80Board).connect();
  try {
    const bundle = await openBundle(session);
    let state: WorkbenchState = { ...initialWorkbenchState(bundle), batchMode: true };
    const reducer = makeWorkbenchReducer(bundle.caps.num_cols);
    const io = makeIo(session, () => state, (action) => { state = reducer(state, action); }, {
      cols: bundle.caps.num_cols, onDisconnect: () => {}, features: ioFeaturesFor(bundle),
    });
    await check({ session, io, state: () => state });
  } finally {
    await session.close();
  }
}

const kinds = (state: WorkbenchState) => draftOf(state).changes.map(({ item }) => item.kind);

describe("settings in Draft (ADR 0018)", () => {
  it("the lighting controls wait in the draft, show as you want them, and Send writes them", async () => {
    await inDraft(async ({ session, io, state }) => {
      const before = await session.lighting.state();
      const brightness = before.output_brightness === 40 ? 41 : 40;
      io.setLightingState({ output_enabled: before.output_enabled, output_brightness: brightness, background: before.background });
      const wake = state().lightingOutputMode!.wake_layers === 0b100 ? 0b10 : 0b100;
      io.setWakeLayers(wake);
      expect((await session.lighting.state()).output_brightness).toBe(before.output_brightness);
      expect(state().lightingState?.output_brightness).toBe(brightness);
      expect(state().lightingOutputMode?.wake_layers).toBe(wake);
      expect(kinds(state())).toEqual(["wakeLayers", "lightingState"]);
      expect(draftGroups(state())).toEqual([{ area: "lightingControls", count: 2 }]);

      expect(await io.applyBatch()).toEqual({ ok: true });
      expect((await session.lighting.state()).output_brightness).toBe(brightness);
      expect((await session.lighting.outputMode()).wake_layers).toBe(wake);
      expect(kinds(state())).toEqual([]);
    });
  });

  it("the effect and its overlay wait in the draft until Send", async () => {
    await inDraft(async ({ session, io, state }) => {
      const extension = state().lightingExtension!.state;
      const next = { ...extension, effect: extension.effect === 1 ? 2 : 1 };
      io.setExtensionState(next, [], undefined);
      expect((await session.lighting.extension()).state).toEqual(extension);
      expect(state().lightingExtension?.state).toEqual(next);
      expect(kinds(state())).toContain("extension");
      expect(await io.applyBatch()).toEqual({ ok: true });
      expect((await session.lighting.extension()).state).toEqual(next);
      expect(kinds(state())).toEqual([]);
    });
  });

  it("a tap-hold profile, new or deleted, waits in the draft until Send", async () => {
    await inDraft(async ({ session, io, state }) => {
      const entry = { index: 0, name: "hrm", profile: state().morse[0].profile } as never;
      expect(await io.setMorseProfile(entry)).toEqual({ ok: true });
      expect(state().morseProfiles).toEqual([entry]);
      expect((await session.behavior.profiles()).entries).toEqual([]);
      expect(draftGroups(state())).toEqual([{ area: "profiles", count: 1 }]);
      expect(await io.applyBatch()).toEqual({ ok: true });
      expect((await session.behavior.profiles()).entries).toEqual([entry]);

      expect(await io.deleteMorseProfile(0)).toEqual({ ok: true });
      expect(state().morseProfiles).toEqual([]);
      expect((await session.behavior.profiles()).entries).toEqual([entry]);
      expect(await io.applyBatch()).toEqual({ ok: true });
      expect((await session.behavior.profiles()).entries).toEqual([]);
      expect(kinds(state())).toEqual([]);
    });
  });

  it("a layer name changed on the keyboard meanwhile follows it when you had not changed it", async () => {
    await inDraft(async ({ session, io, state }) => {
      expect(await io.renameLayer(1, "Nav")).toEqual({ ok: true });
      await session.keymap.setLayerMetadata(2, { occupied: true, name: "Elsewhere" });
      expect(await io.applyBatch()).toEqual({ ok: true });
      expect(state().layerMetadata?.[1].name).toBe("Nav");
      expect(state().layerMetadata?.[2].name).toBe("Elsewhere");
      expect(kinds(state())).toEqual([]);
    });
  });
});
