import { describe, expect, it } from "vitest";
import type { BehaviorOptions, LightingEffect, LightingSceneCell } from "../vendor/rynk-wasm/rynk_wasm";
import type { KeyboardImage } from "../sync/image";
import { noLabels } from "../model/behavior-labels";
import { newRule, type Rule } from "../model/lighting/rules";
import { statusLightOf, withStatusLight } from "../model/lighting/status-light";
import type { BatteryBarPreset, ConnectionKeyPreset } from "../model/lighting/status-presets";
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

describe("set_connection_key", () => {
  const input: ConnectionKeyPreset = { layer: 1, row: 0, col: 0, led: 4, kind: { type: "ble", slot: 2 } };

  it("binds the key to the profile and makes its light the profile's status light", () => {
    const result = runOperation("set_connection_key", image({ scenes: [cell(1, 4), cell(1, 5)] }), input, facts);
    if (!result.ok) throw new Error(result.message);
    expect(result.image.layers).toEqual([["No"], [{ Single: { User: 2 } }], ["No"]]);
    expect(statusLightOf(result.image.runtimeConditionalScenes, 1, 4)).toEqual({ kind: "bluetooth", profile: 2 });
    // The status light is the key's light now: its stored colour goes.
    expect(result.image.scenes).toEqual([cell(1, 5)]);
  });

  it("replaces the status light the key had, for USB too", () => {
    const first = runOperation("set_connection_key", image(), input, facts);
    if (!first.ok) throw new Error(first.message);
    const again = runOperation("set_connection_key", first.image, { ...input, kind: { type: "usb" } }, facts);
    if (!again.ok) throw new Error(again.message);
    expect(again.image.layers[1]).toEqual([{ Single: { KeyboardControl: "OutputUsb" } }]);
    expect(statusLightOf(again.image.runtimeConditionalScenes, 1, 4)).toEqual({ kind: "usb" });
    expect(again.image.runtimeConditionalScenes).toHaveLength(3);
  });

  it("refuses a key that does not exist, a connection it does not know, and a full rule table", () => {
    expect(runOperation("set_connection_key", image(), { ...input, col: 3 }, facts)).toEqual({ ok: false, message: "There is no key at row 0, column 3" });
    expect(runOperation("set_connection_key", image(), { ...input, kind: { type: "wifi" } } as never, facts)).toMatchObject({ ok: false });
    expect(runOperation("set_connection_key", image(), input, { ...facts, ruleCapacity: 4 })).toEqual({
      ok: false,
      message: "This layout needs 6 rules; the keyboard holds 4.",
    });
  });
});

describe("set_battery_bar", () => {
  const bar = (leds: number[], node = 0): BatteryBarPreset => ({ layer: 1, node, leds, style: "bands" });
  const lock = { kind: "lock", lock: "caps_lock", on: RED, off: null } as const;
  const ledsOn = (rules: Rule[], node: number) => [...new Set(rules.filter((rule) => rule.cell.conditions.battery?.node === node).map((rule) => rule.cell.led_id))];

  it("lights the keys by the battery's level on the layer, in the order given", () => {
    const result = runOperation("set_battery_bar", image(), bar([7, 6, 5]), { ...facts, ruleCapacity: 64 });
    if (!result.ok) throw new Error(result.message);
    const rules = result.image.runtimeConditionalScenes;
    expect(rules.every((rule) => rule.cell.conditions.layer?.layer === 1 && rule.cell.conditions.battery?.node === 0)).toBe(true);
    // The first key lights from an almost empty battery, the last only near full.
    const lightsFrom = (led: number) => Math.min(...rules.filter((rule) => rule.cell.led_id === led).map((rule) => rule.cell.conditions.battery!.min_level ?? 0));
    expect([7, 6, 5].map(lightsFrom)).toEqual([1, 34, 67]);
  });

  it("replaces that half's bar on the layer, keeps the other half's, and takes over a key's own status light", () => {
    const wide = { ...facts, ruleCapacity: 64 };
    const other = conditionRule(1, 9);
    const before = image({ runtimeConditionalScenes: withStatusLight([other], 1, 5, lock) });
    const left = runOperation("set_battery_bar", before, bar([1, 2, 3]), wide);
    if (!left.ok) throw new Error(left.message);
    const right = runOperation("set_battery_bar", left.image, bar([11, 12, 13], 1), wide);
    if (!right.ok) throw new Error(right.message);
    const moved = runOperation("set_battery_bar", right.image, bar([4, 5, 6]), wide);
    if (!moved.ok) throw new Error(moved.message);
    const rules = moved.image.runtimeConditionalScenes;
    expect(ledsOn(rules, 0)).toEqual([4, 5, 6]);
    expect(ledsOn(rules, 1)).toEqual([11, 12, 13]);
    expect(rules.some((rule) => rule.indicators)).toBe(false);
    expect(rules).toContain(other);
  });

  it("refuses too few keys, and more rules than the keyboard holds", () => {
    expect(runOperation("set_battery_bar", image(), bar([1, 2]), facts)).toEqual({ ok: false, message: "a battery bar needs 3–8 LEDs" });
    expect(runOperation("set_battery_bar", image(), bar([1, 2, 3]), { ...facts, ruleCapacity: 4 })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/rules; the keyboard holds 4\.$/),
    });
  });
});
