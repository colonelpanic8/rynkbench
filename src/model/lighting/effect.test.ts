import { describe, expect, it } from "vitest";
import { DEFAULT_TIMING, buildEffect, effectKind, effectRgb, effectTiming, timingBounds, typedWithin } from "./effect";
import type { EffectKind } from "./effect";

const color = { r: 10, g: 20, b: 30 };
const timing = { periodMs: 400, phaseMs: 75, duty: 30, stepMs: 8 };
const kinds: EffectKind[] = ["Solid", "Blink", "Breathe"];

describe("effect shape round-trips", () => {
  it("reads back the fields each variant carries", () => {
    for (const kind of kinds) {
      const effect = buildEffect(kind, color, timing);
      expect(effectKind(effect)).toBe(kind);
      expect(effectRgb(effect)).toEqual(color);
    }
    expect(effectTiming(buildEffect("Blink", color, timing))).toEqual({
      ...timing,
      stepMs: DEFAULT_TIMING.stepMs,
    });
    expect(effectTiming(buildEffect("Breathe", color, timing))).toEqual({
      ...timing,
      duty: DEFAULT_TIMING.duty,
    });
  });

  // Switching kinds in an editor must not invent a nonsense period from the
  // variant that could not store one.
  it("gives a solid effect the default timing rather than zeros", () => {
    expect(effectTiming(buildEffect("Solid", color, timing))).toEqual(DEFAULT_TIMING);
  });
});

describe("timing the firmware takes", () => {
  it("keeps a blink's duty to a percentage and a breathe's step under its period", () => {
    expect(timingBounds("Blink", timing).duty).toEqual({ min: 0, max: 100 });
    expect(timingBounds("Breathe", timing).stepMs).toEqual({ min: 1, max: 399 });
    // A long step holds the period above it; a blink has no step to mind.
    const longStep = { ...timing, periodMs: 2000, stepMs: 500 };
    expect(timingBounds("Breathe", longStep).periodMs.min).toBe(501);
    expect(timingBounds("Blink", longStep).periodMs.min).toBe(100);
    expect(DEFAULT_TIMING.duty).toBeLessThanOrEqual(timingBounds("Blink", DEFAULT_TIMING).duty.max);
  });

  it("reads a typed value as the whole number within the bounds, and nothing from what is not a number", () => {
    expect(typedWithin("750", 100, 5000)).toBe(750);
    expect(typedWithin("7", 100, 5000)).toBe(100);
    expect(typedWithin("120", 0, 100)).toBe(100);
    expect(typedWithin("12.6", 0, 100)).toBe(13);
    expect(typedWithin("", 100, 5000)).toBeNull();
    expect(typedWithin("-", 100, 5000)).toBeNull();
  });
});
