// Reducer coverage for per-target lighting drafts: the overlay draft and each
// layer's scene draft are staged independently and stage against different
// baselines (applied overlay vs. that layer's stored scene cells).

import { describe, expect, it, vi } from "vitest";
import type {
  LightingExtendedConditionalSceneCell,
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
  conditionalTablesEqual,
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
    lightingControls: { output_toggle_user_action: undefined, wake_layers: 0 },
    runtimeConditionalScenes: [],
    runtimeConditionalDraft: [],
    lightingExtension: null,
    lightingExtensionLayers: null,
    extensionParams: {},
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
    behaviorOptions: null,
    morseProfileCapacity: 0,
    morseProfiles: [],
    morseHoldTriggerPositionCapacity: null,
    morseHoldTriggerPositions: [],
    autoMouseLayerCapacity: 0,
    autoMouseLayers: [],
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

describe("conditional rule tables", () => {
  function rule(ledId: number, r: number): LightingExtendedConditionalSceneCell {
    return {
      cell: {
        conditions: { layer: undefined, battery: undefined, output_mode: undefined },
        led_id: ledId,
        effect: solid(r),
      },
      connection: undefined,
      effects: undefined,
    };
  }

  it("treats a reordered table as a difference", () => {
    const a = rule(1, 1);
    const b = rule(2, 2);
    // Rules compose in table order and a later one wins a shared slot, so a
    // permutation changes what the board renders and must count as dirty.
    expect(conditionalTablesEqual([a, b], [a, b])).toBe(true);
    expect(conditionalTablesEqual([a, b], [b, a])).toBe(false);
    expect(conditionalTablesEqual([a, b], [a])).toBe(false);
    expect(conditionalTablesEqual([], [])).toBe(true);
  });

  it("compares cells by value, not identity", () => {
    expect(conditionalTablesEqual([rule(1, 1)], [rule(1, 1)])).toBe(true);
    expect(conditionalTablesEqual([rule(1, 1)], [rule(1, 2)])).toBe(false);
  });

  it("lightingRefresh re-syncs a clean rule draft but keeps a dirty one", () => {
    const stored = [rule(1, 1)];
    const pushed = [rule(4, 4)];

    // Clean draft (matches what is on the device) follows the push.
    const clean = reducer(
      baseState({ runtimeConditionalScenes: stored, runtimeConditionalDraft: stored }),
      { type: "lightingRefresh", state: LIGHTING, overlay: [], runtimeConditional: pushed },
    );
    expect(clean.runtimeConditionalScenes).toEqual(pushed);
    expect(clean.runtimeConditionalDraft).toEqual(pushed);

    // Staged edits survive: the device's table advances, the draft does not.
    const staged = [rule(1, 1), rule(9, 9)];
    const dirty = reducer(
      baseState({ runtimeConditionalScenes: stored, runtimeConditionalDraft: staged }),
      { type: "lightingRefresh", state: LIGHTING, overlay: [], runtimeConditional: pushed },
    );
    expect(dirty.runtimeConditionalScenes).toEqual(pushed);
    expect(dirty.runtimeConditionalDraft).toEqual(staged);
  });

  it("leaves both tables alone when the push carries no conditional data", () => {
    const stored = [rule(1, 1)];
    const next = reducer(
      baseState({ runtimeConditionalScenes: stored, runtimeConditionalDraft: stored }),
      { type: "lightingRefresh", state: LIGHTING, overlay: [] },
    );
    expect(next.runtimeConditionalScenes).toEqual(stored);
    expect(next.runtimeConditionalDraft).toEqual(stored);
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

describe("positional hold triggers", () => {
  const previous = [{ profile: 255, row: 0, col: 0 }];
  const next = [{ profile: 2, row: 1, col: 1 }];

  it("optimistically replaces the table and clears pending on success", () => {
    const started = reducer(baseState({ morseHoldTriggerPositions: previous }), {
      type: "holdTriggerPositionsWriteStart",
      positions: next,
    });
    expect(started.morseHoldTriggerPositions).toEqual(next);
    expect(started.pending.morseHoldTriggerPositions).toEqual({ status: "pending" });

    const finished = reducer(started, { type: "holdTriggerPositionsWriteOk" });
    expect(finished.morseHoldTriggerPositions).toEqual(next);
    expect(finished.pending.morseHoldTriggerPositions).toBeUndefined();
  });

  it("restores the previous table when the write fails", () => {
    const failed = reducer(baseState({ morseHoldTriggerPositions: next }), {
      type: "holdTriggerPositionsWriteErr",
      prev: previous,
      message: "flash busy",
    });
    expect(failed.morseHoldTriggerPositions).toEqual(previous);
    expect(failed.pending.morseHoldTriggerPositions).toEqual({
      status: "error",
      message: "flash busy",
    });
  });
});

describe("named morse profiles", () => {
  const profile = {
    unilateral_tap: undefined,
    enable_flow_tap: undefined,
    mode: "Normal" as const,
    hold_timeout_ms: 180,
    gap_timeout_ms: 180,
    quick_tap_timeout_ms: undefined,
    retro_tap: undefined,
    prior_idle_time_ms: undefined,
    hold_trigger_on_release: undefined,
  };
  const first = { index: 0, name: "first", profile };
  const later = { index: 3, name: "later", profile };

  it("deletes one stable slot without compacting later profiles", () => {
    const started = reducer(
      baseState({
        morseProfileCapacity: 8,
        morseProfiles: [first, later],
        morseHoldTriggerPositions: [
          { profile: 0, row: 0, col: 0 },
          { profile: 3, row: 1, col: 1 },
        ],
      }),
      { type: "morseProfileDeleteStart", index: 0 },
    );
    expect(started.morseProfiles).toEqual([later]);
    expect(started.morseHoldTriggerPositions).toEqual([{ profile: 3, row: 1, col: 1 }]);
    expect(started.morseProfiles[0].index).toBe(3);
  });

  it("restores the entry and position table when deletion fails", () => {
    const positions = [{ profile: 0, row: 0, col: 0 }];
    const failed = reducer(baseState({ morseProfiles: [later] }), {
      type: "morseProfileDeleteErr",
      entry: first,
      positions,
      message: "flash busy",
    });
    expect(failed.morseProfiles).toEqual([first, later]);
    expect(failed.morseHoldTriggerPositions).toEqual(positions);
  });
});

describe("extension parameters", () => {
  const params: LightingExtensionParam[] = [
    { name: "Density", min: 1, max: 32, default: 8, value: 12 },
  ];

  it("records a loaded list against the effect it describes", () => {
    const next = reducer(baseState(), { type: "extensionParamsLoaded", effect: 6, items: params });
    expect(next.extensionParams).toEqual({ 6: params });
  });

  it("keeps every effect's list, so base and overlay parameters coexist", () => {
    const overlayParams: LightingExtensionParam[] = [
      { name: "Width", min: 0, max: 10, default: 3, value: 4 },
    ];
    const next = reducer(
      reducer(baseState(), { type: "extensionParamsLoaded", effect: 6, items: params }),
      { type: "extensionParamsLoaded", effect: 2, items: overlayParams },
    );
    expect(next.extensionParams).toEqual({ 6: params, 2: overlayParams });
  });

  /** A session stub with just the extension surface the io facade touches. */
  function ioWith(lighting: Partial<RynkSession["lighting"]>, state = baseState()) {
    const actions: WorkbenchAction[] = [];
    const session = { lighting } as unknown as RynkSession;
    const io = makeIo(session, () => state, (act) => actions.push(act), 2, () => {});
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

  it("applies the selection first, then each staged parameter, then reads back the device", async () => {
    const calls: string[] = [];
    const selection = { effect: 6, palette: 2, value: 200, speed: 40 };
    const applied = { ...selection, value: 180 };
    const { io, actions } = ioWith({
      setExtensionState: async () => {
        calls.push("selection");
        return LIGHTING;
      },
      setExtensionParam: async (effect, index, value) => {
        calls.push(`param ${effect}:${index}=${value}`);
        return { ...LIGHTING, revision: LIGHTING.revision + 1 + index };
      },
      state: async () => {
        calls.push("readback state");
        return { ...LIGHTING, revision: LIGHTING.revision + 4 };
      },
      extension: async () => {
        calls.push("readback");
        return {
          revision: LIGHTING.revision + 4,
          effect_count: 12,
          palette_count: 4,
          state: applied,
        };
      },
      extensionParams: async () => {
        calls.push("reload");
        return params;
      },
    });

    io.setExtensionState(selection, [
      { effect: 6, index: 0, value: 20 },
      { effect: 6, index: 2, value: 3 },
    ]);
    await vi.waitFor(() => expect(calls).toHaveLength(6));
    expect(calls).toEqual([
      "selection",
      "param 6:0=20",
      "param 6:2=3",
      "readback state",
      "readback",
      "reload",
    ]);
    // The readback, including a device-clamped value, is the state of record.
    expect(actions).toContainEqual({
      type: "extensionStateSet",
      state: { ...LIGHTING, revision: LIGHTING.revision + 4 },
      extension: applied,
      extensionLayers: null,
    });
  });

  it("reports a failed parameter write as a lighting error", async () => {
    const { io, actions } = ioWith({
      setExtensionState: async () => LIGHTING,
      setExtensionParam: async () => {
        throw new Error("parameter 99 is outside 1..=32");
      },
    });
    io.setExtensionState({ effect: 6, palette: 0, value: 0, speed: 0 }, [
      { effect: 6, index: 0, value: 99 },
    ]);
    await vi.waitFor(() => expect(actions).toHaveLength(2));
    expect(actions[1]).toEqual({
      type: "lightingBusy",
      busy: false,
      error: "parameter 99 is outside 1..=32",
    });
  });

  it("applies the overlay selection when layering is supported", async () => {
    const calls: string[] = [];
    const selection = { effect: 5, palette: 0, value: 128, speed: 128 };
    const { io, actions } = ioWith(
      {
        setExtensionState: async () => {
          calls.push("primary");
          return { ...LIGHTING, revision: 2 };
        },
        setExtensionLayers: async (overlay) => {
          calls.push(`overlay ${overlay}`);
          return { ...LIGHTING, revision: 3 };
        },
        state: async () => {
          calls.push("readback state");
          return { ...LIGHTING, revision: 3 };
        },
        extension: async () => {
          calls.push("readback primary");
          return { revision: 3, effect_count: 12, palette_count: 4, state: selection };
        },
        extensionLayers: async () => {
          calls.push("readback overlay");
          return { revision: 3, overlay: 2 };
        },
        extensionParams: async (effect) => {
          calls.push(`reload ${effect}`);
          return [];
        },
      },
      baseState({ lightingExtensionLayers: { revision: 1, overlay: 6 } }),
    );

    io.setExtensionState(selection, [], 2);
    await vi.waitFor(() => expect(calls).toHaveLength(7));
    expect(calls).toEqual([
      "primary",
      "overlay 2",
      "readback state",
      "readback primary",
      "readback overlay",
      "reload 5",
      "reload 2",
    ]);
    expect(actions).toContainEqual({
      type: "extensionStateSet",
      state: { ...LIGHTING, revision: 3 },
      extension: selection,
      extensionLayers: { revision: 3, overlay: 2 },
    });
  });

  it("changes value without rewriting an unchanged overlay selection", async () => {
    const calls: string[] = [];
    const current = { effect: 5, palette: 0, value: 51, speed: 128 };
    const selection = { ...current, value: 52 };
    const { io } = ioWith(
      {
        setExtensionState: async () => {
          calls.push("primary");
          return { ...LIGHTING, revision: 5 };
        },
        setExtensionLayers: async () => {
          throw new Error("unchanged overlay selection was rewritten");
        },
        state: async () => {
          calls.push("readback state");
          return { ...LIGHTING, revision: 5 };
        },
        extension: async () => {
          calls.push("readback primary");
          return { revision: 5, effect_count: 12, palette_count: 4, state: selection };
        },
        extensionLayers: async () => {
          calls.push("readback overlay");
          return { revision: 5, overlay: 2 };
        },
        extensionParams: async (effect) => {
          calls.push(`reload ${effect}`);
          return [];
        },
      },
      baseState({
        lightingExtension: {
          revision: 4,
          effect_count: 12,
          palette_count: 4,
          state: current,
        },
        lightingExtensionLayers: { revision: 4, overlay: 2 },
      }),
    );

    io.setExtensionState(selection, [], 2);
    await vi.waitFor(() => expect(calls).toHaveLength(6));
    expect(calls).toEqual([
      "primary",
      "readback state",
      "readback primary",
      "readback overlay",
      "reload 5",
      "reload 2",
    ]);
  });

  it("does not rewrite unchanged primary and overlay selections", async () => {
    const calls: string[] = [];
    const selection = { effect: 5, palette: 0, value: 128, speed: 128 };
    const layers = { revision: 4, overlay: 2 };
    const { io, actions } = ioWith(
      {
        setExtensionState: async () => {
          throw new Error("unchanged primary selection was rewritten");
        },
        setExtensionLayers: async () => {
          throw new Error("unchanged overlay selection was rewritten");
        },
        setExtensionParam: async (effect, index, value) => {
          calls.push(`param ${effect}:${index}=${value}`);
          return { ...LIGHTING, revision: 5 };
        },
        state: async () => {
          calls.push("readback state");
          return { ...LIGHTING, revision: 5 };
        },
        extension: async () => {
          calls.push("readback primary");
          return { revision: 5, effect_count: 12, palette_count: 4, state: selection };
        },
        extensionLayers: async () => {
          calls.push("readback overlay");
          return { revision: 5, overlay: 2 };
        },
        extensionParams: async (effect) => {
          calls.push(`reload ${effect}`);
          return params;
        },
      },
      baseState({
        lightingExtension: {
          revision: 4,
          effect_count: 12,
          palette_count: 4,
          state: selection,
        },
        lightingExtensionLayers: layers,
      }),
    );

    // A write names its own effect, so the overlay slot's parameters are
    // editable alongside the base slot's, and both slots reload afterwards.
    io.setExtensionState(
      selection,
      [
        { effect: 5, index: 0, value: 20 },
        { effect: 2, index: 0, value: 7 },
      ],
      2,
    );
    await vi.waitFor(() => expect(calls).toHaveLength(7));
    expect(calls).toEqual([
      "param 5:0=20",
      "param 2:0=7",
      "readback state",
      "readback primary",
      "readback overlay",
      "reload 5",
      "reload 2",
    ]);
    expect(actions).toContainEqual({
      type: "extensionStateSet",
      state: { ...LIGHTING, revision: 5 },
      extension: selection,
      extensionLayers: { revision: 5, overlay: 2 },
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

describe("lighting multi-selection", () => {
  it("replaces the selection by default", () => {
    const state = baseState({ lightingSelection: [1, 2] });
    expect(reducer(state, { type: "lightingSelect", leds: [7] }).lightingSelection).toEqual([7]);
  });

  it("accumulates in add mode without duplicating", () => {
    const state = baseState({ lightingSelection: [1, 2] });
    const next = reducer(state, { type: "lightingSelect", leds: [2, 5], mode: "add" });
    expect(next.lightingSelection).toEqual([1, 2, 5]);
  });

  it("drops only the named leds in remove mode", () => {
    const state = baseState({ lightingSelection: [1, 2, 5] });
    const next = reducer(state, { type: "lightingSelect", leds: [2, 9], mode: "remove" });
    expect(next.lightingSelection).toEqual([1, 5]);
  });
});
