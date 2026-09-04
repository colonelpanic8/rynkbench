import type {
  KeyAction,
  LightingEffect,
  LightingExtendedConditionalSceneCell,
} from "../../vendor/rynk-wasm/rynk_wasm";

export type StatusRule = LightingExtendedConditionalSceneCell;

export interface BatteryBarPreset {
  layer: number;
  node: number;
  /** Bottom-to-top LEDs. */
  leds: number[];
}

export interface ConnectionKeyPreset {
  layer: number;
  row: number;
  col: number;
  led: number;
  kind: { type: "ble"; slot: number } | { type: "usb" };
}

export type StatusSetupResult = { ok: true } | { ok: false; message: string };

export interface StatusSetupWriter {
  setKey(preset: ConnectionKeyPreset, action: KeyAction): Promise<StatusSetupResult>;
  applyRules(rules: StatusRule[]): Promise<StatusSetupResult>;
}

/** The layer MoErgo's stock Glove80 config keeps its Magic cluster on. */
export const GLOVE80_MAGIC_LAYER = 2;

export function glove80BatteryBars(layer = GLOVE80_MAGIC_LAYER): BatteryBarPreset[] {
  return [
    { layer, node: 0, leds: [39, 38, 37, 36, 35] },
    { layer, node: 1, leds: [79, 78, 77, 76, 75] },
  ];
}

export function glove80ConnectionKeys(layer = GLOVE80_MAGIC_LAYER): ConnectionKeyPreset[] {
  return [
    { layer, row: 3, col: 6, led: 3, kind: { type: "ble", slot: 0 } },
    { layer, row: 4, col: 6, led: 4, kind: { type: "ble", slot: 1 } },
    { layer, row: 5, col: 6, led: 5, kind: { type: "ble", slot: 2 } },
    { layer, row: 0, col: 6, led: 0, kind: { type: "usb" } },
  ];
}

/** Fill direction of a battery bar: the first key lights at 20%, the last at 100%. */
export type BarOrder = "bottom-up" | "top-down" | "left-right" | "right-left" | "selection";

export const BAR_ORDERS: Array<{ id: BarOrder; label: string }> = [
  { id: "bottom-up", label: "Bottom to top" },
  { id: "top-down", label: "Top to bottom" },
  { id: "left-right", label: "Left to right" },
  { id: "right-left", label: "Right to left" },
  { id: "selection", label: "Selection order" },
];

export interface BarKey {
  ledId: number;
  x: number;
  y: number;
}

/** Vertical for a column, horizontal for a row — column stagger makes a row's
 *  keys differ in y, so the wider extent decides. */
export function detectBarOrder(keys: readonly BarKey[]): BarOrder {
  if (keys.length === 0) return "bottom-up";
  const xs = keys.map((key) => key.x);
  const ys = keys.map((key) => key.y);
  const xSpan = Math.max(...xs) - Math.min(...xs);
  const ySpan = Math.max(...ys) - Math.min(...ys);
  return xSpan > ySpan ? "left-right" : "bottom-up";
}

/** LEDs in 20%→100% order. `keys` is in selection order. */
export function orderBatteryBar(keys: readonly BarKey[], order: BarOrder): number[] {
  const sorted = [...keys];
  switch (order) {
    case "bottom-up":
      sorted.sort((a, b) => b.y - a.y || a.x - b.x);
      break;
    case "top-down":
      sorted.sort((a, b) => a.y - b.y || a.x - b.x);
      break;
    case "left-right":
      sorted.sort((a, b) => a.x - b.x || b.y - a.y);
      break;
    case "right-left":
      sorted.sort((a, b) => b.x - a.x || b.y - a.y);
      break;
    case "selection":
      break;
  }
  return sorted.map((key) => key.ledId);
}

const solid = (r: number, g: number, b: number): LightingEffect => ({
  Solid: { color: { r, g, b } },
});

const GREEN = solid(0, 128, 0);
const AMBER = solid(160, 48, 0);
const RED = solid(160, 0, 0);
const CHARGING = solid(0, 64, 160);
const EMPTY = solid(42, 42, 42);
const BONDED = solid(176, 0, 0);
const SELECTED = solid(0, 80, 255);
const ACTIVE = solid(0, 192, 32);
const ADVERTISING: LightingEffect = {
  Blink: { color: { r: 255, g: 255, b: 255 }, period_ms: 800, phase_ms: 0, duty: 50 },
};

function rule(
  led: number,
  layer: number,
  effect: LightingEffect,
): StatusRule {
  return {
    cell: {
      conditions: {
        layer: { layer, active: true },
        battery: undefined,
        output_mode: undefined,
      },
      led_id: led,
      effect,
    },
    connection: undefined,
    effects: undefined,
  };
}

export function batteryBarRules(preset: BatteryBarPreset): StatusRule[] {
  if (preset.leds.length !== 5) throw new Error("a battery bar needs exactly five LEDs");
  if (new Set(preset.leds).size !== 5) throw new Error("a battery bar needs five distinct LEDs");
  const levels = [1, 21, 41, 61, 81];
  const base = levels.map((min_level, index) => {
    const entry = rule(preset.leds[index], preset.layer, GREEN);
    entry.cell.conditions.battery = {
      node: preset.node,
      min_level,
      max_level: undefined,
      charge: "Any",
    };
    return entry;
  });
  const low = [
    { led: preset.leds[0], min_level: 1, max_level: 40, effect: AMBER },
    { led: preset.leds[1], min_level: 21, max_level: 40, effect: AMBER },
    { led: preset.leds[0], min_level: 1, max_level: 20, effect: RED },
  ].map(({ led, min_level, max_level, effect }) => {
    const entry = rule(led, preset.layer, effect);
    entry.cell.conditions.battery = {
      node: preset.node,
      min_level,
      max_level,
      charge: "Any",
    };
    return entry;
  });
  const charging = levels.map((min_level, index) => {
    const entry = rule(preset.leds[index], preset.layer, CHARGING);
    entry.cell.conditions.battery = {
      node: preset.node,
      min_level,
      max_level: undefined,
      charge: "Charging",
    };
    return entry;
  });
  return [...base, ...low, ...charging];
}

export function bleStatusRules(layer: number, led: number, slot: number): StatusRule[] {
  const empty = rule(led, layer, EMPTY);
  empty.connection = {
    transport: undefined,
    profile: undefined,
    ble_state: undefined,
    bonded: { slot, bonded: false },
    usb_connected: undefined,
  };
  const bonded = rule(led, layer, BONDED);
  bonded.connection = {
    transport: undefined,
    profile: undefined,
    ble_state: undefined,
    bonded: { slot, bonded: true },
    usb_connected: undefined,
  };
  const inactive = rule(led, layer, SELECTED);
  inactive.connection = {
    transport: undefined,
    profile: slot,
    ble_state: "Inactive",
    bonded: undefined,
    usb_connected: undefined,
  };
  const advertising = rule(led, layer, ADVERTISING);
  advertising.connection = {
    transport: undefined,
    profile: slot,
    ble_state: "Advertising",
    bonded: undefined,
    usb_connected: undefined,
  };
  const connected = rule(led, layer, SELECTED);
  connected.connection = {
    transport: undefined,
    profile: slot,
    ble_state: "Connected",
    bonded: undefined,
    usb_connected: undefined,
  };
  const active = rule(led, layer, ACTIVE);
  active.connection = {
    transport: "Ble",
    profile: slot,
    ble_state: "Connected",
    bonded: undefined,
    usb_connected: undefined,
  };
  return [empty, bonded, inactive, advertising, connected, active];
}

export function usbStatusRules(layer: number, led: number): StatusRule[] {
  const unplugged = rule(led, layer, BONDED);
  unplugged.connection = {
    transport: undefined,
    profile: undefined,
    ble_state: undefined,
    bonded: undefined,
    usb_connected: false,
  };
  const plugged = rule(led, layer, SELECTED);
  plugged.connection = {
    transport: undefined,
    profile: undefined,
    ble_state: undefined,
    bonded: undefined,
    usb_connected: true,
  };
  const active = rule(led, layer, ACTIVE);
  active.connection = {
    transport: "Usb",
    profile: undefined,
    ble_state: undefined,
    bonded: undefined,
    usb_connected: undefined,
  };
  return [unplugged, plugged, active];
}

export function connectionKeyAction(kind: ConnectionKeyPreset["kind"]): KeyAction {
  return kind.type === "ble"
    ? { Single: { User: kind.slot } }
    : { Single: { KeyboardControl: "OutputUsb" } };
}

export function replaceBatteryBar(
  current: StatusRule[],
  preset: BatteryBarPreset,
): StatusRule[] {
  const kept = current.filter((entry) => {
    const battery = entry.cell.conditions.battery;
    return battery === undefined ||
      battery.node !== preset.node ||
      entry.cell.conditions.layer?.layer !== preset.layer;
  });
  return [...kept, ...batteryBarRules(preset)];
}

export function replaceBleStatus(
  current: StatusRule[],
  layer: number,
  led: number,
  slot: number,
): StatusRule[] {
  const kept = current.filter((entry) => {
    if (entry.cell.led_id !== led || entry.cell.conditions.layer?.layer !== layer) return true;
    const connection = entry.connection;
    return connection?.profile !== slot && connection?.bonded?.slot !== slot;
  });
  return [...kept, ...bleStatusRules(layer, led, slot)];
}

export function replaceUsbStatus(current: StatusRule[], layer: number, led: number): StatusRule[] {
  const kept = current.filter((entry) => {
    if (entry.cell.led_id !== led || entry.cell.conditions.layer?.layer !== layer) return true;
    const connection = entry.connection;
    return connection?.usb_connected === undefined && connection?.transport !== "Usb";
  });
  return [...kept, ...usbStatusRules(layer, led)];
}

export function installGlove80StatusRules(
  current: StatusRule[],
  layer = GLOVE80_MAGIC_LAYER,
): StatusRule[] {
  let rules = current;
  for (const bar of glove80BatteryBars(layer)) rules = replaceBatteryBar(rules, bar);
  for (const key of glove80ConnectionKeys(layer)) {
    rules = key.kind.type === "ble"
      ? replaceBleStatus(rules, key.layer, key.led, key.kind.slot)
      : replaceUsbStatus(rules, key.layer, key.led);
  }
  return rules;
}

export async function writeGlove80StatusSetup(
  writer: StatusSetupWriter,
  current: StatusRule[],
  layer = GLOVE80_MAGIC_LAYER,
): Promise<StatusSetupResult> {
  for (const preset of glove80ConnectionKeys(layer)) {
    const result = await writer.setKey(preset, connectionKeyAction(preset.kind));
    if (!result.ok) return result;
  }
  return writer.applyRules(installGlove80StatusRules(current, layer));
}
