import { describe, expect, it } from "vitest";
import type {
  LightingEffect,
  LightingOverlayCell,
  LightingSceneCell,
} from "../../vendor/rynk-wasm/rynk_wasm";
import { targetPreviewEffects } from "./preview";

const solid = (r: number): LightingEffect => ({ Solid: { color: { r, g: 0, b: 0 } } });

const draft: Record<number, LightingOverlayCell> = {
  2: { led_id: 2, effect: solid(20), ttl_ms: undefined },
};

const compiled: LightingSceneCell[] = [
  { layer: 1, led_id: 1, effect: solid(10) },
  { layer: 1, led_id: 2, effect: solid(11) },
];

describe("lighting target preview", () => {
  it("shows only overlay draft cells for the overlay target", () => {
    expect([...targetPreviewEffects("overlay", draft, compiled)]).toEqual([[2, solid(20)]]);
  });

  it("shows compiled defaults beneath a numeric layer draft", () => {
    expect([...targetPreviewEffects(1, draft, compiled)]).toEqual([
      [1, solid(10)],
      [2, solid(20)],
    ]);
  });
});
