import { describe, expect, it } from "vitest";
import { layersInMask, maskHasLayer, setLayerInMask } from "./wakeLayers";

describe("wake-layer masks", () => {
  it("adds and removes one Magic layer without disturbing the others", () => {
    const initial = 2 ** 1 + 2 ** 4;
    const withMagic = setLayerInMask(initial, 2, true);

    expect(layersInMask(withMagic, 6)).toEqual([1, 2, 4]);
    expect(setLayerInMask(withMagic, 2, false)).toBe(initial);
  });

  it("keeps repeated designation idempotent", () => {
    expect(setLayerInMask(2 ** 2, 2, true)).toBe(2 ** 2);
    expect(setLayerInMask(0, 2, false)).toBe(0);
  });

  it("supports masks above the 32-bit bitwise range", () => {
    const mask = setLayerInMask(0, 40, true);
    expect(maskHasLayer(mask, 40)).toBe(true);
  });
});
