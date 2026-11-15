// A key's status light: what its LED shows about the keyboard rather than one
// colour. Each lives in the firmware's rule table, as rules on the key's LED
// while its layer is on:
// - Lock light: one colour while Caps, Num or Scroll Lock is on, another (or
//   dark) while it is off;
// - Battery level: one colour below a level, another above, for either half;
// - Bluetooth profile: the profile's state (free, paired, chosen, connecting,
//   in use), in the colours of the Glove80 status preset;
// - USB: unplugged, plugged in, in use, likewise.
// Only rules that are exactly one of these are the key's own; any other rule
// on its LED belongs to the condition rules (Layout properties) and is never
// touched. Pure.

import { canonicalJson, same } from "../../model/deep-equal";
import type { LightingEffect, LightingRgb8 } from "../../model/lighting-types";
import { effectRgb } from "./effect";
import type { Rule, Rules } from "./rules";
import { bleStatusRules, STATUS_COLORS, usbStatusRules } from "./statusPresets";

export type Lock = "caps_lock" | "num_lock" | "scroll_lock";
export const BATTERY_LEVELS = [20, 40, 60, 80] as const;

export type StatusLight =
  /** `off` null: dark while the lock is off. */
  | { kind: "lock"; lock: Lock; on: LightingRgb8; off: LightingRgb8 | null }
  /** `node`: whose battery, on a split board 0 the left half and 1 the right;
   *  unset, the half the key is on. */
  | { kind: "battery"; level: number; below: LightingRgb8; above: LightingRgb8; node?: number }
  /** `profile`: the firmware's slot, from 0. */
  | { kind: "bluetooth"; profile: number }
  | { kind: "usb" };

const BLACK: LightingRgb8 = { r: 0, g: 0, b: 0 };
const isBlack = (c: LightingRgb8) => c.r === 0 && c.g === 0 && c.b === 0;
const solid = (color: LightingRgb8): LightingEffect => ({ Solid: { color } });

/** The colour a lit board shows for a status light: a lock lit, a battery above
 *  its level, a profile or USB in use. */
export function statusShownColor(light: StatusLight): LightingRgb8 {
  if (light.kind === "lock") return light.on;
  if (light.kind === "battery") return light.above;
  return effectRgb(STATUS_COLORS.active);
}

/* ---- which rules are a key's own ----------------------------------------- */

/** A rule on this LED while this layer is on, with no condition the key's
 *  lights never set. */
function onKey(rule: Rule, layer: number, led: number): boolean {
  const { conditions } = rule.cell;
  if (rule.cell.led_id !== led || conditions.layer?.layer !== layer || conditions.layer.active !== true) return false;
  return !conditions.output_mode && !rule.effects && !rule.layers && !rule.maintenance && !rule.split_transport && !rule.unknown_predicates?.length;
}

/** A lock or battery rule: only a lock or only a battery condition. */
const isLockOrBattery = (rule: Rule) => !rule.connection && Boolean(rule.indicators) !== Boolean(rule.cell.conditions.battery);
const isConnection = (rule: Rule) => Boolean(rule.connection) && !rule.indicators && !rule.cell.conditions.battery;

/** The same rules, in any order (the key's own rules can sit anywhere in the table). */
const sameSet = (a: Rules, b: Rules) => same(a.map(canonicalJson).sort(), b.map(canonicalJson).sort());

/** The connection light the key's connection rules are exactly, if any. */
function connectionLight(own: Rules, layer: number, led: number): Extract<StatusLight, { kind: "bluetooth" | "usb" }> | null {
  if (own.length === 0) return null;
  if (sameSet(own, usbStatusRules(layer, led))) return { kind: "usb" };
  const profile = own[0].connection?.profile ?? own[0].connection?.bonded?.slot;
  if (profile !== undefined && sameSet(own, bleStatusRules(layer, led, profile))) return { kind: "bluetooth", profile };
  return null;
}

/** The rules of `rules` that are the key's own status light on this layer. */
function ownRules(rules: Rules, layer: number, led: number): Set<Rule> {
  const here = rules.filter((rule) => onKey(rule, layer, led));
  const connection = here.filter(isConnection);
  return new Set([...here.filter(isLockOrBattery), ...(connectionLight(connection, layer, led) ? connection : [])]);
}

/* ---- reading and writing ---------------------------------------------- */

function newRule(layer: number, led: number, color: LightingRgb8): Rule {
  return {
    cell: {
      conditions: { layer: { layer, active: true }, battery: undefined, output_mode: undefined },
      led_id: led,
      effect: solid(color),
    },
    connection: undefined,
    effects: undefined,
    layers: undefined,
    indicators: undefined,
    maintenance: undefined,
    split_transport: undefined,
  };
}

/** The status light a key has on a layer, read from its rules. */
export function statusLightOf(rules: Rules, layer: number, led: number): StatusLight | null {
  const here = rules.filter((rule) => onKey(rule, layer, led));
  const colorOf = (rule: Rule | undefined) => (rule ? effectRgb(rule.cell.effect) : null);
  const lockRules = here.filter((rule) => isLockOrBattery(rule) && rule.indicators);
  if (lockRules.length > 0) {
    const set = (rule: Rule) => (Object.entries(rule.indicators ?? {}) as Array<[Lock, boolean | undefined]>).find(([, v]) => v !== undefined);
    const on = lockRules.find((rule) => set(rule)?.[1] === true);
    const off = lockRules.find((rule) => set(rule)?.[1] === false);
    const lock = set(on ?? off ?? lockRules[0])?.[0] ?? "caps_lock";
    const offColor = colorOf(off);
    return { kind: "lock", lock, on: colorOf(on) ?? BLACK, off: offColor && !isBlack(offColor) ? offColor : null };
  }
  const battery = here.filter((rule) => isLockOrBattery(rule) && rule.cell.conditions.battery);
  if (battery.length > 0) {
    const above = battery.find((rule) => rule.cell.conditions.battery?.min_level !== undefined);
    const below = battery.find((rule) => rule.cell.conditions.battery?.max_level !== undefined);
    const level = above?.cell.conditions.battery?.min_level ?? (below?.cell.conditions.battery?.max_level ?? 39) + 1;
    return {
      kind: "battery",
      node: (above ?? below)?.cell.conditions.battery?.node ?? 0,
      level,
      below: colorOf(below) ?? BLACK,
      above: colorOf(above) ?? BLACK,
    };
  }
  return connectionLight(here.filter(isConnection), layer, led);
}

/** The rules with this key's status light replaced by `light` (none: removed). */
export function withStatusLight(rules: Rules, layer: number, led: number, light: StatusLight | null, keyNode = 0): Rules {
  const own = ownRules(rules, layer, led);
  const kept = rules.filter((rule) => !own.has(rule));
  if (!light) return kept;
  if (light.kind === "bluetooth") return [...kept, ...bleStatusRules(layer, led, light.profile)];
  if (light.kind === "usb") return [...kept, ...usbStatusRules(layer, led)];
  if (light.kind === "lock") {
    const state = (value: boolean, color: LightingRgb8) => {
      const rule = newRule(layer, led, color);
      rule.indicators = { num_lock: undefined, caps_lock: undefined, scroll_lock: undefined, [light.lock]: value };
      return rule;
    };
    return [...kept, state(false, light.off ?? BLACK), state(true, light.on)];
  }
  const node = light.node ?? keyNode;
  const level = (color: LightingRgb8, min: number | undefined, max: number | undefined) => {
    const rule = newRule(layer, led, color);
    rule.cell.conditions.battery = { node, min_level: min, max_level: max, charge: "Any" };
    return rule;
  };
  return [...kept, level(light.below, undefined, light.level - 1), level(light.above, light.level, undefined)];
}
