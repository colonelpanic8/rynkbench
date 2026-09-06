import type {
  KeyAction,
  LightingEffect,
  LightingExtendedConditionalSceneCell,
} from "../../vendor/rynk-wasm/rynk_wasm";

export type StatusRule = LightingExtendedConditionalSceneCell;

/** How a bar colors itself as the level drops.
 *  - `bands`: each segment owns an equal band; the lowest lit segments turn
 *    amber under 40% and the first turns red under 20%.
 *  - `stock`: MoErgo's firmware treatment — thresholds 0…100 in equal steps,
 *    the whole bar green at 40%+, yellow at 20%+, red below. */
export type BarStyle = "bands" | "stock";

export const BAR_STYLES: Array<{ id: BarStyle; label: string }> = [
  { id: "bands", label: "Equal bands · amber/red low" },
  { id: "stock", label: "MoErgo stock · whole bar green/yellow/red" },
];

export const MIN_BAR_SEGMENTS = 3;
export const MAX_BAR_SEGMENTS = 8;

export interface BatteryBarPreset {
  layer: number;
  node: number;
  /** Empty-to-full LEDs. */
  leds: number[];
  style?: BarStyle;
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

/** Where the Glove80 preset draws its bars.
 *  - `outer-columns`: five keys up each half's outer column, below the top key.
 *  - `stock`: MoErgo's firmware layout — six keys across the left half, the
 *    left battery on row 2 and the right battery on row 3. */
export type Glove80BarLayout = "outer-columns" | "stock";

export const GLOVE80_BAR_LAYOUTS: Array<{ id: Glove80BarLayout; label: string; hint: string }> = [
  {
    id: "outer-columns",
    label: "Outer columns",
    hint: "five vertical segments per half, each on its own half",
  },
  {
    id: "stock",
    label: "MoErgo stock",
    hint: "six horizontal segments per half, both across the left half's rows 2 and 3",
  },
];

export function glove80BatteryBars(
  layer = GLOVE80_MAGIC_LAYER,
  layout: Glove80BarLayout = "outer-columns",
): BatteryBarPreset[] {
  if (layout === "stock") {
    return [
      { layer, node: 0, leds: [36, 30, 24, 18, 12, 7], style: "stock" },
      { layer, node: 1, leds: [37, 31, 25, 19, 13, 8], style: "stock" },
    ];
  }
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
const YELLOW = solid(160, 128, 0);
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

/** The minimum level at which each segment lights, empty to full. */
export function batteryBarLevels(count: number, style: BarStyle = "bands"): number[] {
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) return 1;
    return style === "stock"
      ? Math.round((index * 100) / (count - 1))
      : 1 + Math.floor((index * 100) / count);
  });
}

export function batteryBarRules(preset: BatteryBarPreset): StatusRule[] {
  const count = preset.leds.length;
  if (count < MIN_BAR_SEGMENTS || count > MAX_BAR_SEGMENTS) {
    throw new Error(`a battery bar needs ${MIN_BAR_SEGMENTS}–${MAX_BAR_SEGMENTS} LEDs`);
  }
  if (new Set(preset.leds).size !== count) throw new Error("a battery bar needs distinct LEDs");
  const style = preset.style ?? "bands";
  const levels = batteryBarLevels(count, style);
  const band = (
    led: number,
    effect: LightingEffect,
    min_level: number,
    max_level: number | undefined,
    charge: "Any" | "Charging" = "Any",
  ): StatusRule => {
    const entry = rule(led, preset.layer, effect);
    entry.cell.conditions.battery = { node: preset.node, min_level, max_level, charge };
    return entry;
  };
  const levelled: StatusRule[] = [];
  if (style === "stock") {
    levels.forEach((level, index) => {
      const led = preset.leds[index];
      levelled.push(band(led, GREEN, Math.max(level, 40), undefined));
      if (level < 40) levelled.push(band(led, YELLOW, Math.max(level, 20), 39));
      if (level < 20) levelled.push(band(led, RED, level, 19));
    });
  } else {
    levels.forEach((level, index) => levelled.push(band(preset.leds[index], GREEN, level, undefined)));
    levels.forEach((level, index) => {
      if (level <= 40) levelled.push(band(preset.leds[index], AMBER, level, 40));
    });
    levels.forEach((level, index) => {
      if (level <= 20) levelled.push(band(preset.leds[index], RED, level, 20));
    });
  }
  const charging = levels.map((level, index) =>
    band(preset.leds[index], CHARGING, level, undefined, "Charging"),
  );
  return [...levelled, ...charging];
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
  layout: Glove80BarLayout = "outer-columns",
): StatusRule[] {
  let rules = current;
  for (const bar of glove80BatteryBars(layer, layout)) rules = replaceBatteryBar(rules, bar);
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
  layout: Glove80BarLayout = "outer-columns",
): Promise<StatusSetupResult> {
  for (const preset of glove80ConnectionKeys(layer)) {
    const result = await writer.setKey(preset, connectionKeyAction(preset.kind));
    if (!result.ok) return result;
  }
  return writer.applyRules(installGlove80StatusRules(current, layer, layout));
}
