// A status setup that asks for its keys on the board:
// - a connection key: one key whose action switches to a Bluetooth profile or
//   to USB and whose light shows that connection's state;
// - a battery bar: three to eight keys in a column or a row that light one
//   after the other as a half's battery fills.
// What a pick collects, why the keys chosen so far will not do, and what it
// installs: the input of set_connection_key or set_battery_bar. Pure.

import type { KeyPlace } from "../key-moves";
import {
  detectBarOrder,
  MAX_BAR_SEGMENTS,
  MIN_BAR_SEGMENTS,
  orderBatteryBar,
  type BarOrder,
  type BarStyle,
  type BatteryBarPreset,
  type ConnectionKeyPreset,
} from "./status-presets";

export type KeyPick =
  | { kind: "connection"; layer: number; connection: ConnectionKeyPreset["kind"] }
  /** `order`: how the bar fills; "auto" reads it from where the keys are. */
  | { kind: "battery"; layer: number; node: number; order: BarOrder | "auto"; style: BarStyle };

/** A chosen key: where it is in the matrix, its LED, and where it is drawn. */
export interface PickedKey extends KeyPlace {
  ledId: number;
  x: number;
  y: number;
}

export type PickPlan =
  | { ok: true; name: "set_connection_key"; input: ConnectionKeyPreset }
  | { ok: true; name: "set_battery_bar"; input: BatteryBarPreset }
  | { ok: false; problem: string };

/** One key, replaced by each press, or several, each press adding or removing one. */
export const pickTakes = (pick: KeyPick): "one" | "many" => (pick.kind === "connection" ? "one" : "many");

/** What is being picked, as the banner names it. */
export function pickName(pick: KeyPick): string {
  if (pick.kind === "battery") return "battery bar";
  return pick.connection.type === "usb" ? "USB key" : `Bluetooth ${pick.connection.slot + 1} key`;
}

/** What the canvas asks for while the pick is on; `layer` is the layer's name. */
export const pickPrompt = (pick: KeyPick, layer: string): string =>
  pickTakes(pick) === "one"
    ? `Click the key for the ${pickName(pick)} on ${layer}`
    : `Click or drag over the keys for the ${pickName(pick)} on ${layer}`;

/** What the keys chosen so far (in the order chosen) install, or why they cannot yet. */
export function planPick(pick: KeyPick, keys: readonly PickedKey[]): PickPlan {
  if (pick.kind === "connection") {
    const [key] = keys;
    if (keys.length !== 1) return { ok: false, problem: keys.length === 0 ? "Choose its key first" : "A connection key is one key" };
    return { ok: true, name: "set_connection_key", input: { layer: pick.layer, row: key.row, col: key.col, led: key.ledId, kind: pick.connection } };
  }
  if (keys.length < MIN_BAR_SEGMENTS || keys.length > MAX_BAR_SEGMENTS) {
    return { ok: false, problem: `A battery bar is ${MIN_BAR_SEGMENTS} to ${MAX_BAR_SEGMENTS} keys: ${keys.length} chosen` };
  }
  const leds = orderBatteryBar(keys, pick.order === "auto" ? detectBarOrder(keys) : pick.order);
  return { ok: true, name: "set_battery_bar", input: { layer: pick.layer, node: pick.node, leds, style: pick.style } };
}
