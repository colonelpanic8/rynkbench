import { describe, expect, it } from "vitest";
import type { BehaviorOptions, LightingEffect, LightingSceneCell } from "../vendor/rynk-wasm/rynk_wasm";
import type { KeyboardImage } from "../sync/image";
import { noLabels } from "../model/behavior-labels";
import { newRule, type Rule } from "../model/lighting/rules";
import { statusLightOf, withStatusLight } from "../model/lighting/status-light";
import { runOperation, type OperationFacts } from ".";

const RED = { r: 255, g: 0, b: 0 };
const solid: LightingEffect = { Solid: { color: RED } };
const cell = (layer: number, led_id: number): LightingSceneCell => ({ layer, led_id, effect: solid });

/** A condition rule on a layer's LED that is no key's status light: it also asks for an output mode. */
function conditionRule(layer: number, led: number): Rule {
  const rule = newRule(led, solid);
  rule.cell.conditions.layer = { layer, active: true };
  rule.cell.conditions.output_mode = "PoweredOnly";
  return rule;
}

function image(parts: Partial<KeyboardImage> = {}): KeyboardImage {
  return {
    metadata: [],
    layers: [["No"], ["No"], ["No"]],
    encoders: [[], [], []],
    defaultLayer: 0,
    combos: [],
    morse: [],
    forks: [],
    behaviorOptions: {} as BehaviorOptions,
    autoMouseLayers: [],
    scenes: [],
    runtimeConditionalScenes: [],
    wakeLayers: 0,
    pointing: null,
    ...parts,
  };
}

const facts: OperationFacts = {
  cols: 1,
  sceneCapacity: 8,
  ruleCapacity: 32,
  activeLayers: [],
  compiledScenes: [cell(1, 9)],
  compiledRules: [],
  ledNodes: {},
  labels: noLabels(),
  macroSpace: null,
};

describe("clear_layer_lights", () => {
  const lock = { kind: "lock", lock: "caps_lock", on: RED, off: null } as const;
  const battery = { kind: "battery", level: 40, below: RED, above: RED, node: 0 } as const;

  it("removes the layer's stored colours and its keys' status lights, and nothing else", () => {
    const other = conditionRule(1, 2);
    let rules = withStatusLight([other], 1, 0, { kind: "usb" });
    rules = withStatusLight(rules, 1, 2, lock);
    rules = withStatusLight(rules, 1, 3, battery);
    rules = withStatusLight(rules, 2, 0, lock);
    const before = image({ scenes: [cell(0, 0), cell(1, 0), cell(1, 1), cell(2, 5)], runtimeConditionalScenes: rules });

    const result = runOperation("clear_layer_lights", before, { layer: 1 }, facts);
    if (!result.ok) throw new Error(result.message);
    expect(result.image.scenes).toEqual([cell(0, 0), cell(2, 5)]);
    for (const led of [0, 2, 3]) expect(statusLightOf(result.image.runtimeConditionalScenes, 1, led)).toBeNull();
    // The condition rule on the same LED stays, and so does the next layer's lock light.
    expect(result.image.runtimeConditionalScenes).toContain(other);
    expect(statusLightOf(result.image.runtimeConditionalScenes, 2, 0)).toEqual(lock);
    expect(result.image.runtimeConditionalScenes).toHaveLength(1 + 2);
  });

  it("changes nothing on a layer with no lights of its own, even one the firmware lights", () => {
    const before = image({ scenes: [cell(0, 0)], runtimeConditionalScenes: [conditionRule(1, 2)] });
    const result = runOperation("clear_layer_lights", before, { layer: 1 }, { ...facts, sceneCapacity: null, ruleCapacity: null });
    expect(result).toEqual({ ok: true, image: before });
  });

  it("refuses a layer that does not exist", () => {
    expect(runOperation("clear_layer_lights", image(), { layer: 7 }, facts)).toEqual({ ok: false, message: "Layer 7 does not exist" });
  });
});
