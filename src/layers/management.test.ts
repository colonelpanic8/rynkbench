import { describe, expect, it } from "vitest";
import type {
  BehaviorOptions,
  MorseProfile,
  PointingConfig,
} from "../vendor/rynk-wasm/rynk_wasm";
import {
  planLayerDuplicate,
  planLayerRewrite,
  type LayerRewriteSnapshot,
} from "./management";

const noProfile = {} as MorseProfile;
const behavior = (tri_layer?: [number, number, number]): BehaviorOptions => ({
  tri_layer,
  combo_prior_idle_ms: undefined,
  oneshot_activate_on_keypress: false,
  oneshot_quick_release: false,
  morse_enable_flow_tap: false,
  morse_prior_idle_ms: 0,
  morse_default_profile: noProfile,
});

function snapshot(): LayerRewriteSnapshot {
  return {
    metadata: [
      { occupied: true, name: "Base" },
      { occupied: true, name: "Nav" },
      { occupied: true, name: "Symbols" },
      { occupied: false, name: "" },
    ],
    layers: [
      [{ Single: { LayerOn: 2 } }],
      [{ Single: { LayerToggle: 1 } }],
      [{ TapHold: [{ LayerOn: 1 }, { DefaultLayer: 2 }, 200] }],
      ["Transparent"],
    ],
    encoders: [
      [{ clockwise: "No", counter_clockwise: "No" }],
      [{ clockwise: { LayerModTap: [1, "LShift", "A"] }, counter_clockwise: "No" }],
      [{ clockwise: { Single: { OneShotLayer: 1 } }, counter_clockwise: "No" }],
      [{ clockwise: "No", counter_clockwise: "No" }],
    ],
    defaultLayer: 0,
    activeLayers: [0],
    combos: [
      {
        Actions: {
          actions: [{ Single: { LayerOn: 2 } }],
          output: { Single: { LayerToggle: 1 } },
          layer: 2,
        },
      },
    ],
    morse: [{ profile: noProfile, actions: [[1, { LayerOn: 2 }]] }],
    forks: [
      {
        trigger: { Single: { LayerOn: 1 } },
        negative_output: "No",
        positive_output: { Single: { PersistentDefaultLayer: 2 } },
        match_any: {} as never,
        match_none: {} as never,
        kept_modifiers: {} as never,
        bindable: true,
      },
    ],
    behaviorOptions: behavior([0, 1, 2]),
    autoMouseLayers: [
      {
        device_id: 0,
        target_layer: 2,
        timeout_ms: 100,
        threshold: 1,
        deactivate_on_key: false,
        extra_mouse_keys: [],
        reset_timeout_on_key: false,
      },
    ],
    scenes: [
      { layer: 1, led_id: 0, effect: {} as never },
      { layer: 2, led_id: 1, effect: {} as never },
    ],
    runtimeConditionalScenes: [
      {
        cell: {
          conditions: { layer: { layer: 2, active: true }, battery: undefined, output_mode: undefined },
          led_id: 0,
          effect: {} as never,
        },
        connection: undefined,
        effects: undefined,
      },
    ],
    compiledScenes: [],
    compiledConditionalScenes: [],
    wakeLayers: (1 << 1) | (1 << 2),
    pointing: {
      revision: 4,
      device_count: 1,
      devices: [],
      override_count: 1,
      overrides: [{ layer: 2, device_id: 0, mode: {} as never }],
    } as PointingConfig,
  };
}

describe("layer rewrite planning", () => {
  it("rewrites every mutable layer-index surface during reorder", () => {
    const plan = planLayerRewrite(snapshot(), { type: "move", layer: 1, to: 2 });

    expect(plan.order).toEqual([0, 2, 1]);
    expect(plan.metadata.map((slot) => slot.name)).toEqual(["Base", "Symbols", "Nav", ""]);
    expect(plan.layers[0][0]).toEqual({ Single: { LayerOn: 1 } });
    expect(plan.layers[1][0]).toEqual({
      TapHold: [{ LayerOn: 2 }, { DefaultLayer: 1 }, 200],
    });
    expect(plan.encoders[1][0].clockwise).toEqual({ Single: { OneShotLayer: 2 } });
    expect(plan.combos[0]).toMatchObject({ Actions: { layer: 1 } });
    expect(plan.morse[0].actions[0][1]).toEqual({ LayerOn: 1 });
    expect(plan.forks[0].positive_output).toEqual({ Single: { PersistentDefaultLayer: 1 } });
    expect(plan.behaviorOptions?.tri_layer).toEqual([0, 2, 1]);
    expect(plan.autoMouseLayers[0].target_layer).toBe(1);
    expect(plan.scenes.map((cell) => cell.layer)).toEqual([2, 1]);
    expect(plan.runtimeConditionalScenes[0].cell.conditions.layer?.layer).toBe(1);
    expect(plan.wakeLayers).toBe((1 << 1) | (1 << 2));
    expect(plan.pointing?.overrides[0].layer).toBe(1);
    expect(plan.pointing?.revision).toBe(4);
  });

  it("rejects deletion when retained runtime data still targets the layer", () => {
    expect(() => planLayerRewrite(snapshot(), { type: "delete", layer: 1 })).toThrow(
      /refers to deleted layer 1/,
    );
  });

  it("compacts and clears physical capacity when deletion is lossless", () => {
    const input = snapshot();
    input.layers[0] = ["No"];
    input.layers[2] = ["No"];
    input.encoders[2] = [{ clockwise: "No", counter_clockwise: "No" }];
    input.combos = [];
    input.morse = [];
    input.forks = [];
    input.behaviorOptions = behavior();
    input.scenes = input.scenes.filter((cell) => cell.layer !== 1);
    input.runtimeConditionalScenes = [];
    input.wakeLayers = 1 << 1;
    input.autoMouseLayers = [];
    input.pointing = null;

    const plan = planLayerRewrite(input, { type: "delete", layer: 1 });
    expect(plan.order).toEqual([0, 2]);
    expect(plan.metadata).toEqual([
      { occupied: true, name: "Base" },
      { occupied: true, name: "Symbols" },
      { occupied: false, name: "" },
      { occupied: false, name: "" },
    ]);
    expect(plan.layers[2]).toEqual(["Transparent"]);
    expect(plan.encoders[2]).toEqual([{ clockwise: "No", counter_clockwise: "No" }]);
    expect(plan.wakeLayers).toBe(0);
  });

  it("rejects moves of firmware-compiled layer references", () => {
    const input = snapshot();
    input.compiledScenes = [{ layer: 1, led_id: 0, effect: {} as never }];
    expect(() => planLayerRewrite(input, { type: "move", layer: 1, to: 2 })).toThrow(
      /fixed by a compiled lighting scene/,
    );
  });

  it("duplicates into the first vacant slot and retargets self references", () => {
    const input = snapshot();
    input.runtimeConditionalScenes[0].cell.conditions.layer = { layer: 1, active: true };
    const plan = planLayerDuplicate(input, 1, "Nav copy", 10);
    expect(plan.metadata[3]).toEqual({ occupied: true, name: "Nav copy" });
    expect(plan.layers[3][0]).toEqual({ Single: { LayerToggle: 3 } });
    expect(plan.encoders[3][0].clockwise).toEqual({ LayerModTap: [3, "LShift", "A"] });
    expect(plan.scenes.at(-1)?.layer).toBe(3);
    expect(plan.runtimeConditionalScenes.at(-1)?.cell.conditions.layer?.layer).toBe(3);
    expect(plan.wakeLayers & (1 << 3)).not.toBe(0);
  });

  it("rejects duplicates that cannot reproduce compiled layer behavior", () => {
    const input = snapshot();
    input.compiledScenes = [{ layer: 1, led_id: 0, effect: {} as never }];
    expect(() => planLayerDuplicate(input, 1, "Nav copy", 10)).toThrow(
      /cannot duplicate it losslessly/,
    );
  });

  it("rejects duplicate names and conditional-table overflow", () => {
    const input = snapshot();
    expect(() => planLayerDuplicate(input, 1, "Base", 10)).toThrow(/already in use/);
    input.runtimeConditionalScenes[0].cell.conditions.layer = { layer: 1, active: true };
    expect(() => planLayerDuplicate(input, 1, "Nav copy", 10, 1)).toThrow(
      /conditional lighting capacity 1/,
    );
  });
});
