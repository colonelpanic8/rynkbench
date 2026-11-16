import { describe, expect, it } from "vitest";
import type {
  LightingEffect,
  LightingOverlayCell,
  LightingSceneCell,
} from "../../vendor/rynk-wasm/rynk_wasm";
import { BLACK_EFFECT, previewActiveLayers, sceneTableWithLayer, targetPreviewEffects } from "./preview";

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

  // A key whose only cell is compiled is still lit, so the editor must offer
  // to mask it; reading the runtime draft alone would call it unlit.
  it("shows a compiled-only LED with no runtime draft at all", () => {
    expect(targetPreviewEffects(1, {}, compiled).get(1)).toEqual(solid(10));
  });

  it("lets a black runtime cell mask the compiled default", () => {
    const masked = { 1: { led_id: 1, effect: BLACK_EFFECT, ttl_ms: undefined } };
    expect(targetPreviewEffects(1, masked, compiled).get(1)).toEqual(BLACK_EFFECT);
  });
});

describe("scene table writes", () => {
  it("replaces one layer and passes every other layer through untouched", () => {
    const scenes: LightingSceneCell[] = [
      { layer: 0, led_id: 5, effect: solid(1) },
      { layer: 1, led_id: 1, effect: solid(2) },
      { layer: 2, led_id: 9, effect: solid(3) },
    ];
    expect(sceneTableWithLayer(scenes, 1, draft)).toEqual([
      { layer: 0, led_id: 5, effect: solid(1) },
      { layer: 2, led_id: 9, effect: solid(3) },
      { layer: 1, led_id: 2, effect: solid(20) },
    ]);
  });

  it("drops a layer's cells when its draft is empty", () => {
    const scenes: LightingSceneCell[] = [{ layer: 1, led_id: 1, effect: solid(2) }];
    expect(sceneTableWithLayer(scenes, 1, {})).toEqual([]);
  });
});

describe("preview active layers", () => {
  it("uses the live stack for the overlay and the edited layer otherwise", () => {
    expect([...previewActiveLayers("overlay", [0, 3], 0)]).toEqual([0, 3]);
    expect([...previewActiveLayers(2, [0, 3], 0)]).toEqual([0, 2]);
  });
});
