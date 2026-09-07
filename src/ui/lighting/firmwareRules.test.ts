import { describe, expect, it } from "vitest";
import type {
  ConnectionStatus,
  LightingConditionalSceneCell,
  LightingConnectionCondition,
  LightingAdvancedConditionalSceneCell,
  LightingSceneCell,
} from "../../vendor/rynk-wasm/rynk_wasm";
import {
  conditionalRuleMatches,
  describeRuleConditions,
  firmwarePreviewCells,
  firmwareRuleGroups,
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
  const base: LightingAdvancedConditionalSceneCell = {
    cell: {
      conditions: { layer: undefined, battery: undefined, output_mode: undefined },
      led_id: 7,
      effect: green,
    },
    connection: undefined,
    effects: undefined,
    layers: undefined,
    indicators: undefined,
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

  it("requires every layer in a set active and none of the excluded ones", () => {
    const rule = { ...base, layers: { active: 0b101, inactive: 0b010 } };
    const held = (...layers: number[]) => ({ ...preview, activeLayers: new Set(layers) });
    expect(runtimeConditionalRuleMatches(rule, held(0, 2))).toBe(true);
    expect(runtimeConditionalRuleMatches(rule, held(0, 2, 3))).toBe(true);
    expect(runtimeConditionalRuleMatches(rule, held(0))).toBe(false);
    expect(runtimeConditionalRuleMatches(rule, held(0, 1, 2))).toBe(false);
    expect(describeRuleConditions(rule)).toBe("L0+L2 active + L1 inactive");
  });

  it("matches named lock indicators and treats unknown ones as unsatisfiable", () => {
    const rule = { ...base, indicators: { num_lock: undefined, caps_lock: true, scroll_lock: false } };
    const locks = (caps_lock: boolean, scroll_lock: boolean) => ({
      ...preview,
      indicators: { num_lock: true, caps_lock, scroll_lock },
    });
    expect(runtimeConditionalRuleMatches(rule, locks(true, false))).toBe(true);
    expect(runtimeConditionalRuleMatches(rule, locks(false, false))).toBe(false);
    expect(runtimeConditionalRuleMatches(rule, locks(true, true))).toBe(false);
    expect(runtimeConditionalRuleMatches(rule, preview)).toBe(false);
    expect(describeRuleConditions(rule)).toBe("caps lock on + scroll lock off");
  });

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

describe("firmware rule groups", () => {
  const layerScenes: LightingSceneCell[] = [
    { layer: 1, led_id: 1, effect: green },
    { layer: 1, led_id: 2, effect: green },
    { layer: 1, led_id: 3, effect: red },
  ];
  const conditional: LightingConditionalSceneCell[] = [
    {
      conditions: { layer: { layer: 1, active: true }, battery: undefined, output_mode: undefined },
      led_id: 4,
      effect: green,
    },
  ];

  it("gathers the LEDs that share a rule and marks what the preview lights", () => {
    const groups = firmwareRuleGroups(
      layerScenes,
      conditional,
      { activeLayers: new Set([0]), batteries: new Map(), outputMode: undefined },
      (layer) => `Magic ${layer}`,
    );

    expect(groups.map((group) => [group.description, group.leds, group.active])).toEqual([
      // Same layer and same effect: one group carrying both LEDs.
      ["Magic 1 active", [1, 2], false],
      ["Magic 1 active", [3], false],
      ["Magic 1 active", [4], false],
    ]);
  });

  it("marks a group active when its condition holds", () => {
    const groups = firmwareRuleGroups(
      layerScenes,
      conditional,
      { activeLayers: new Set([1]), batteries: new Map(), outputMode: undefined },
      (layer) => `L${layer}`,
    );
    expect(groups.every((group) => group.active)).toBe(true);
  });
});
