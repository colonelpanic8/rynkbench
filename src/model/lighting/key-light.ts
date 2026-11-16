// A key's light as GLIDE's Key Lighting tab offers it, on RMK's lighting:
// - Off: a black scene cell (which also hides a firmware default);
// - Color: a scene cell with a colour and an effect (steady, blink, breathe);
// - Layer below: no cell, so the layers underneath show;
// - Status light: rules in the firmware's rule table (status-light.ts).
// And the colours a layout already uses, most used first, to pick again or
// change everywhere. Pure.

import type { LightingEffect, LightingOverlayCell, LightingRgb8 } from "../lighting-types";
import { rgbToHex } from "./color";
import { buildEffect, effectKind, effectRgb, effectTiming, type EffectKind, type EffectTiming } from "./effect";
import { BLACK_EFFECT } from "./preview";
import type { Rules } from "./rules";
import { statusShownColor, withStatusLight, type StatusLight } from "./status-light";

export type KeyLight =
  | { kind: "off" }
  | { kind: "below" }
  | { kind: "color"; color: LightingRgb8; effect: EffectKind; timing: EffectTiming }
  | StatusLight;

const isBlack = (c: LightingRgb8) => c.r === 0 && c.g === 0 && c.b === 0;
const isStatus = (light: KeyLight): light is StatusLight => light.kind !== "off" && light.kind !== "below" && light.kind !== "color";

/* ---- a key's light ----------------------------------------------------- */

/** The light a key shows on a layer: its status light first, then its scene cell. */
export function keyLightOf(effect: LightingEffect | undefined, status: StatusLight | null = null): KeyLight {
  if (status) return status;
  if (!effect) return { kind: "below" };
  const color = effectRgb(effect);
  if (effectKind(effect) === "Solid" && isBlack(color)) return { kind: "off" };
  return { kind: "color", color, effect: effectKind(effect), timing: effectTiming(effect) };
}

/** The colour a lit board shows for a key; none while it is off or shows the layer below. */
export function shownColor(light: KeyLight): LightingRgb8 | null {
  if (light.kind === "color") return light.color;
  return isStatus(light) ? statusShownColor(light) : null;
}

export function sameLight(a: KeyLight, b: KeyLight): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface LightPlan {
  paint: LightingOverlayCell[];
  erase: number[];
  /** The whole rule table after the change; null when it does not change. */
  rules: Rules | null;
}

/** What to write for keys to get `light` on `layer`. A status light lives in
 *  rules, so the key's scene cell goes; any other light lives in the scene, so
 *  the key's status rules go. */
export function planLight(
  light: KeyLight,
  leds: readonly number[],
  layer: number,
  rules: Rules,
  nodeOf: (led: number) => number = () => 0,
): LightPlan {
  const status = isStatus(light) ? light : null;
  let nextRules = rules;
  for (const led of leds) nextRules = withStatusLight(nextRules, layer, led, status, nodeOf(led));
  const changed = JSON.stringify(nextRules) !== JSON.stringify(rules);
  if (light.kind !== "off" && light.kind !== "color") return { paint: [], erase: [...leds], rules: changed ? nextRules : null };
  const effect = light.kind === "off" ? BLACK_EFFECT : buildEffect(light.effect, light.color, light.timing);
  return { paint: leds.map((led_id) => ({ led_id, effect, ttl_ms: undefined })), erase: [], rules: changed ? nextRules : null };
}

/* ---- colours ----------------------------------------------------------- */

/** The lit colours in `effects`, most used first (black is Off, not a colour). */
export function colorsInUse(effects: Iterable<LightingEffect>, limit = 12): LightingRgb8[] {
  const counts = new Map<string, { color: LightingRgb8; count: number }>();
  for (const effect of effects) {
    const color = effectRgb(effect);
    if (isBlack(color)) continue;
    const key = rgbToHex(color);
    const entry = counts.get(key) ?? { color, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((entry) => entry.color);
}

/** Cells of one layer with every use of `from` turned into `to`, keeping each effect. */
export function recolorCells(cells: readonly LightingOverlayCell[], from: LightingRgb8, to: LightingRgb8): LightingOverlayCell[] {
  const hex = rgbToHex(from);
  return cells
    .filter((cell) => rgbToHex(effectRgb(cell.effect)) === hex)
    .map((cell) => ({ ...cell, effect: buildEffect(effectKind(cell.effect), to, effectTiming(cell.effect)) }));
}

/** Whether a rule's colour is one you picked: connection lights show the status preset's own. */
export const pickedColor = (rule: Rules[number]) => !rule.connection;

/** Rules with every use of `from` you picked turned into `to`. */
export function recolorRules(rules: Rules, from: LightingRgb8, to: LightingRgb8): Rules {
  const hex = rgbToHex(from);
  return rules.map((rule) =>
    pickedColor(rule) && rgbToHex(effectRgb(rule.cell.effect)) === hex
      ? { ...rule, cell: { ...rule.cell, effect: buildEffect(effectKind(rule.cell.effect), to, effectTiming(rule.cell.effect)) } }
      : rule,
  );
}
