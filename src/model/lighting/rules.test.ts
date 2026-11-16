import { describe, expect, it } from "vitest";
import { newRule, retargetLayer, rulesOnLayer } from "./rules";
import type { Rule } from "./rules";

const SOLID = { Solid: { color: { r: 1, g: 2, b: 3 } } };

function onLayer(led: number, layer: number, active = true): Rule {
  const rule = newRule(led, SOLID);
  rule.cell.conditions.layer = { layer, active };
  return rule;
}

describe("retargetLayer", () => {
  it("moves every rule on the source layer and leaves the rest alone", () => {
    const rules = [onLayer(1, 2), newRule(2, SOLID), onLayer(3, 5), onLayer(4, 2, false)];

    const moved = retargetLayer(rules, 2, 11);

    expect(rulesOnLayer(rules, 2)).toEqual([0, 3]);
    expect(moved.map((rule) => rule.cell.conditions.layer)).toEqual([
      { layer: 11, active: true },
      undefined,
      { layer: 5, active: true },
      { layer: 11, active: false },
    ]);
    expect(moved.map((rule) => rule.cell.led_id)).toEqual([1, 2, 3, 4]);
    expect(rules[0].cell.conditions.layer).toEqual({ layer: 2, active: true });
  });

  it("is a no-op without matching rules or when source and target agree", () => {
    const rules = [onLayer(1, 2)];

    expect(retargetLayer(rules, 3, 11)).toBe(rules);
    expect(retargetLayer(rules, 2, 2)).toBe(rules);
  });
});
