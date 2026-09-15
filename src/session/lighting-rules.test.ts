import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { initSync } from "../vendor/rynk-wasm/rynk_wasm";
import type { RuntimeLightingRule } from "./types";
import type { LightingPredicate } from "../vendor/rynk-wasm/rynk_wasm";
import { encodeRuleChunks, ruleFromWire, ruleToWire, rulesFromWire } from "./lighting-rules";
import { encode_lighting_rule } from "../vendor/rynk-wasm/rynk_wasm";

beforeAll(() => {
  initSync({ module: readFileSync("src/vendor/rynk-wasm/rynk_wasm_bg.wasm") });
});

const rule = (led: number): RuntimeLightingRule => ({
  cell: {
    led_id: led,
    effect: { Solid: { color: { r: 1, g: 2, b: 3 } } },
    conditions: {
      layer: { layer: 2, active: true },
      battery: undefined,
      output_mode: "PoweredOnly",
    },
  },
  connection: undefined,
  effects: { enabled: true },
  layers: { active: 4, inactive: 8 },
  indicators: { num_lock: undefined, caps_lock: true, scroll_lock: false },
  maintenance: { unlocked: false },
  split_transport: { link: "Wired", force: "Auto" },
});

describe("self-describing lighting rule codecs", () => {
  it("round-trips every predicate the editor understands in canonical tag order", () => {
    const original = rule(12);
    const wire = ruleToWire(original);
    expect(wire.predicates.map((predicate: LightingPredicate) => predicate.tag)).toEqual([1, 3, 5, 6, 7, 8, 9]);
    expect(ruleFromWire(wire)).toEqual(original);
  });

  it("decodes concatenated pages and packs whole rules within the byte limit", () => {
    const originals = [rule(1), rule(2), rule(3)];
    const wires = originals.map(ruleToWire);
    const bytes = wires.flatMap((entry) => [...encode_lighting_rule(entry)]);
    expect(rulesFromWire(bytes, wires.length)).toEqual(originals);

    const oneRule = encode_lighting_rule(wires[0]).length;
    const chunks = encodeRuleChunks(originals, oneRule * 2);
    expect(chunks.map(({ offset, count }) => ({ offset, count }))).toEqual([
      { offset: 0, count: 2 },
      { offset: 2, count: 1 },
    ]);
  });
});
