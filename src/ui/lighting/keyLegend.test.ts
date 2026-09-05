import { describe, expect, it } from "vitest";
import type { KeyView } from "../../model/keyboard";
import type { KeyAction } from "../../vendor/rynk-wasm/rynk_wasm";
import { lightingKeyLegend } from "./keyLegend";

const key = { row: 0, col: 0, label: "Esc" } as KeyView;
const binding = (letter: "A" | "B"): KeyAction => ({ Single: { Key: { Hid: letter } } });

describe("lighting key legends", () => {
  it("uses the selected scene layer instead of the live layer or stock legend", () => {
    expect(lightingKeyLegend(key, [[binding("A")], [binding("B")]], 1, 1, [0], 0)).toBe("B");
  });
  it("resolves transparent keys through the configured default layer", () => {
    expect(lightingKeyLegend(key, [[binding("A")], ["Transparent"]], 1, 1, [1], 0)).toBe("A");
  });
  it("uses live layers for overlays", () => {
    expect(lightingKeyLegend(key, [[binding("A")], [binding("B")]], 1, "overlay", [1], 0)).toBe("B");
  });
  it("does not restore a stock Esc legend for an unbound key", () => {
    expect(lightingKeyLegend(key, [["No"]], 1, 0, [0], 0)).not.toBe("Esc");
  });
});
