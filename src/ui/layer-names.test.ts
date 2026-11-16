import { describe, expect, it } from "vitest";
import type { LayerMetadata } from "../session/types";
import { layerName, layerNamesOf } from "./layer-names";

const metadata: LayerMetadata[] = [
  { name: "Base", occupied: true },
  { name: "", occupied: true },
  { name: "  ", occupied: true },
];

describe("layer names", () => {
  it("fall back to the physical number for an empty or blank stored name", () => {
    expect(layerName(metadata, 0)).toBe("Base");
    expect(layerName(metadata, 1)).toBe("Layer 1");
    expect(layerName(metadata, 2)).toBe("Layer 2");
  });

  it("fall back for layers the device did not describe", () => {
    expect(layerName(metadata, 7)).toBe("Layer 7");
    expect(layerName(null, 2)).toBe("Layer 2");
  });

  it("give the label functions the names, unnamed layers left out", () => {
    expect(layerNamesOf(metadata)).toEqual(["Base", undefined, undefined]);
    expect(layerNamesOf(null)).toEqual([]);
  });
});
