import { describe, expect, it } from "vitest";
import type { KeyAction, LightingSceneCell } from "../vendor/rynk-wasm/rynk_wasm";
import type { KeyboardImage } from "./image";
import { differences, valueAt, withValues } from "./items";
import { applyPatch, invertPatch, joinPatches, patchBetween, rebase } from "./patch";
import { planSync } from "./plan";
import { conflicts } from "./conflicts";

const key = (code: string): KeyAction => ({ Single: { Key: { Hid: code as never } } });
const lit = (layer: number, led_id: number, r: number): LightingSceneCell => ({ layer, led_id, effect: { Solid: { color: { r, g: 0, b: 0 } } } });

function image(over: Partial<KeyboardImage> = {}): KeyboardImage {
  return {
    metadata: [{ occupied: true, name: "Base" }, { occupied: true, name: "Lower" }],
    layers: [[key("A"), key("B")], ["Transparent", "Transparent"]],
    encoders: [[], []],
    defaultLayer: 0,
    combos: [],
    morse: [],
    forks: [],
    behaviorOptions: null,
    autoMouseLayers: [],
    scenes: [lit(0, 1, 9), lit(1, 1, 9)],
    runtimeConditionalScenes: [],
    wakeLayers: 0,
    pointing: null,
    ...over,
  };
}

describe("stored items", () => {
  it("name what differs, one item each, and nothing when the planner writes nothing", () => {
    const base = image();
    const want = image({
      layers: [[key("A"), key("C")], ["Transparent", "Transparent"]],
      metadata: [{ occupied: true, name: "Base" }, { occupied: true, name: "Nav" }],
      scenes: [lit(1, 1, 9), lit(0, 1, 7), lit(0, 2, 7)],
      wakeLayers: 2,
    });
    expect(differences(base, want).map(({ item }) => item)).toEqual([
      { kind: "key", layer: 0, offset: 1 },
      { kind: "layerMetadata", layer: 1 },
      { kind: "lighting", layer: 0 },
      { kind: "wakeLayers" },
    ]);
    expect(planSync(base, want)).not.toEqual([]);
    // The keyboard's own order of scene cells means nothing.
    const reordered = image({ scenes: [lit(1, 1, 9), lit(0, 1, 9)] });
    expect(differences(base, reordered)).toEqual([]);
    expect(planSync(base, reordered)).toEqual([]);
  });

  it("are read and set in an image", () => {
    const base = image();
    const set = withValues(base, [
      { item: { kind: "key", layer: 1, offset: 0 }, value: key("X") },
      { item: { kind: "lighting", layer: 0 }, value: [lit(0, 3, 1)] },
      { item: { kind: "defaultLayer" }, value: 1 },
    ]);
    expect(valueAt(set, { kind: "key", layer: 1, offset: 0 })).toEqual(key("X"));
    expect(valueAt(set, { kind: "lighting", layer: 0 })).toEqual([lit(0, 3, 1)]);
    expect(valueAt(set, { kind: "lighting", layer: 1 })).toEqual([lit(1, 1, 9)]);
    expect(set.defaultLayer).toBe(1);
    expect(base.defaultLayer).toBe(0);
  });

  it("clash per layer of lighting, not per scene table", () => {
    const base = image();
    const mine = image({ scenes: [lit(0, 1, 5), lit(1, 1, 9)] });
    const theirs = image({ scenes: [lit(0, 1, 9), lit(1, 1, 5)] });
    expect(conflicts(base, theirs, mine)).toEqual([]);
    expect(conflicts(base, image({ scenes: [lit(0, 1, 6), lit(1, 1, 9)] }), mine)).toEqual([{ kind: "lighting", layer: 0 }]);
  });
});

describe("patches", () => {
  const base = image();
  const want = image({ layers: [[key("Q"), key("B")], ["Transparent", key("W")]], defaultLayer: 1 });

  it("turn one image into another, and back", () => {
    const patch = patchBetween(base, want);
    expect(applyPatch(base, patch)).toEqual(want);
    expect(applyPatch(want, invertPatch(patch))).toEqual(base);
    expect(applyPatch(want, patch, "before")).toEqual(base);
  });

  it("join: each item from where the first found it to where the second left it", () => {
    const first = patchBetween(base, want);
    const second = patchBetween(want, image({ layers: [[key("A"), key("B")], ["Transparent", key("E")]], defaultLayer: 1 }));
    expect(joinPatches(first, second)).toEqual([
      { item: { kind: "key", layer: 1, offset: 1 }, before: "Transparent", after: key("E") },
      { item: { kind: "defaultLayer" }, before: 0, after: 1 },
    ]);
  });

  it("rebase: what you did not change follows the keyboard; what you changed stays", () => {
    const keyboard = image({ layers: [[key("Z"), key("Y")], ["Transparent", "Transparent"]] });
    const rebased = rebase(base, keyboard, want);
    expect(rebased.layers).toEqual([[key("Q"), key("Y")], ["Transparent", key("W")]]);
    expect(rebased.defaultLayer).toBe(1);
  });
});
