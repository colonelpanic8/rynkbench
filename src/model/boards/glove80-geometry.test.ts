import { describe, expect, it } from "vitest";
import type { LayoutInfo } from "../../vendor/rynk-wasm/rynk_wasm";
import type { LightingTopology } from "../../session/types";
import { buildKeyboardModel } from "../keyboard";
import { GLOVE80_ADDRESSES, glove80Enrichment } from "./glove80";

const topology = { leds: [], zones: [], zoneMemberships: [], revision: 0 } as unknown as LightingTopology;

function layoutWith(keys: Array<{ row: number; col: number; w?: number }>): LayoutInfo {
  return {
    default_variant: 0,
    variants: [
      {
        name: "Glove80",
        keys: keys.map(({ row, col, w = 1 }) => ({ row, col, r: 0, rect: { x: 0, y: 0, w, h: 1 } })),
        encoders: [],
      },
    ],
  } as unknown as LayoutInfo;
}

describe("Glove80 geometry from GLIDE", () => {
  const geometry = glove80Enrichment.geometry!;

  it("places every Glove80 key", () => {
    expect(Object.keys(geometry).sort()).toEqual(Object.keys(GLOVE80_ADDRESSES).sort());
  });

  it("draws the thumb fans turned inward, mirrored left and right", () => {
    const at = (address: string) =>
      geometry[Object.entries(GLOVE80_ADDRESSES).find(([, name]) => name === address)![0]];
    expect(at("LH-T1").r).toBe(20);
    expect(at("RH-T1").r).toBe(-20);
    expect(at("LH-T1").y).toBeCloseTo(at("RH-T1").y, 6);
    expect(at("LH-C6R1").r).toBe(0);
  });

  it("is used in place of the firmware's positions for 1u keys only", () => {
    const [position] = Object.keys(geometry);
    const [row, col] = position.split(",").map(Number);
    const model = buildKeyboardModel(layoutWith([{ row, col }, { row: 9, col: 9 }, { row, col, w: 2 }]), topology, {
      enrichment: glove80Enrichment,
    });
    expect(model.keys[0].shape.rect.x).toBe(geometry[position].x);
    expect(model.keys[0].shape.r).toBe(geometry[position].r);
    expect(model.keys[1].shape.rect.x).toBe(0);
    expect(model.keys[2].shape.rect.x).toBe(0);
  });
});
