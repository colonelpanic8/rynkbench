import { describe, expect, it } from "vitest";
import { clampPan } from "./pan";

describe("clampPan", () => {
  const canvas = { w: 1000, h: 600 };
  it("keeps 80% of a board that fits on the canvas", () => {
    const board = { w: 800, h: 400 };
    // 1000/2 + 800/2 − 640 = 260 sideways; 300 + 200 − 320 = 180 up and down.
    expect(clampPan({ x: 5000, y: -5000 }, canvas, board)).toEqual({ x: 260, y: -180 });
    expect(clampPan({ x: 40, y: 10 }, canvas, board)).toEqual({ x: 40, y: 10 });
  });
  it("keeps 80% of the canvas covered when zoomed in past it", () => {
    const board = { w: 3000, h: 1800 };
    // 500 + 1500 − 800 = 1200.
    expect(clampPan({ x: -9999, y: 0 }, canvas, board).x).toBe(-1200);
  });
});
