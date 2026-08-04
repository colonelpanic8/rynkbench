import { describe, expect, it } from "vitest";
import type {
  ConnectionStatus,
  LightingConditionalSceneCell,
  LightingConnectionCondition,
  LightingExtendedConditionalSceneCell,
} from "../../vendor/rynk-wasm/rynk_wasm";
import {
  conditionalRuleMatches,
  firmwarePreviewCells,
  runtimeConditionalRuleMatches,
} from "./firmwareRules";

const EMPTY: LightingConnectionCondition = {
  transport: undefined,
  profile: undefined,
  ble_state: undefined,
  bonded: undefined,
  usb_connected: undefined,
};

const green = { Solid: { color: { r: 0, g: 255, b: 0 } } } as const;
const red = { Solid: { color: { r: 255, g: 0, b: 0 } } } as const;

describe("firmware lighting rules", () => {
  it("conjoins layer, battery level, and charge state", () => {
    const cell: LightingConditionalSceneCell = {
      conditions: {
        layer: { layer: 2, active: true },
        battery: { node: 1, min_level: 21, max_level: 40, charge: "Discharging" },
        output_mode: "PoweredOnly",
      },
      led_id: 7,
      effect: green,
    };
    expect(conditionalRuleMatches(cell, {
      activeLayers: new Set([0, 2]),
      batteries: new Map([[1, { Available: { charge_state: "Discharging", level: 35 } }]]),
      outputMode: "PoweredOnly",
    })).toBe(true);
    expect(conditionalRuleMatches(cell, {
      activeLayers: new Set([0, 2]),
      batteries: new Map([[1, { Available: { charge_state: "Charging", level: 35 } }]]),
      outputMode: "PoweredOnly",
    })).toBe(false);
    expect(conditionalRuleMatches(cell, {
      activeLayers: new Set([0, 2]),
      batteries: new Map([[1, { Available: { charge_state: "Discharging", level: 35 } }]]),
      outputMode: "AlwaysOn",
    })).toBe(false);
  });

  it("preserves declaration-order overrides", () => {
    const cells: LightingConditionalSceneCell[] = [
      {
        conditions: {
          layer: { layer: 3, active: true },
          battery: undefined,
          output_mode: undefined,
        },
        led_id: 4,
        effect: green,
      },
      {
        conditions: {
          layer: { layer: 3, active: true },
          battery: undefined,
          output_mode: undefined,
        },
        led_id: 4,
        effect: red,
      },
    ];
    const preview = firmwarePreviewCells([], cells, [], {
      activeLayers: new Set([0, 3]),
      batteries: new Map(),
      outputMode: undefined,
    });
    expect(preview.get(4)?.effect).toEqual(red);
  });
});

describe("runtime rule predicates", () => {
  const base: LightingExtendedConditionalSceneCell = {
    cell: {
      conditions: { layer: undefined, battery: undefined, output_mode: undefined },
      led_id: 7,
      effect: green,
    },
    connection: undefined,
    effects: undefined,
  };
  const connected: ConnectionStatus = {
    usb: "Configured",
    ble: { profile: 2, state: "Connected" },
    preferred: "Ble",
  };
  const preview = {
    activeLayers: new Set<number>(),
    batteries: new Map(),
    outputMode: undefined,
  };

  it("matches the effects state and treats an unknown one as unsatisfiable", () => {
    const rule = { ...base, effects: { enabled: true } };
    expect(runtimeConditionalRuleMatches(rule, { ...preview, effectsEnabled: true })).toBe(true);
    expect(runtimeConditionalRuleMatches(rule, { ...preview, effectsEnabled: false })).toBe(false);
    // Lighting a rule the host cannot verify would be the worse error.
    expect(runtimeConditionalRuleMatches(rule, preview)).toBe(false);
  });

  it("resolves the active transport the way the firmware does", () => {
    const usb = { ...base, connection: { ...EMPTY, transport: "Usb" as const } };
    const ble = { ...base, connection: { ...EMPTY, transport: "Ble" as const } };
    // Both ready, so `preferred` breaks the tie.
    expect(runtimeConditionalRuleMatches(ble, { ...preview, connection: connected })).toBe(true);
    expect(runtimeConditionalRuleMatches(usb, { ...preview, connection: connected })).toBe(false);
    expect(
      runtimeConditionalRuleMatches(usb, {
        ...preview,
        connection: { ...connected, preferred: "Usb" },
      }),
    ).toBe(true);
  });

  it("reads usb_connected as plugged-and-routable, not as the active transport", () => {
    const rule = { ...base, connection: { ...EMPTY, usb_connected: true } };
    // BLE carries output, but USB is still enumerated: the gate is presence.
    expect(runtimeConditionalRuleMatches(rule, { ...preview, connection: connected })).toBe(true);
    expect(
      runtimeConditionalRuleMatches(rule, {
        ...preview,
        connection: { ...connected, usb: "Disabled" },
      }),
    ).toBe(false);
    // Suspended USB stays routable for remote wakeup.
    expect(
      runtimeConditionalRuleMatches(rule, {
        ...preview,
        connection: { ...connected, usb: "Suspended" },
      }),
    ).toBe(true);
  });

  it("conjoins profile and BLE state, and cannot evaluate bonded slots", () => {
    expect(
      runtimeConditionalRuleMatches(
        { ...base, connection: { ...EMPTY, profile: 2, ble_state: "Connected" } },
        { ...preview, connection: connected },
      ),
    ).toBe(true);
    expect(
      runtimeConditionalRuleMatches(
        { ...base, connection: { ...EMPTY, profile: 3 } },
        { ...preview, connection: connected },
      ),
    ).toBe(false);
    // The firmware never publishes its bond table, so this previews unlit.
    const bonded = { ...base, connection: { ...EMPTY, bonded: { slot: 1, bonded: true } } };
    expect(runtimeConditionalRuleMatches(bonded, { ...preview, connection: connected })).toBe(false);
    expect(
      runtimeConditionalRuleMatches(bonded, {
        ...preview,
        connection: connected,
        bondedSlots: new Set([1]),
      }),
    ).toBe(true);
  });

  it("lets runtime rules override compiled ones on a shared slot", () => {
    const compiled: LightingConditionalSceneCell = {
      conditions: { layer: undefined, battery: undefined, output_mode: undefined },
      led_id: 7,
      effect: red,
    };
    const cells = firmwarePreviewCells([], [compiled], [base], preview);
    expect(cells.get(7)?.effect).toEqual(green);
  });
});
