import { describe, expect, it } from "vitest";
import {
  GLOVE80_BATTERY_BARS,
  GLOVE80_CONNECTION_KEYS,
  batteryBarRules,
  bleStatusRules,
  connectionKeyAction,
  installGlove80StatusRules,
  replaceBatteryBar,
  replaceBleStatus,
  usbStatusRules,
} from "./statusPresets";

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
    expect(rules[3].cell.effect).toHaveProperty("Blink");
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
});
