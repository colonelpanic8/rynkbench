// Live-view resolution: index-ordered binding fall-through and scene compositing.

import { describe, expect, it } from "vitest";
import type { KeyAction, LightingEffect, LightingSceneCell } from "../../vendor/rynk-wasm/rynk_wasm";
import { compositeScenes, effectiveAction } from "./compositor";

function solid(r: number): LightingEffect {
  return { Solid: { color: { r, g: 0, b: 0 } } };
}

function tap(code: string): KeyAction {
  return { Tap: { Key: code } } as unknown as KeyAction;
}

describe("effectiveAction", () => {
  // layers[layer][index]; index 0 across three layers.
  const layers: KeyAction[][] = [
    [tap("A")], // L0
    ["Transparent"], // L1
    ["Transparent"], // L2
  ];

  it("uses the effective layer's own binding when it is concrete", () => {
    const l = [[tap("A")], [tap("B")]];
    expect(effectiveAction(l, 1, 0, 0)).toEqual(tap("B"));
  });

  it("falls through Transparent downward toward the default floor", () => {
    // Effective L2 transparent → L1 transparent → floor L0 concrete.
    expect(effectiveAction(layers, 2, 0, 0)).toEqual(tap("A"));
  });

  it("stops at the default floor and never consults layers below it", () => {
    // Floor is L1 (Transparent). L0's A must not be reached.
    expect(effectiveAction(layers, 2, 1, 0)).toEqual("Transparent");
  });
});

describe("compositeScenes", () => {
  const scenes: LightingSceneCell[] = [
    { layer: 0, led_id: 1, effect: solid(10) }, // default/floor
    { layer: 2, led_id: 1, effect: solid(20) }, // effective
    { layer: 2, led_id: 3, effect: solid(30) },
  ];

  it("EffectiveOnly composites only the effective layer (+ overlay)", () => {
    const out = compositeScenes(scenes, {}, 2, 0, "EffectiveOnly");
    expect(out.get(1)).toEqual({ effect: solid(20), source: "effective" });
    expect(out.get(3)).toEqual({ effect: solid(30), source: "effective" });
    expect(out.size).toBe(2);
  });

  it("ActiveStack adds the default floor beneath the effective layer", () => {
    const out = compositeScenes(scenes, {}, 2, 0, "ActiveStack");
    // led 1 present on both layers → effective wins.
    expect(out.get(1)).toEqual({ effect: solid(20), source: "effective" });
    expect(out.get(3)).toEqual({ effect: solid(30), source: "effective" });
  });

  it("ActiveStack keeps a floor-only cell when the effective layer lacks it", () => {
    const floorOnly: LightingSceneCell[] = [{ layer: 0, led_id: 9, effect: solid(10) }];
    const out = compositeScenes(floorOnly, {}, 2, 0, "ActiveStack");
    expect(out.get(9)).toEqual({ effect: solid(10), source: "default" });
  });

  it("overlay sits on top of everything", () => {
    const out = compositeScenes(
      scenes,
      { 1: { led_id: 1, effect: solid(99), ttl_ms: undefined } },
      2,
      0,
      "ActiveStack",
    );
    expect(out.get(1)).toEqual({ effect: solid(99), source: "overlay" });
  });
});
