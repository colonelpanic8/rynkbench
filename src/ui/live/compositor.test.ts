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
    expect(effectiveAction(l, [0, 1], 0, 0)).toEqual(tap("B"));
  });

  it("falls through Transparent downward toward the default floor", () => {
    // Effective L2 transparent → L1 transparent → floor L0 concrete.
    expect(effectiveAction(layers, [0, 2], 0, 0)).toEqual(tap("A"));
  });

  it("consults an active intermediate layer", () => {
    const l: KeyAction[][] = [[tap("A")], [tap("B")], ["Transparent"]];
    expect(effectiveAction(l, [0, 1, 2], 0, 0)).toEqual(tap("B"));
  });

  it("consults an explicitly active layer below the default", () => {
    expect(effectiveAction(layers, [0, 1, 2], 1, 0)).toEqual(tap("A"));
  });
});

describe("compositeScenes", () => {
  const scenes: LightingSceneCell[] = [
    { layer: 0, led_id: 1, effect: solid(10) }, // default/floor
    { layer: 2, led_id: 1, effect: solid(20) }, // effective
    { layer: 2, led_id: 3, effect: solid(30) },
  ];

  it("EffectiveOnly composites only the effective layer (+ overlay)", () => {
    const out = compositeScenes([], scenes, {}, [0, 2], 0, null, "EffectiveOnly");
    expect(out.get(1)).toEqual({ effect: solid(20), source: "runtime-effective" });
    expect(out.get(3)).toEqual({ effect: solid(30), source: "runtime-effective" });
    expect(out.size).toBe(2);
  });

  it("ActiveStack adds the default floor beneath the effective layer", () => {
    const out = compositeScenes([], scenes, {}, [0, 2], 0, null, "ActiveStack");
    // led 1 present on both layers → effective wins.
    expect(out.get(1)).toEqual({ effect: solid(20), source: "runtime-effective" });
    expect(out.get(3)).toEqual({ effect: solid(30), source: "runtime-effective" });
  });

  it("ActiveStack keeps a floor-only cell when the effective layer lacks it", () => {
    const floorOnly: LightingSceneCell[] = [{ layer: 0, led_id: 9, effect: solid(10) }];
    const out = compositeScenes([], floorOnly, {}, [0, 2], 0, null, "ActiveStack");
    expect(out.get(9)).toEqual({ effect: solid(10), source: "runtime-default" });
  });

  it("runtime cells override compiled defaults while policies stay independent", () => {
    const compiled: LightingSceneCell[] = [
      { layer: 0, led_id: 1, effect: solid(5) },
      { layer: 2, led_id: 2, effect: solid(6) },
    ];
    const runtime: LightingSceneCell[] = [{ layer: 2, led_id: 1, effect: solid(50) }];
    const out = compositeScenes(compiled, runtime, {}, [0, 2], 0, "ActiveStack", "EffectiveOnly");
    expect(out.get(1)).toEqual({ effect: solid(50), source: "runtime-effective" });
    expect(out.get(2)).toEqual({ effect: solid(6), source: "compiled-effective" });
  });

  it("overlay sits on top of everything", () => {
    const out = compositeScenes(
      [],
      scenes,
      { 1: { led_id: 1, effect: solid(99), ttl_ms: undefined } },
      [0, 2],
      0,
      null,
      "ActiveStack",
    );
    expect(out.get(1)).toEqual({ effect: solid(99), source: "overlay" });
  });

  it("ActiveStack composites every active layer in index order", () => {
    const all: LightingSceneCell[] = [
      { layer: 0, led_id: 1, effect: solid(10) },
      { layer: 1, led_id: 1, effect: solid(20) },
      { layer: 2, led_id: 2, effect: solid(30) },
    ];
    const out = compositeScenes([], all, {}, [0, 1, 2], 0, null, "ActiveStack");
    expect(out.get(1)).toEqual({ effect: solid(20), source: "runtime-active" });
    expect(out.get(2)).toEqual({ effect: solid(30), source: "runtime-effective" });
  });

  it("mirrors the reported blue -> red -> cyan active stack", () => {
    const blue: LightingEffect = { Solid: { color: { r: 0, g: 0, b: 255 } } };
    const red: LightingEffect = { Solid: { color: { r: 255, g: 0, b: 0 } } };
    const cyan: LightingEffect = { Solid: { color: { r: 0, g: 255, b: 255 } } };
    const compiled: LightingSceneCell[] = [
      { layer: 0, led_id: 1, effect: blue },
      { layer: 3, led_id: 1, effect: red },
      { layer: 4, led_id: 1, effect: cyan },
    ];

    const layer4 = compositeScenes(compiled, [], {}, [0, 3, 4], 0, "ActiveStack", null);
    expect(layer4.get(1)).toEqual({ effect: cyan, source: "compiled-effective" });

    const layer3 = compositeScenes(compiled, [], {}, [0, 3], 0, "ActiveStack", null);
    expect(layer3.get(1)).toEqual({ effect: red, source: "compiled-effective" });
  });

  it("applies a non-zero default before lower active lighting layers", () => {
    const all: LightingSceneCell[] = [
      { layer: 0, led_id: 1, effect: solid(10) },
      { layer: 1, led_id: 1, effect: solid(20) },
    ];
    const out = compositeScenes([], all, {}, [0, 1], 1, null, "ActiveStack");
    expect(out.get(1)).toEqual({ effect: solid(10), source: "runtime-active" });
  });
});
