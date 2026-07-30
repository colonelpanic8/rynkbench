// LightingEffect shape helpers. The wire type is a tagged union whose timing
// fields differ per variant; editors want a flat view they can round-trip, so
// this module reads an effect apart and puts one back together without losing
// the fields the current variant does not carry.

import type { LightingEffect, LightingRgb8 } from "../../vendor/rynk-wasm/rynk_wasm";

export type EffectKind = "Solid" | "Blink" | "Breathe";

/** Timing shared by the animated variants, flattened. Values for fields the
 *  current variant does not carry are the defaults a fresh one would use, so
 *  switching kinds in an editor never produces a nonsense period. */
export interface EffectTiming {
  periodMs: number;
  phaseMs: number;
  /** Blink only: on-fraction out of 255. */
  duty: number;
  /** Breathe only: ramp step interval. */
  stepMs: number;
}

export const DEFAULT_TIMING: EffectTiming = {
  periodMs: 1000,
  phaseMs: 0,
  duty: 128,
  stepMs: 16,
};

export function effectKind(effect: LightingEffect): EffectKind {
  if ("Solid" in effect) return "Solid";
  if ("Blink" in effect) return "Blink";
  return "Breathe";
}

export function effectRgb(effect: LightingEffect): LightingRgb8 {
  if ("Solid" in effect) return effect.Solid.color;
  if ("Blink" in effect) return effect.Blink.color;
  return effect.Breathe.color;
}

export function effectTiming(effect: LightingEffect): EffectTiming {
  if ("Blink" in effect) {
    return {
      periodMs: effect.Blink.period_ms,
      phaseMs: effect.Blink.phase_ms,
      duty: effect.Blink.duty,
      stepMs: DEFAULT_TIMING.stepMs,
    };
  }
  if ("Breathe" in effect) {
    return {
      periodMs: effect.Breathe.period_ms,
      phaseMs: effect.Breathe.phase_ms,
      duty: DEFAULT_TIMING.duty,
      stepMs: effect.Breathe.step_ms,
    };
  }
  return { ...DEFAULT_TIMING };
}

export function buildEffect(
  kind: EffectKind,
  color: LightingRgb8,
  timing: EffectTiming,
): LightingEffect {
  switch (kind) {
    case "Solid":
      return { Solid: { color } };
    case "Blink":
      return {
        Blink: { color, period_ms: timing.periodMs, phase_ms: timing.phaseMs, duty: timing.duty },
      };
    case "Breathe":
      return {
        Breathe: {
          color,
          period_ms: timing.periodMs,
          phase_ms: timing.phaseMs,
          step_ms: timing.stepMs,
        },
      };
  }
}

/** One-line effect summary for a rule row. */
export function describeEffect(effect: LightingEffect): string {
  const kind = effectKind(effect);
  if (kind === "Solid") return "Solid";
  const { periodMs } = effectTiming(effect);
  return `${kind} ${periodMs}ms`;
}
