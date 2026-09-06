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
  it("prioritizes the selected scene layer over a higher default layer", () => {
    expect(lightingKeyLegend(key, [[binding("A")], [binding("B")]], 1, 0, [1], 1)).toBe("A");
  });
  it.each([
    { kind: "transparent", selected: ["Transparent"] as KeyAction[] },
    { kind: "missing", selected: [] as KeyAction[] },
  ])(
    "falls through a $kind binding to a higher default layer",
    ({ selected }) => {
      expect(lightingKeyLegend(key, [selected, [binding("B")]], 1, 0, [0], 1)).toBe("B");
    },
  );
  it("does not fall through an explicitly unbound selected key", () => {
    expect(lightingKeyLegend(key, [["No"], [binding("B")]], 1, 0, [1], 1)).toBe("");
  });
  it("resolves transparent keys through the configured default layer", () => {
    expect(lightingKeyLegend(key, [[binding("A")], ["Transparent"]], 1, 1, [1], 0)).toBe("A");
  });
  it("uses live layers for overlays", () => {
    expect(lightingKeyLegend(key, [[binding("A")], [binding("B")]], 1, "overlay", [1], 0)).toBe("B");
  });
  it("retains higher-default-layer precedence for overlays", () => {
    expect(lightingKeyLegend(key, [[binding("A")], [binding("B")]], 1, "overlay", [0], 1)).toBe("B");
  });
  it("does not restore a stock Esc legend for an unbound key", () => {
    expect(lightingKeyLegend(key, [["No"]], 1, 0, [0], 0)).not.toBe("Esc");
  });
});
