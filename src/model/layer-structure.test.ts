import { describe, expect, it } from "vitest";
import { layerStructure, type LayerSlot } from "./layer-structure";

const slots = (...list: Array<string | null>): LayerSlot[] => list.map((name) => ({ occupied: name !== null, name: name ?? "" }));

describe("layer structure", () => {
  it("sees a deleted layer, and the layers above it moving down", () => {
    expect(layerStructure(slots("Base", "Lower", "Games", "Magic", null), slots("Base", "Games", "Magic", null, null))).toEqual({
      deleted: ["Lower"],
      added: [],
      moved: 2,
      renamed: [],
      slots: [1, 2, 3],
    });
  });

  it("sees a moved layer", () => {
    const change = layerStructure(slots("Base", "Lower", "Magic"), slots("Base", "Magic", "Lower"));
    expect(change).toMatchObject({ deleted: [], added: [], moved: 2, slots: [1, 2] });
  });

  it("sees a copy in a free slot, and moves nothing", () => {
    expect(layerStructure(slots("Base", "Lower", null), slots("Base", "Lower", "Lower copy"))).toMatchObject({ added: ["Lower copy"], moved: 0, slots: [2] });
  });

  it("leaves a rename alone: no key changes with it", () => {
    expect(layerStructure(slots("Base", "Lower"), slots("Base", "Nav"))).toBeNull();
    expect(layerStructure(slots("Base", "Lower"), slots("Base", "Lower"))).toBeNull();
  });
});
