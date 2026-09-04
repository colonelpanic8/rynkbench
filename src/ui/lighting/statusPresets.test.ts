import { describe, expect, it, vi } from "vitest";
import {
  batteryBarRules,
  bleStatusRules,
  connectionKeyAction,
  detectBarOrder,
  glove80BatteryBars,
  glove80ConnectionKeys,
  installGlove80StatusRules,
  orderBatteryBar,
  replaceBatteryBar,
  replaceBleStatus,
  usbStatusRules,
  writeGlove80StatusSetup,
} from "./statusPresets";

const GLOVE80_BATTERY_BARS = glove80BatteryBars();
const GLOVE80_CONNECTION_KEYS = glove80ConnectionKeys();

describe("status lighting presets", () => {
  it("builds the ordered five-segment battery treatment from the config", () => {
    const rules = batteryBarRules({ layer: 2, node: 0, leds: [39, 38, 37, 36, 35] });

    expect(rules).toHaveLength(13);
    expect(rules.slice(0, 5).map((rule) => rule.cell.conditions.battery?.min_level)).toEqual([
      1, 21, 41, 61, 81,
    ]);
    expect(rules.slice(5, 8).map((rule) => rule.cell.led_id)).toEqual([39, 38, 39]);
    expect(rules.slice(8).every((rule) => rule.cell.conditions.battery?.charge === "Charging"))
      .toBe(true);
  });

  it("orders Bluetooth states so active transport wins last", () => {
    const rules = bleStatusRules(2, 3, 0);

    expect(rules).toHaveLength(6);
    expect(rules[0].connection?.bonded).toEqual({ slot: 0, bonded: false });
    expect(rules[3].cell.effect).toEqual({
      Blink: { color: { r: 255, g: 255, b: 255 }, period_ms: 800, phase_ms: 0, duty: 50 },
    });
    expect(rules[5].connection).toMatchObject({
      profile: 0,
      ble_state: "Connected",
      transport: "Ble",
    });
  });

  it("creates the USB red, blue, green priority stack", () => {
    const rules = usbStatusRules(2, 0);

    expect(rules).toHaveLength(3);
    expect(rules.map((rule) => rule.connection?.usb_connected)).toEqual([false, true, undefined]);
    expect(rules[2].connection?.transport).toBe("Usb");
  });

  it("installs the complete Glove80 setup idempotently", () => {
    const once = installGlove80StatusRules([]);
    const twice = installGlove80StatusRules(once);

    expect(once).toHaveLength(47);
    expect(twice).toEqual(once);
    expect(GLOVE80_BATTERY_BARS[0].leds).toEqual([39, 38, 37, 36, 35]);
    expect(GLOVE80_BATTERY_BARS[1].leds).toEqual([79, 78, 77, 76, 75]);
  });

  it("installs the complete Glove80 setup on the chosen layer", () => {
    const rules = installGlove80StatusRules([], 11);

    expect(rules).toHaveLength(47);
    expect(rules.every((rule) => rule.cell.conditions.layer?.layer === 11)).toBe(true);
    expect(glove80ConnectionKeys(11).every((key) => key.layer === 11)).toBe(true);
  });

  it("orders a bar along its longer axis, tolerating column stagger", () => {
    // A staggered row: y drifts per column, as on the Glove80's finger columns.
    const row = [
      { ledId: 30, x: 4, y: 3.2 },
      { ledId: 33, x: 1, y: 3.0 },
      { ledId: 31, x: 3, y: 3.4 },
      { ledId: 34, x: 0, y: 2.8 },
      { ledId: 32, x: 2, y: 3.3 },
    ];
    expect(detectBarOrder(row)).toBe("left-right");
    expect(orderBatteryBar(row, "left-right")).toEqual([34, 33, 32, 31, 30]);
    expect(orderBatteryBar(row, "right-left")).toEqual([30, 31, 32, 33, 34]);
    expect(orderBatteryBar(row, "selection")).toEqual([30, 33, 31, 34, 32]);

    const column = [
      { ledId: 35, x: 5, y: 0 },
      { ledId: 36, x: 5, y: 1 },
      { ledId: 39, x: 5, y: 4 },
      { ledId: 37, x: 5, y: 2 },
      { ledId: 38, x: 5, y: 3 },
    ];
    expect(detectBarOrder(column)).toBe("bottom-up");
    expect(orderBatteryBar(column, "bottom-up")).toEqual([39, 38, 37, 36, 35]);
    expect(orderBatteryBar(column, "top-down")).toEqual([35, 36, 37, 38, 39]);
  });

  it("replaces only matching status rules and preserves unrelated entries", () => {
    const unrelated = batteryBarRules({ layer: 1, node: 0, leds: [1, 2, 3, 4, 5] })[0];
    const stray = batteryBarRules({ layer: 2, node: 0, leds: [40, 41, 42, 43, 44] })[0];
    const withBar = replaceBatteryBar([unrelated, stray], GLOVE80_BATTERY_BARS[0]);
    const withBle = replaceBleStatus(withBar, 2, 3, 0);

    expect(withBle[0]).toEqual(unrelated);
    expect(withBle).not.toContain(stray);
    expect(withBle).toHaveLength(1 + 13 + 6);
  });

  it("binds profile keys and USB using RMK's native actions", () => {
    expect(connectionKeyAction(GLOVE80_CONNECTION_KEYS[0].kind)).toEqual({
      Single: { User: 0 },
    });
    expect(connectionKeyAction(GLOVE80_CONNECTION_KEYS[3].kind)).toEqual({
      Single: { KeyboardControl: "OutputUsb" },
    });
  });

  it("serializes every key write before replacing the conditional table", async () => {
    const calls: string[] = [];
    let inFlight = false;
    const result = await writeGlove80StatusSetup(
      {
        async setKey(preset) {
          expect(inFlight).toBe(false);
          inFlight = true;
          calls.push(`key ${preset.row},${preset.col}`);
          await Promise.resolve();
          inFlight = false;
          return { ok: true };
        },
        async applyRules(rules) {
          expect(inFlight).toBe(false);
          calls.push(`rules ${rules.length}`);
          return { ok: true };
        },
      },
      [],
    );

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      "key 3,6",
      "key 4,6",
      "key 5,6",
      "key 0,6",
      "rules 47",
    ]);
  });

  it("stops before lighting replacement when a key write fails", async () => {
    const applyRules = vi.fn();
    let writes = 0;
    const result = await writeGlove80StatusSetup(
      {
        async setKey() {
          writes++;
          return writes === 2 ? { ok: false, message: "flash busy" } : { ok: true };
        },
        applyRules,
      },
      [],
    );

    expect(result).toEqual({ ok: false, message: "flash busy" });
    expect(writes).toBe(2);
    expect(applyRules).not.toHaveBeenCalled();
  });
});
