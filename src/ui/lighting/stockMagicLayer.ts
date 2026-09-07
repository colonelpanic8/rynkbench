import type {
  KeyAction,
  KeyboardAction,
  LightAction,
  LightingConnectionCondition,
  LightingEffect,
  LightingSceneCell,
} from "../../vendor/rynk-wasm/rynk_wasm";
import { GLOVE80_COLS, GLOVE80_ROWS } from "../../model/boards/glove80";
import { same } from "../deep-equal";
import type { StatusRule, StatusSetupResult } from "./statusPresets";
import { setLayerInMask } from "./wakeLayers";

// MoErgo's factory Glove80 Magic layer, rebuilt from RMK actions and runtime
// lighting rules. Bindings follow glove80.keymap in moergo-sc/glove80-zmk-config;
// indicator positions and colors follow the `underglow_indicators` node in
// glove80_lh.dts and rgb_underglow.c of moergo-sc/zmk.

export interface IndicatorKey {
  row: number;
  col: number;
  led: number;
}

const rowKeys = (row: number, leds: number[]): IndicatorKey[] =>
  leds.map((led, col) => ({ row, col, led }));
/** Thumb keys sit in matrix column 6; each one's LED id equals its row. */
const thumb = (row: number): IndicatorKey => ({ row, col: 6, led: row });

/** Number row: layers 0-5, outer key first. */
export const STOCK_LAYER_KEYS = rowKeys(1, [35, 29, 23, 17, 11, 6]);
/** Left battery on row 3, right battery on row 4, each filling inward. */
export const STOCK_LEFT_BATTERY_KEYS = rowKeys(2, [36, 30, 24, 18, 12, 7]);
export const STOCK_RIGHT_BATTERY_KEYS = rowKeys(3, [37, 31, 25, 19, 13, 8]);
/** Bluetooth profiles 0-3 on T4, T5, T1, T2; USB on T6. */
export const STOCK_PROFILE_KEYS = [thumb(3), thumb(4), thumb(0), thumb(1)];
export const STOCK_USB_KEY = thumb(5);

/** Every key the template lights, for checking a board against the stock LED map. */
export function stockMagicIndicatorKeys(): IndicatorKey[] {
  return [
    ...STOCK_LAYER_KEYS,
    ...STOCK_LEFT_BATTERY_KEYS,
    ...STOCK_RIGHT_BATTERY_KEYS,
    ...STOCK_PROFILE_KEYS,
    STOCK_USB_KEY,
  ];
}

/** Board-reserved User action that forwards a bootloader request to the right half. */
const PERIPHERAL_BOOTLOADER_ACTION = 12;
/** LEDs of the left half, the only half ZMK's status view draws on. */
const LEFT_HALF_LEDS = 40;

const light = (action: LightAction): KeyAction => ({ Single: { Light: action } });
const control = (action: KeyboardAction): KeyAction => ({ Single: { KeyboardControl: action } });
const user = (id: number): KeyAction => ({ Single: { User: id } });

/** The layer's 6x14 row-major actions. Every key the stock layer leaves as
 *  `&none` is unbound. `profiles` is the firmware's BLE slot count, which
 *  positions RMK's clear-bond action after the slot-select ids. */
export function stockMagicLayerGrid(profiles: number): KeyAction[] {
  const grid: KeyAction[] = Array.from({ length: GLOVE80_ROWS * GLOVE80_COLS }, () => "No");
  const set = (row: number, col: number, action: KeyAction) => {
    grid[row * GLOVE80_COLS + col] = action;
  };
  set(0, 0, user(profiles + 2)); // BT_CLR: forget the active profile's bond
  set(2, 1, light("RgbSpi"));
  set(2, 2, light("RgbSai"));
  set(2, 3, light("RgbHui"));
  set(2, 4, light("BacklightUp"));
  set(2, 5, light("RgbTog"));
  set(3, 0, control("Bootloader"));
  set(3, 1, light("RgbSpd"));
  set(3, 2, light("RgbSad"));
  set(3, 3, light("RgbHud"));
  set(3, 4, light("BacklightDown"));
  set(3, 5, light("RgbModeForward"));
  set(3, 13, user(PERIPHERAL_BOOTLOADER_ACTION));
  set(4, 0, control("Reboot"));
  set(4, 13, control("Reboot"));
  STOCK_PROFILE_KEYS.slice(0, profiles).forEach((key, slot) => set(key.row, key.col, user(slot)));
  set(STOCK_USB_KEY.row, STOCK_USB_KEY.col, control("OutputUsb"));
  return grid;
}

const rgb = (r: number, g: number, b: number): LightingEffect => ({ Solid: { color: { r, g, b } } });

// ZMK's status palette.
const RED = rgb(255, 0, 0);
const YELLOW = rgb(255, 255, 0);
const GREEN = rgb(0, 255, 0);
const DULL_GREEN = rgb(0, 255, 104);
const MAGENTA = rgb(255, 0, 255);
const WHITE = rgb(255, 255, 255);
const LILAC = rgb(107, 31, 206);
const BLACK = rgb(0, 0, 0);

function rule(layer: number, led: number, effect: LightingEffect): StatusRule {
  return {
    cell: {
      conditions: { layer: { layer, active: true }, battery: undefined, output_mode: undefined },
      led_id: led,
      effect,
    },
    connection: undefined,
    effects: undefined,
  };
}

function connection(fields: Partial<LightingConnectionCondition>): LightingConnectionCondition {
  return {
    transport: undefined,
    profile: undefined,
    ble_state: undefined,
    bonded: undefined,
    usb_connected: undefined,
    ...fields,
  };
}

/** Six segments at 0, 20, …, 100 percent; the whole bar is green from 40,
 *  yellow from 20, red below, and green throughout while charging. */
function batteryRules(layer: number, node: number, keys: IndicatorKey[]): StatusRule[] {
  const banded = (
    led: number,
    effect: LightingEffect,
    min: number,
    max: number | undefined,
    charge: "Any" | "Charging" = "Any",
  ): StatusRule => {
    const entry = rule(layer, led, effect);
    entry.cell.conditions.battery = {
      node,
      min_level: min > 0 ? min : undefined,
      max_level: max,
      charge,
    };
    return entry;
  };
  const rules: StatusRule[] = [];
  keys.forEach(({ led }, index) => {
    const level = Math.round((index * 100) / (keys.length - 1));
    rules.push(banded(led, GREEN, Math.max(level, 40), undefined));
    if (level < 40) rules.push(banded(led, YELLOW, Math.max(level, 20), 39));
    if (level < 20) rules.push(banded(led, RED, level, 19));
  });
  for (const { led } of keys) rules.push(banded(led, GREEN, 0, undefined, "Charging"));
  return rules;
}

/** Lilac unpaired, red paired but not connected, dull green connected, white
 *  connected and carrying typing. */
function profileRules(layer: number, led: number, slot: number): StatusRule[] {
  const unpaired = rule(layer, led, LILAC);
  unpaired.connection = connection({ bonded: { slot, bonded: false } });
  const paired = rule(layer, led, RED);
  paired.connection = connection({ bonded: { slot, bonded: true } });
  const connected = rule(layer, led, DULL_GREEN);
  connected.connection = connection({ profile: slot, ble_state: "Connected" });
  const active = rule(layer, led, WHITE);
  active.connection = connection({ profile: slot, ble_state: "Connected", transport: "Ble" });
  return [unpaired, paired, connected, active];
}

function usbRules(layer: number, led: number): StatusRule[] {
  const unplugged = rule(layer, led, LILAC);
  unplugged.connection = connection({ usb_connected: false });
  const plugged = rule(layer, led, DULL_GREEN);
  plugged.connection = connection({ usb_connected: true });
  const active = rule(layer, led, WHITE);
  active.connection = connection({ transport: "Usb" });
  return [unplugged, plugged, active];
}

/** The indicator rules for a Magic layer at `layer` on a board with
 *  `numLayers` layers and `profiles` BLE slots. A rule can watch one layer,
 *  so a layer indicator lights whenever its layer is active rather than only
 *  while Magic is held; the default layer is skipped because it always is. */
export function stockMagicLayerRules(layer: number, numLayers: number, profiles: number): StatusRule[] {
  const rules: StatusRule[] = [];
  STOCK_LAYER_KEYS.slice(0, numLayers).forEach((key, shown) => {
    if (shown === 0) return;
    const entry = rule(shown, key.led, MAGENTA);
    rules.push(entry);
  });
  rules.push(...batteryRules(layer, 0, STOCK_LEFT_BATTERY_KEYS));
  rules.push(...batteryRules(layer, 1, STOCK_RIGHT_BATTERY_KEYS));
  STOCK_PROFILE_KEYS.slice(0, profiles).forEach((key, slot) =>
    rules.push(...profileRules(layer, key.led, slot)),
  );
  rules.push(...usbRules(layer, STOCK_USB_KEY.led));
  return rules;
}

/** Replace this layer's rules on the template's LEDs, keeping everything else. */
export function installStockMagicLayerRules(
  current: StatusRule[],
  layer: number,
  numLayers: number,
  profiles: number,
): StatusRule[] {
  const owned = new Set(stockMagicIndicatorKeys().map((key) => key.led));
  const kept = current.filter((entry) => {
    const watched = entry.cell.conditions.layer?.layer;
    if (watched === undefined || !owned.has(entry.cell.led_id)) return true;
    if (watched === layer) return false;
    // A layer indicator watches its own layer, not Magic.
    return STOCK_LAYER_KEYS[watched]?.led !== entry.cell.led_id;
  });
  return [...kept, ...stockMagicLayerRules(layer, numLayers, profiles)];
}

/** The layer's scene: the left half dark, as under ZMK's status view. */
export function stockMagicLayerScene(layer: number): LightingSceneCell[] {
  return Array.from({ length: LEFT_HALF_LEDS }, (_, led_id) => ({ layer, led_id, effect: BLACK }));
}

export function sceneTableWithStockMagicLayer(
  current: LightingSceneCell[],
  layer: number,
): LightingSceneCell[] {
  return [...current.filter((cell) => cell.layer !== layer), ...stockMagicLayerScene(layer)];
}

export interface StockMagicLayerWriter {
  setKey(row: number, col: number, action: KeyAction): Promise<StatusSetupResult>;
  applyScenes(cells: LightingSceneCell[]): Promise<StatusSetupResult>;
  applyRules(rules: StatusRule[]): Promise<StatusSetupResult>;
  setWakeLayers(mask: number): Promise<StatusSetupResult>;
}

export interface StockMagicLayerTarget {
  layer: number;
  numLayers: number;
  profiles: number;
  /** The board's keys; matrix holes are never written. */
  keys: Array<{ row: number; col: number }>;
  /** The layer's current actions, row-major, so unchanged keys are skipped. */
  current: KeyAction[];
  rules: StatusRule[];
  ruleCapacity: number;
  /** `null` when the firmware has no scene table. */
  scenes: LightingSceneCell[] | null;
  sceneCapacity: number;
  /** `null` when the firmware has no wake-layer policy. */
  wakeLayers: number | null;
}

/** Bind the layer, darken it, install its indicators, and make it wake
 *  lighting, in that order. Capacity is checked before anything is written. */
export async function writeStockMagicLayer(
  writer: StockMagicLayerWriter,
  target: StockMagicLayerTarget,
): Promise<StatusSetupResult> {
  const rules = installStockMagicLayerRules(target.rules, target.layer, target.numLayers, target.profiles);
  if (rules.length > target.ruleCapacity) {
    return {
      ok: false,
      message: `This layout needs ${rules.length} rules; the keyboard holds ${target.ruleCapacity}.`,
    };
  }
  const scenes = target.scenes && sceneTableWithStockMagicLayer(target.scenes, target.layer);
  if (scenes && scenes.length > target.sceneCapacity) {
    return {
      ok: false,
      message: `This layout needs ${scenes.length} scene cells; the keyboard holds ${target.sceneCapacity}.`,
    };
  }
  const grid = stockMagicLayerGrid(target.profiles);
  const later = (step: string, message: string): StatusSetupResult => ({
    ok: false,
    message: `The keys were written, but ${step} failed: ${message}. Retry to finish.`,
  });
  try {
    for (const { row, col } of target.keys) {
      const index = row * GLOVE80_COLS + col;
      if (same(target.current[index], grid[index])) continue;
      const result = await writer.setKey(row, col, grid[index]);
      if (!result.ok) return result;
    }
    if (scenes) {
      const result = await writer.applyScenes(scenes);
      if (!result.ok) return later("darkening the layer", result.message);
    }
    const applied = await writer.applyRules(rules);
    if (!applied.ok) return later("installing the indicators", applied.message);
    if (target.wakeLayers !== null) {
      const woken = await writer.setWakeLayers(setLayerInMask(target.wakeLayers, target.layer, true));
      if (!woken.ok) return later("the Magic designation", woken.message);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
