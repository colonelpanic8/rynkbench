import { describe, expect, it } from "vitest";
import type { ComboDefinition, KeyAction, Morse } from "../vendor/rynk-wasm/rynk_wasm";
import type { KeyboardImage } from "./image";
import { planSync as planFor, storedItems } from "./plan";
import { conflicts } from "./conflicts";

const key = (code: string): KeyAction => ({ Single: { Key: { Hid: code as never } } });
const morseTo = (code: string): Morse => ({ profile: {} as Morse["profile"], actions: [[1, { Key: { Hid: code as never } }]] });
const noMorse: Morse = { profile: {} as Morse["profile"], actions: [] };
const combo = (out: KeyAction): ComboDefinition => ({ Positions: { positions: [0, 1], output: out, layer: null } }) as never;

function image(over: Partial<KeyboardImage> = {}): KeyboardImage {
  return {
    metadata: [{ occupied: true, name: "Base" }, { occupied: false, name: "" }],
    layers: [
      [key("A"), key("B"), key("C"), key("D")],
      ["Transparent", "Transparent", "Transparent", "Transparent"],
    ],
    encoders: [[], []],
    defaultLayer: 0,
    combos: [],
    morse: [noMorse, noMorse],
    forks: [],
    behaviorOptions: null,
    autoMouseLayers: [],
    scenes: [],
    runtimeConditionalScenes: [],
    wakeLayers: 0,
    pointing: null,
    ...over,
  };
}

/** The planner on the test image as two rows of two keys per layer. */
const planSync = (from: KeyboardImage, to: KeyboardImage) => planFor(from, to, 2);

const withKeys = (base: KeyboardImage, layer: number, cells: KeyAction[]) => ({
  ...base,
  layers: base.layers.map((row, i) => (i === layer ? cells : row)),
});

describe("the planner", () => {
  it("ignores key order, which means nothing in a value read back", () => {
    const built = { layer: 0, led_id: 3, effect: { Solid: { color: { r: 9, g: 0, b: 0 } } } };
    const read = { effect: { Solid: { color: { b: 0, g: 0, r: 9 } } }, led_id: 3, layer: 0 };
    expect(planSync(image({ scenes: [read] }), image({ scenes: [built] }))).toEqual([]);
  });

  it("compares scene tables by their cells, not their order, as the keyboard keeps its own", () => {
    const cell = (layer: number, led_id: number, r = 9) => ({ layer, led_id, effect: { Solid: { color: { r, g: 0, b: 0 } } } });
    // What Rynkbench wants after editing layer 0 (its cells last) and what RMK reads back (grouped by layer).
    const wanted = [cell(1, 4), cell(0, 7), cell(0, 2)];
    const stored = [cell(0, 2), cell(0, 7), cell(1, 4)];
    expect(planSync(image({ scenes: stored }), image({ scenes: wanted }))).toEqual([]);
    expect(planSync(image({ scenes: stored }), image({ scenes: [cell(1, 4), cell(0, 7), cell(0, 2, 5)] }))).toHaveLength(1);
  });

  it("writes nothing when nothing differs", () => {
    expect(planSync(image(), image())).toEqual([]);
  });

  it("writes a changed row whole, as one stored item however many of its cells changed", () => {
    const want = withKeys(image(), 0, [key("X"), key("B"), key("C"), key("Z")]);
    const steps = planFor(image(), want, 4);
    expect(steps).toEqual([{ kind: "keys", layer: 0, row: 0, actions: [key("X"), key("B"), key("C"), key("Z")] }]);
    expect(storedItems(steps)).toBe(1);
  });

  it("writes each row that holds a change and never an unchanged one", () => {
    const one = planSync(image(), withKeys(image(), 0, [key("A"), key("B"), key("C"), key("Z")]));
    expect(one).toEqual([{ kind: "keys", layer: 0, row: 1, actions: [key("C"), key("Z")] }]);
    const both = planSync(image(), withKeys(image(), 0, [key("X"), key("B"), key("C"), key("Z")]));
    expect(both).toEqual([
      { kind: "keys", layer: 0, row: 0, actions: [key("X"), key("B")] },
      { kind: "keys", layer: 0, row: 1, actions: [key("C"), key("Z")] },
    ]);
    expect(storedItems(both)).toBe(2);
  });

  it("counts every segment of a row wider than one", () => {
    const wide = (first: KeyAction) => image({ layers: [[first, ...Array<KeyAction>(17).fill("No")], Array<KeyAction>(18).fill("No")] });
    const steps = planFor(wide(key("A")), wide(key("X")), 18);
    expect(steps).toHaveLength(1);
    expect(storedItems(steps)).toBe(2);
  });

  it("refuses a column count the layers do not divide into", () => {
    expect(() => planFor(image(), image(), 3)).toThrow(/rows of 3 keys/);
  });

  it("creates what keys will point to first and clears what they no longer use last", () => {
    const from = image({ morse: [morseTo("Q"), noMorse] });
    const want = withKeys(image({ morse: [noMorse, morseTo("W")], metadata: [{ occupied: true, name: "Base" }, { occupied: true, name: "Nav" }] }), 0, [
      { Morse: 1 } as KeyAction,
      key("B"),
      key("C"),
      key("D"),
    ]);
    expect(planSync(from, want).map((step) => step.kind + ("index" in step ? step.index : "layer" in step ? step.layer : ""))).toEqual([
      "slot1",
      "layerMetadata1",
      "keys0",
      "slot0",
    ]);
  });

  it("puts a grown macro region before keys and a shrunk one after", () => {
    const one = [[{ Text: "a" }]] as never;
    const two = [[{ Text: "a" }], [{ Text: "b" }]] as never;
    const grown = planSync(image({ macroOps: one }), withKeys(image({ macroOps: two }), 0, [key("X"), key("B"), key("C"), key("D")]));
    expect(grown.map((s) => s.kind)).toEqual(["macros", "keys"]);
    const shrunk = planSync(image({ macroOps: two }), withKeys(image({ macroOps: one }), 0, [key("X"), key("B"), key("C"), key("D")]));
    expect(shrunk.map((s) => s.kind)).toEqual(["keys", "macros"]);
  });

  it("leaves a part out when one side did not read it", () => {
    expect(planSync(image({ macroOps: [[{ Text: "a" }]] as never }), image())).toEqual([]);
  });

  it("compares pointing without the revision the keyboard counts", () => {
    const p = (revision: number) => ({ revision, cpi: 800 }) as never;
    expect(planSync(image({ pointing: p(1) }), image({ pointing: p(7) }))).toEqual([]);
  });

  it("refuses layouts with a different number of layers", () => {
    expect(() => planSync(image(), image({ layers: [[]] }))).toThrow(/layer count is fixed/);
  });

  it("writes a combo change as one slot", () => {
    const want = image({ combos: [combo(key("E"))] });
    expect(planSync(image({ combos: [combo(key("F"))] }), want)).toEqual([
      { kind: "slot", table: "combos", index: 0, value: combo(key("E")) },
    ]);
  });
});

describe("the three-way check", () => {
  const base = image();

  it("finds an item changed here and on the keyboard to different values", () => {
    const now = withKeys(base, 0, [key("K"), key("B"), key("C"), key("D")]);
    const want = withKeys(base, 0, [key("M"), key("N"), key("C"), key("D")]);
    expect(conflicts(base, now, want)).toEqual([{ kind: "key", layer: 0, offset: 0 }]);
  });

  it("is quiet when both sides made the same change or different items", () => {
    const now = withKeys(base, 0, [key("M"), key("B"), key("C"), key("Z")]);
    const want = withKeys(base, 0, [key("M"), key("N"), key("C"), key("D")]);
    expect(conflicts(base, now, want)).toEqual([]);
  });

  it("names whole items such as the default layer", () => {
    expect(conflicts(base, image({ defaultLayer: 1 }), base)).toEqual([]);
    expect(conflicts(base, image({ wakeLayers: 1 }), image({ wakeLayers: 2 }))).toEqual([{ kind: "wakeLayers" }]);
  });
});
