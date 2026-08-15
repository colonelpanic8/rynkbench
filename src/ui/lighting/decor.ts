// How a LightingEffect renders on a key cap. Shared so every mode that
// previews lighting draws the same swatch and animation for the same effect.

import type { LightingEffect } from "../../vendor/rynk-wasm/rynk_wasm";
import type { KeyDecor } from "../KeyboardCanvas";
import { cssEmissiveRgb } from "../color";
import { effectRgb } from "./effect";

export function effectColor(effect: LightingEffect): string {
  return cssEmissiveRgb(effectRgb(effect));
}

export function effectAnim(effect: LightingEffect): KeyDecor["fillAnim"] {
  if ("Blink" in effect)
    return { name: "led-blink", periodMs: effect.Blink.period_ms, delayMs: effect.Blink.phase_ms };
  if ("Breathe" in effect)
    return {
      name: "led-breathe",
      periodMs: effect.Breathe.period_ms,
      delayMs: effect.Breathe.phase_ms,
    };
  return undefined;
}
