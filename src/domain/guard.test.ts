import { describe, expect, it } from "vitest";
import type { KeyAction, Morse } from "../vendor/rynk-wasm/rynk_wasm";
import { cellRef, judgeChange, layerRef, slotRef } from "./index";
import type { GraphSource, GuardInput } from "./index";

const key = (code: string): KeyAction => ({ Single: { Key: { Hid: code as never } } });
const mo = (layer: number): KeyAction => ({ Single: { LayerOn: layer } });
const holdToLayer = (layer: number): Morse => ({
  profile: {} as Morse["profile"],
  actions: [
    [1, { Key: { Hid: "Escape" } }],
    [2, { LayerOn: layer }],
  ],
});

function side(layers: KeyAction[][], extra: Partial<GraphSource> = {}): GuardInput {
  return {
    defaultLayer: 0,
    source: { layers, cols: 2, combos: [], morse: [], forks: [], macroCount: 0, profileSlots: [], ...extra },
  };
}

describe("Guard", () => {
  it("asks when the last key to a layer with keys on it is overwritten", () => {
    const before = side([[key("A"), mo(1)], [key("B"), "Transparent"]]);
    const after = side([[key("A"), key("C")], [key("B"), "Transparent"]]);
    expect(judgeChange(before, after)).toEqual([
      { rule: "unreachable-layer", tier: "ask", subject: layerRef(1), places: [cellRef(0, 1)] },
    ]);
  });

  it("says nothing when another way to the layer is left, or the layer is empty", () => {
    const twoWays = side([[mo(1), mo(1)], [key("B"), "No"]]);
    expect(judgeChange(twoWays, side([[mo(1), key("C")], [key("B"), "No"]]))).toEqual([]);
    const empty = side([[key("A"), mo(1)], ["Transparent", "No"]]);
    expect(judgeChange(empty, side([[key("A"), key("C")], ["Transparent", "No"]]))).toEqual([]);
  });

  it("judges a swap as one change", () => {
    const before = side([[mo(1), key("A")], [key("B"), "No"]]);
    expect(judgeChange(before, side([[key("A"), mo(1)], [key("B"), "No"]]))).toEqual([]);
  });

  it("names a layer cut off through another, without places of its own", () => {
    const before = side([[key("A"), mo(1)], [key("B"), mo(2)], [key("C"), "No"]]);
    const after = side([[key("A"), key("D")], [key("B"), mo(2)], [key("C"), "No"]]);
    expect(judgeChange(before, after).map((f) => [f.subject, f.places])).toEqual([
      [layerRef(1), [cellRef(0, 1)]],
      [layerRef(2), []],
    ]);
  });

  it("follows a morse slot that turns a layer on", () => {
    const morse = [holdToLayer(1)];
    const before = side([[key("A"), { Morse: 0 }], [key("B"), "No"]], { morse });
    const after = side([[key("A"), key("C")], [key("B"), "No"]], { morse });
    expect(judgeChange(before, after)[0]).toMatchObject({ subject: layerRef(1), places: [cellRef(0, 1)] });
  });

  it("stops a key that points at a layer or slot that does not exist", () => {
    const before = side([[key("A"), key("B")]]);
    const after = side([[mo(4), { Morse: 2 }]]);
    expect(judgeChange(before, after)).toEqual([
      { rule: "broken-reference", tier: "stop", subject: layerRef(4), places: [cellRef(0, 0)] },
      { rule: "broken-reference", tier: "stop", subject: slotRef("morse", 2), places: [cellRef(0, 1)] },
    ]);
  });

  it("does not blame a change for what was broken before it", () => {
    const before = side([[mo(4), key("A")]]);
    expect(judgeChange(before, side([[mo(4), key("B")]]))).toEqual([]);
  });

  it("puts stops before questions", () => {
    const before = side([[key("A"), mo(1)], [key("B"), "No"]]);
    const after = side([[mo(9), key("C")], [key("B"), "No"]]);
    expect(judgeChange(before, after).map((f) => f.tier)).toEqual(["stop", "ask"]);
  });
});
