import { afterEach, describe, expect, it } from "vitest";
import { hoveredBehavior, keysOnLayer } from "./hoveredBehavior";

const cell = (layer: number, row: number, col: number) => ({ label: "", target: { kind: "cell" as const, layer, row, col } });

describe("keysOnLayer", () => {
  it("keeps the keys on the layer, not other layers, combos or places without a target", () => {
    const places = [cell(0, 1, 2), cell(1, 3, 4), cell(0, 4, 5), { label: "Combo 2", target: { kind: "combo" as const, index: 2 } }, { label: "?", target: null }];
    expect([...keysOnLayer(places, 0)]).toEqual(["1,2", "4,5"]);
    expect([...keysOnLayer(places, 2)]).toEqual([]);
  });
});

describe("hoveredBehavior", () => {
  afterEach(() => hoveredBehavior.end());

  it("is cleared only by the row still hovered", () => {
    hoveredBehavior.enter({ id: "macros:0", places: [] });
    hoveredBehavior.enter({ id: "macros:1", places: [] });
    hoveredBehavior.leave("macros:0");
    expect(hoveredBehavior.get()?.id).toBe("macros:1");
    hoveredBehavior.leave("macros:1");
    expect(hoveredBehavior.get()).toBeNull();
  });
});
