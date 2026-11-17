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
  /** Blink only: the share of each period it is lit, in percent. */
  duty: number;
  /** Breathe only: ramp step interval. */
  stepMs: number;
}

export const DEFAULT_TIMING: EffectTiming = {
  periodMs: 1000,
  phaseMs: 0,
  duty: 50,
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

/** A light set to black: the LED is off, so the key shows as itself. */
export function isDark(effect: LightingEffect): boolean {
  const { r, g, b } = effectRgb(effect);
  return r === 0 && g === 0 && b === 0;
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

export type TimingBounds = Record<keyof EffectTiming, { min: number; max: number }>;

const U32_MAX = 0xffff_ffff;
const U16_MAX = 0xffff;
/** The shortest period offered; the firmware itself takes anything above zero. */
const MIN_PERIOD_MS = 100;

/** A blink's duty from which the firmware lights it throughout. */
export const BLINK_DUTY_MAX = 100;

/** The duty a blink runs at on the keyboard, in percent: a stored 100 or more
 *  (as an older Rynkbench stored on a scale of 255) is lit throughout, 100. */
export function blinkDuty(duty: number): number {
  return Math.min(duty, BLINK_DUTY_MAX);
}

/** `value` with every blink in it at the duty it runs at, for a file, whose
 *  reader refuses a duty above 100. Parts without such a blink are kept as they are. */
export function withBlinkDuties<T>(value: T): T {
  if (Array.isArray(value)) {
    const items = value.map(withBlinkDuties);
    return (items.some((item, index) => item !== value[index]) ? items : value) as T;
  }
  if (value === null || typeof value !== "object") return value;
  const blink = (value as { Blink?: { duty?: unknown } }).Blink;
  if (blink && typeof blink.duty === "number") {
    return blink.duty > BLINK_DUTY_MAX ? ({ ...value, Blink: { ...blink, duty: blinkDuty(blink.duty) } } as T) : value;
  }
  let changed = false;
  const entries = Object.entries(value).map(([key, item]) => {
    const next = withBlinkDuties(item);
    changed ||= next !== item;
    return [key, next] as const;
  });
  return changed ? (Object.fromEntries(entries) as T) : value;
}

/** What each timing field may hold. The firmware refuses a blink lit for more
 *  than 100 percent and a breathe whose step is not shorter than its period. */
export function timingBounds(kind: EffectKind, timing: EffectTiming): TimingBounds {
  const breathe = kind === "Breathe";
  return {
    periodMs: { min: breathe ? Math.max(MIN_PERIOD_MS, timing.stepMs + 1) : MIN_PERIOD_MS, max: U32_MAX },
    phaseMs: { min: 0, max: U32_MAX },
    duty: { min: 0, max: BLINK_DUTY_MAX },
    stepMs: { min: 1, max: Math.max(1, Math.min(U16_MAX, timing.periodMs - 1)) },
  };
}

/** What was typed into a timing field, as the whole number within its bounds
 *  that it stands for; null when it is not a number. */
export function typedWithin(text: string, min = -Infinity, max = Infinity): number | null {
  const n = Number(text);
  if (text.trim() === "" || !Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** One-line effect summary for a rule row. */
export function describeEffect(effect: LightingEffect): string {
  const kind = effectKind(effect);
  if (kind === "Solid") return "Solid";
  const { periodMs } = effectTiming(effect);
  return `${kind} ${periodMs}ms`;
}
