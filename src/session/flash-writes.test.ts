import { describe, expect, it } from "vitest";
import { keymapSegments } from "./flash-writes";

describe("keymapSegments", () => {
  it("counts a row no wider than a segment as one item, whole or in part", () => {
    expect(keymapSegments(0, 14, 14)).toBe(1);
    expect(keymapSegments(17, 1, 14)).toBe(1);
    expect(keymapSegments(28, 3 * 14, 14)).toBe(3);
  });

  it("counts each segment of a wider row, and both rows of a write that crosses rows", () => {
    expect(keymapSegments(0, 18, 18)).toBe(2);
    expect(keymapSegments(14, 4, 18)).toBe(2);
    expect(keymapSegments(12, 4, 14)).toBe(2);
  });
});
