// Try-out lights: a colour with its effect put on the keyboard's overlay,
// shown over the stored lights and never stored, with an optional lifetime
// after which the keyboard turns each off. Off takes a key's try-out light
// away; the layer below and status lights are stored choices only. Pure.

import type { LightingEffect, LightingOverlayCell } from "../lighting-types";
import { buildEffect } from "./effect";
import { keyLightOf, type KeyLight } from "./key-light";

/** The lifetime a try-out starts with, in ms, when one is turned on. */
export const TRY_OUT_LIFETIME_MS = 5000;

/** What giving keys `light` as a try-out changes; null when it cannot be tried out. */
export function tryOutPlan(
  light: KeyLight,
  leds: readonly number[],
  lifetimeMs: number | null,
): { cells: LightingOverlayCell[]; erase: number[] } | null {
  if (light.kind === "off") return { cells: [], erase: [...leds] };
  if (light.kind !== "color") return null;
  const effect = buildEffect(light.effect, light.color, light.timing);
  return { cells: leds.map((led_id) => ({ led_id, effect, ttl_ms: lifetimeMs ?? undefined })), erase: [] };
}

/** A key's try-out light: its colour, or Off without one. */
export const tryOutLightOf = (cell: LightingOverlayCell | undefined): KeyLight =>
  cell ? keyLightOf(cell.effect) : { kind: "off" };

/** Stored effects with the try-out lights over them. */
export function withTryOut(
  stored: ReadonlyMap<number, LightingEffect>,
  tryOut: Record<number, LightingOverlayCell>,
): Map<number, LightingEffect> {
  const shown = new Map(stored);
  for (const cell of Object.values(tryOut)) shown.set(cell.led_id, cell.effect);
  return shown;
}

/** The try-out lights as stored cells for a layer: each key its own effect, no lifetime. */
export const keptCells = (tryOut: Record<number, LightingOverlayCell>) =>
  Object.values(tryOut).map((cell) => ({ led: cell.led_id, effect: cell.effect }));
