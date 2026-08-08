import { describe, expect, it } from "vitest";
import { profilePositionCount, replaceProfilePositions } from "./profiles";

describe("profile related-key selection", () => {
  const positions = [
    { profile: 0, row: 1, col: 1 },
    { profile: 3, row: 2, col: 2 },
    { profile: 3, row: 2, col: 3 },
  ];

  it("counts only the selected stable profile slot", () => {
    expect(profilePositionCount(positions, 0)).toBe(1);
    expect(profilePositionCount(positions, 3)).toBe(2);
    expect(profilePositionCount(positions, 7)).toBe(0);
  });

  it("replaces one profile without changing another profile's keys", () => {
    expect(replaceProfilePositions(positions, 3, [{ row: 4, col: 5 }])).toEqual([
      { profile: 0, row: 1, col: 1 },
      { profile: 3, row: 4, col: 5 },
    ]);
  });
});
