import { describe, expect, it } from "vitest";
import type { LightingConditionalSceneCell } from "../../vendor/rynk-wasm/rynk_wasm";
import { conditionalRuleMatches, firmwarePreviewCells } from "./firmwareRules";

const green = { Solid: { color: { r: 0, g: 255, b: 0 } } } as const;
const red = { Solid: { color: { r: 255, g: 0, b: 0 } } } as const;

describe("firmware lighting rules", () => {
  it("conjoins layer, battery level, and charge state", () => {
    const cell: LightingConditionalSceneCell = {
      conditions: {
        layer: { layer: 2, active: true },
        battery: { node: 1, min_level: 21, max_level: 40, charge: "Discharging" },
      },
      led_id: 7,
      effect: green,
    };
    expect(conditionalRuleMatches(cell, {
      activeLayers: new Set([0, 2]),
      batteries: new Map([[1, { Available: { charge_state: "Discharging", level: 35 } }]]),
    })).toBe(true);
    expect(conditionalRuleMatches(cell, {
      activeLayers: new Set([0, 2]),
      batteries: new Map([[1, { Available: { charge_state: "Charging", level: 35 } }]]),
    })).toBe(false);
  });

  it("preserves declaration-order overrides", () => {
    const cells: LightingConditionalSceneCell[] = [
      { conditions: { layer: { layer: 3, active: true }, battery: undefined }, led_id: 4, effect: green },
      { conditions: { layer: { layer: 3, active: true }, battery: undefined }, led_id: 4, effect: red },
    ];
    const preview = firmwarePreviewCells([], cells, {
      activeLayers: new Set([0, 3]),
      batteries: new Map(),
    });
    expect(preview.get(4)?.effect).toEqual(red);
  });
});
