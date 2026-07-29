// Reducer coverage for per-target lighting drafts: the overlay draft and each
// layer's scene draft are staged independently and stage against different
// baselines (applied overlay vs. that layer's stored scene cells).

import { describe, expect, it, vi } from "vitest";
import type {
  LightingEffect,
  LightingExtensionParam,
  LightingSceneCell,
  LightingState,
  ModifierCombination,
} from "../vendor/rynk-wasm/rynk_wasm";
import type { RynkSession } from "../session/types";
import {
  activeLightingBase,
  activeLightingDraft,
  makeIo,
  makeWorkbenchReducer,
  stagedBetween,
  type WorkbenchAction,
  type WorkbenchState,
} from "./state";

const reducer = makeWorkbenchReducer(2);

function solid(r: number): LightingEffect {
  return { Solid: { color: { r, g: 0, b: 0 } } };
}

const LIGHTING: LightingState = {
  revision: 1,
  output_enabled: true,
  output_brightness: 200,
  background: { enabled: false, hue: 0, saturation: 0, value: 0, speed: 0, mode: "Solid" },
  overlay_len: 0,
};

function baseState(over: Partial<WorkbenchState> = {}): WorkbenchState {
  return {
    mode: "lighting",
    uiLayer: 0,
    currentLayer: 0,
    defaultLayer: 0,
    activeLayers: [0],
    layerStateComplete: true,
    layers: [[], []],
    encoders: {},
    battery: "Unavailable",
    peripheralBattery: "Unavailable",
    connection: null,
    lightingState: LIGHTING,
    lightingOutputMode: null,
    applied: {},
    draft: {},
    lightingTarget: "overlay",
    layerDrafts: {},
    scenes: [],
    compiledScenes: [],
    conditionalScenes: [],
    lightingControls: { output_toggle_user_action: undefined, wake_layer: undefined },
    lightingExtension: null,
    extensionParams: null,
    scenePolicy: "EffectiveOnly",
    compiledScenePolicy: "EffectiveOnly",
    selection: null,
    pending: {},
    lightingBusy: false,
    lightingError: null,
    hoverLeds: null,
    lightingSelection: [],
    paintTick: {},
    combos: [],
    morse: [],
    forks: [],
    macroBytes: new Uint8Array(),
    behavior: null,
    ledIndicator: null,
    modifierState: null,
    ...over,
  };
}

describe("per-target lighting drafts", () => {
  it("seeds a layer draft from that layer's stored scene cells on first select", () => {
    const scenes: LightingSceneCell[] = [
      { layer: 1, led_id: 5, effect: solid(9) },
      { layer: 0, led_id: 2, effect: solid(3) },
    ];
    const s = reducer(baseState({ scenes }), { type: "lightingTarget", target: 1 });
    expect(s.lightingTarget).toBe(1);
    // Only layer 1's cell, as an overlay-shaped (ttl-less) draft.
    expect(activeLightingDraft(s)).toEqual({ 5: { led_id: 5, effect: solid(9), ttl_ms: undefined } });
    expect(activeLightingDraft(s)).toEqual(activeLightingBase(s));
    expect(stagedBetween(activeLightingDraft(s), activeLightingBase(s)).size).toBe(0);
  });

  it("routes paint/erase to the active target and leaves other targets untouched", () => {
    let s = baseState({ scenes: [{ layer: 1, led_id: 5, effect: solid(9) }] });
    // Paint the overlay.
    s = reducer(s, { type: "paint", cells: [{ led_id: 1, effect: solid(1), ttl_ms: undefined }] });
    // Switch to layer 1 and paint there.
    s = reducer(s, { type: "lightingTarget", target: 1 });
    s = reducer(s, { type: "paint", cells: [{ led_id: 7, effect: solid(7), ttl_ms: undefined }] });

    expect(s.draft).toEqual({ 1: { led_id: 1, effect: solid(1), ttl_ms: undefined } });
    expect(s.layerDrafts[1]).toEqual({
      5: { led_id: 5, effect: solid(9), ttl_ms: undefined },
      7: { led_id: 7, effect: solid(7), ttl_ms: undefined },
    });
    // Layer 1 now has one staged edit (led 7) over its stored baseline.
    expect(stagedBetween(activeLightingDraft(s), activeLightingBase(s))).toEqual(new Set([7]));
  });

  it("preserves each target's staged edits across tab switches", () => {
    let s = baseState();
    s = reducer(s, { type: "paint", cells: [{ led_id: 1, effect: solid(1), ttl_ms: undefined }] });
    s = reducer(s, { type: "lightingTarget", target: 0 });
    s = reducer(s, { type: "paint", cells: [{ led_id: 2, effect: solid(2), ttl_ms: undefined }] });
    // Bounce back to overlay, then to the layer again.
    s = reducer(s, { type: "lightingTarget", target: "overlay" });
    expect(activeLightingDraft(s)).toEqual({ 1: { led_id: 1, effect: solid(1), ttl_ms: undefined } });
    s = reducer(s, { type: "lightingTarget", target: 0 });
    expect(activeLightingDraft(s)).toEqual({ 2: { led_id: 2, effect: solid(2), ttl_ms: undefined } });
  });

  it("draftReset returns the active layer draft to its stored scene baseline", () => {
    let s = baseState({ scenes: [{ layer: 0, led_id: 2, effect: solid(3) }] });
    s = reducer(s, { type: "lightingTarget", target: 0 });
    s = reducer(s, { type: "erase", ledIds: [2] });
    expect(stagedBetween(activeLightingDraft(s), activeLightingBase(s))).toEqual(new Set([2]));
    s = reducer(s, { type: "draftReset" });
    expect(activeLightingDraft(s)).toEqual({ 2: { led_id: 2, effect: solid(3), ttl_ms: undefined } });
    expect(stagedBetween(activeLightingDraft(s), activeLightingBase(s)).size).toBe(0);
  });

  it("scenesApplied re-syncs clean layer drafts but keeps dirty ones", () => {
    let s = baseState({ scenes: [{ layer: 0, led_id: 2, effect: solid(3) }] });
    // Seed layer 0 (clean) and layer 1 (dirty).
    s = reducer(s, { type: "lightingTarget", target: 0 });
    s = reducer(s, { type: "lightingTarget", target: 1 });
    s = reducer(s, { type: "paint", cells: [{ led_id: 8, effect: solid(8), ttl_ms: undefined }] });

    const newScenes: LightingSceneCell[] = [{ layer: 0, led_id: 4, effect: solid(4) }];
    s = reducer(s, { type: "scenesApplied", state: LIGHTING, cells: newScenes });

    // Layer 0 was clean → re-synced to the new stored table.
    expect(s.layerDrafts[0]).toEqual({ 4: { led_id: 4, effect: solid(4), ttl_ms: undefined } });
    // Layer 1 had a staged edit → untouched.
    expect(s.layerDrafts[1]).toEqual({ 8: { led_id: 8, effect: solid(8), ttl_ms: undefined } });
  });

  it("overlay draft still stages against the applied overlay", () => {
    const overlay = { 1: { led_id: 1, effect: solid(1), ttl_ms: undefined } };
    const s = baseState({ applied: overlay, draft: { ...overlay } });
    expect(activeLightingBase(s)).toBe(s.applied);
    const painted = reducer(s, {
      type: "paint",
      cells: [{ led_id: 2, effect: solid(2), ttl_ms: undefined }],
    });
    expect(stagedBetween(activeLightingDraft(painted), activeLightingBase(painted))).toEqual(
      new Set([2]),
    );
  });
});

describe("layer-state snapshots", () => {
  it("replaces the active set and derives the highest-precedence layer", () => {
    const next = reducer(baseState(), {
      type: "topicLayers",
      defaultLayer: 1,
      activeLayers: [1, 2, 4],
      complete: true,
    });
    expect(next.defaultLayer).toBe(1);
    expect(next.activeLayers).toEqual([1, 2, 4]);
    expect(next.currentLayer).toBe(4);
    expect(next.layerStateComplete).toBe(true);
  });
});

describe("extension parameters", () => {
  const params: LightingExtensionParam[] = [
    { name: "Density", min: 1, max: 32, default: 8, value: 12 },
  ];

  it("records a loaded list against the effect it describes", () => {
    const next = reducer(baseState(), { type: "extensionParamsLoaded", effect: 6, items: params });
    expect(next.extensionParams).toEqual({ effect: 6, items: params });
  });

  /** A session stub with just the extension surface the io facade touches. */
  function ioWith(lighting: Partial<RynkSession["lighting"]>) {
    const actions: WorkbenchAction[] = [];
    const session = { lighting } as unknown as RynkSession;
    const io = makeIo(session, () => baseState(), (act) => actions.push(act), 2, () => {});
    return { io, actions };
  }

  it("loads a parameter list into state", async () => {
    const { io, actions } = ioWith({ extensionParams: async () => params });
    io.loadExtensionParams(6);
    await vi.waitFor(() => expect(actions).toHaveLength(1));
    expect(actions[0]).toEqual({ type: "extensionParamsLoaded", effect: 6, items: params });
  });

  it("records an empty list when the firmware lacks the parameter surface", async () => {
    const { io, actions } = ioWith({
      extensionParams: async () => {
        throw new Error("UnknownCmd: GetLightingExtensionParams");
      },
    });
    io.loadExtensionParams(6);
    await vi.waitFor(() => expect(actions).toHaveLength(1));
    // Feature detection is silent: no lightingError, just "no parameters".
    expect(actions[0]).toEqual({ type: "extensionParamsLoaded", effect: 6, items: [] });
  });

  it("applies the selection first, then each staged parameter, then re-reads", async () => {
    const calls: string[] = [];
    const selection = { effect: 6, palette: 2, value: 200, speed: 40 };
    const { io, actions } = ioWith({
      setExtensionState: async () => {
        calls.push("selection");
        return LIGHTING;
      },
      setExtensionParam: async (effect, index, value) => {
        calls.push(`param ${effect}:${index}=${value}`);
        return { ...LIGHTING, revision: LIGHTING.revision + 1 + index };
      },
      extensionParams: async () => {
        calls.push("reload");
        return params;
      },
    });

    io.setExtensionState(selection, [
      { index: 0, value: 20 },
      { index: 2, value: 3 },
    ]);
    await vi.waitFor(() => expect(calls).toHaveLength(4));
    expect(calls).toEqual(["selection", "param 6:0=20", "param 6:2=3", "reload"]);
    // The device's last reply is the state of record.
    expect(actions).toContainEqual({
      type: "extensionStateSet",
      state: { ...LIGHTING, revision: LIGHTING.revision + 3 },
      extension: selection,
    });
  });

  it("reports a failed parameter write as a lighting error", async () => {
    const { io, actions } = ioWith({
      setExtensionState: async () => LIGHTING,
      setExtensionParam: async () => {
        throw new Error("parameter 99 is outside 1..=32");
      },
    });
    io.setExtensionState({ effect: 6, palette: 0, value: 0, speed: 0 }, [{ index: 0, value: 99 }]);
    await vi.waitFor(() => expect(actions).toHaveLength(2));
    expect(actions[1]).toEqual({
      type: "lightingBusy",
      busy: false,
      error: "parameter 99 is outside 1..=32",
    });
  });
});

describe("modifier-state snapshots", () => {
  it("replaces the resolved HID modifier state from a topic", () => {
    const modifiers: ModifierCombination = {
      left_ctrl: false,
      left_shift: true,
      left_alt: false,
      left_gui: false,
      right_ctrl: false,
      right_shift: false,
      right_alt: false,
      right_gui: false,
    };
    const next = reducer(baseState(), { type: "topicModifier", modifiers });
    expect(next.modifierState).toEqual(modifiers);
  });
});
