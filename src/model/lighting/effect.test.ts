import { describe, expect, it } from "vitest";
import { DEFAULT_TIMING, buildEffect, effectKind, effectRgb, effectTiming } from "./effect";
import type { EffectKind } from "./effect";

const color = { r: 10, g: 20, b: 30 };
const timing = { periodMs: 400, phaseMs: 75, duty: 200, stepMs: 8 };
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
