import { describe, expect, it } from "vitest";
import type { ComboDefinition, KeyAction, Morse } from "../vendor/rynk-wasm/rynk_wasm";
import { analyzeUsage, type UsageInput } from "./usage";

const fakeDecode = ((ops: unknown[][]) => ops.map((steps) => ({ steps }))) as never;
const key = (code: string): KeyAction => ({ Single: { Key: { Hid: code as never } } });
const mo = (layer: number): KeyAction => ({ Single: { LayerOn: layer } });

function input(overrides: Partial<UsageInput>): UsageInput {
  return {
    layers: [],
    cols: 3,
    defaultLayer: 0,
    layerMetadata: null,
    combos: [],
    morse: [],
    forks: [],
    macroOps: [],
    morseProfiles: [],
    ...overrides,
  };
}

describe("usage sites point at where they are", () => {
  it("gives a key its layer, row and column", () => {
    // Layer 0 has six keys over three columns; layer 1 is turned on by the key at row 1, column 2.
    const report = analyzeUsage(
      input({ layers: [[key("A"), key("B"), key("C"), key("D"), key("E"), mo(1)], [key("F")]] }),
      fakeDecode,
    );
    expect(report.layers[1].activatorSites).toEqual([
      { label: "Layer 0 · r1c2", target: { kind: "cell", layer: 0, row: 1, col: 2 } },
    ]);
  });

  it("points a morse slot's reference at the key that uses the slot", () => {
    const holdLayer: Morse = { profile: {} as Morse["profile"], actions: [[2, { LayerOn: 1 }]] };
    const report = analyzeUsage(input({ layers: [[{ Morse: 0 }, key("B")], [key("C")]], morse: [holdLayer] }), fakeDecode);
    expect(report.layers[1].activatorSites).toEqual([
      { label: "Morse 0 via Layer 0 · r0c0", target: { kind: "cell", layer: 0, row: 0, col: 0 } },
    ]);
    expect(report.morse[0].refSites).toEqual([
      { label: "Layer 0 · r0c0", target: { kind: "cell", layer: 0, row: 0, col: 0 } },
    ]);
  });

  it("names combos by their slot", () => {
    const combo = { Actions: { actions: [key("A"), key("B")], output: mo(1), layers: 0xffffffff } } as ComboDefinition;
    const report = analyzeUsage(input({ layers: [[key("A")], [key("C")]], combos: [combo] }), fakeDecode);
    expect(report.layers[1].activatorSites).toEqual([{ label: "Combo 0", target: { kind: "combo", index: 0 } }]);
  });
});
