import { describe, expect, it } from "vitest";
import type { LightingEffect } from "../../vendor/rynk-wasm/rynk_wasm";
import { DEFAULT_TIMING } from "./effect";
import { colorsInUse, keyLightOf, planLight, recolorCells, recolorRules } from "./key-light";
import { statusLightOf, withStatusLight } from "./status-light";
import { bleStatusRules } from "./status-presets";
import { BLACK_EFFECT } from "./preview";
import { newRule } from "./rules";

const RED = { r: 255, g: 0, b: 0 };
const BLUE = { r: 0, g: 0, b: 255 };
const solid = (color = RED): LightingEffect => ({ Solid: { color } });

describe("a key's light", () => {
  it("reads no cell as Layer below, a black cell as Off, anything else as a colour", () => {
    expect(keyLightOf(undefined)).toEqual({ kind: "below" });
    expect(keyLightOf(BLACK_EFFECT)).toEqual({ kind: "off" });
    expect(keyLightOf(solid())).toMatchObject({ kind: "color", color: RED, effect: "Solid" });
    expect(keyLightOf({ Blink: { color: RED, period_ms: 500, phase_ms: 0, duty: 128 } })).toMatchObject({
      effect: "Blink",
      timing: { periodMs: 500 },
    });
  });

  it("writes Off as a black cell, a colour as its effect, Layer below as no cell", () => {
    expect(planLight({ kind: "off" }, [3], 0, [])).toEqual({
      paint: [{ led_id: 3, effect: BLACK_EFFECT, ttl_ms: undefined }],
      erase: [],
      rules: null,
    });
    expect(planLight({ kind: "color", color: RED, effect: "Solid", timing: DEFAULT_TIMING }, [3, 4], 0, []).paint).toEqual(
      [3, 4].map((led_id) => ({ led_id, effect: solid(), ttl_ms: undefined })),
    );
    expect(planLight({ kind: "below" }, [3], 0, [])).toEqual({ paint: [], erase: [3], rules: null });
  });
});

describe("lock and battery lights", () => {
  const lock = { kind: "lock" as const, lock: "caps_lock" as const, on: RED, off: null };
  const battery = { kind: "battery" as const, node: 0, level: 40, below: RED, above: BLUE };

  it("write two rules on the key's LED and layer, and read back the same light", () => {
    const rules = withStatusLight([], 2, 7, lock);
    expect(rules).toHaveLength(2);
    expect(rules.every((rule) => rule.cell.led_id === 7 && rule.cell.conditions.layer?.layer === 2)).toBe(true);
    expect(statusLightOf(rules, 2, 7)).toEqual(lock);
    expect(statusLightOf(withStatusLight([], 2, 7, battery), 2, 7)).toEqual(battery);
  });

  it("show either half's battery: the right half's on a left-hand key, and the key's own half when unset", () => {
    const right = { ...battery, node: 1 };
    const rules = withStatusLight([], 2, 7, right);
    expect(rules.every((rule) => rule.cell.conditions.battery?.node === 1)).toBe(true);
    expect(statusLightOf(rules, 2, 7)).toEqual(right);
    const { node: _unset, ...ownHalf } = battery;
    expect(statusLightOf(withStatusLight([], 2, 7, ownHalf, 1), 2, 7)).toEqual(right);
  });

  it("replace a key's own rules, and leave the condition rules alone", () => {
    const other = newRule(7, solid(BLUE));
    const rules = withStatusLight([other], 2, 7, lock);
    const replaced = withStatusLight(rules, 2, 7, battery);
    expect(replaced[0]).toBe(other);
    expect(replaced).toHaveLength(3);
    expect(withStatusLight(replaced, 2, 7, null)).toEqual([other]);
  });

  it("take the key's scene cell away, and a colour takes the rules away", () => {
    const plan = planLight(lock, [7], 2, []);
    expect(plan.erase).toEqual([7]);
    expect(plan.rules).toHaveLength(2);
    const back = planLight({ kind: "off" }, [7], 2, plan.rules ?? []);
    expect(back.rules).toEqual([]);
    expect(keyLightOf(undefined, statusLightOf(plan.rules ?? [], 2, 7))).toEqual(lock);
  });
});

describe("Bluetooth and USB lights", () => {
  it("write the status preset's rules and read back the same light", () => {
    const ble = withStatusLight([], 2, 7, { kind: "bluetooth", profile: 1 });
    expect(ble).toEqual(bleStatusRules(2, 7, 1));
    expect(statusLightOf(ble, 2, 7)).toEqual({ kind: "bluetooth", profile: 1 });
    expect(statusLightOf(withStatusLight([], 2, 7, { kind: "usb" }), 2, 7)).toEqual({ kind: "usb" });
  });

  it("read the preset's rules in any order and with fields in any order", () => {
    const shuffled = bleStatusRules(0, 3, 2)
      .reverse()
      .map((rule) => Object.fromEntries(Object.entries(rule).reverse()) as typeof rule);
    expect(statusLightOf(shuffled, 0, 3)).toEqual({ kind: "bluetooth", profile: 2 });
  });

  it("are replaced by another light, and leave connection rules that are not exactly theirs alone", () => {
    const ble = withStatusLight([], 2, 7, { kind: "bluetooth", profile: 0 });
    expect(withStatusLight(ble, 2, 7, { kind: "usb" })).toHaveLength(3);
    expect(planLight({ kind: "off" }, [7], 2, ble).rules).toEqual([]);
    const edited = ble.slice(1);
    expect(statusLightOf(edited, 2, 7)).toBeNull();
    expect(withStatusLight(edited, 2, 7, null)).toEqual(edited);
  });

  it("keep their colours out of recolouring", () => {
    const ble = withStatusLight([], 0, 1, { kind: "bluetooth", profile: 0 });
    const green = { r: 0, g: 192, b: 32 };
    expect(recolorRules(ble, green, RED)).toEqual(ble);
  });
});

describe("colours", () => {
  it("lists the colours in use, most used first, without black", () => {
    expect(colorsInUse([solid(BLUE), solid(), BLACK_EFFECT, solid(BLUE)])).toEqual([BLUE, RED]);
  });

  it("recolours every cell of one colour and keeps its effect", () => {
    const cells = [
      { led_id: 1, effect: solid(), ttl_ms: undefined },
      { led_id: 2, effect: { Breathe: { color: RED, period_ms: 900, phase_ms: 0, step_ms: 16 } }, ttl_ms: undefined },
      { led_id: 3, effect: solid(BLUE), ttl_ms: undefined },
    ];
    const out = recolorCells(cells, RED, BLUE);
    expect(out.map((cell) => cell.led_id)).toEqual([1, 2]);
    expect(out[1].effect).toEqual({ Breathe: { color: BLUE, period_ms: 900, phase_ms: 0, step_ms: 16 } });
  });
});
