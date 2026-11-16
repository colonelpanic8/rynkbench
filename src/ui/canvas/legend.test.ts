import { describe, expect, it } from "vitest";
import { legendLayout, legendLines } from "./legend";

/** GLIDE's px sizes at its 70 px key pitch. */
const px = (size: number) => size * 70;

describe("key legends", () => {
  it("sizes a symbol, a short word and longer text as GLIDE does", () => {
    const symbol = legendLayout("W", 1);
    const short = legendLayout("Home", 1);
    const text = legendLayout("Mouse Button", 1.5);
    expect([symbol.kind, short.kind, text.kind]).toEqual(["symbol", "short", "text"]);
    expect(px(symbol.size)).toBeCloseTo(15);
    expect(px(short.size)).toBeCloseTo(13);
    expect(px(text.size)).toBeCloseTo(11);
  });

  it("draws a shifted character on top, and the key's own a little smaller", () => {
    const two = legendLayout("2", 1, { top: "@" });
    expect(px(two.topSize)).toBeCloseTo(11.52);
    expect(px(two.size)).toBeCloseTo(13.44);
  });

  it("breaks longer text into two lines where the longer line is shortest", () => {
    expect(legendLines("Mouse Btn1")).toEqual(["Mouse", "Btn1"]);
    expect(legendLines("SymbolNav")).toEqual(["Symbol", "Nav"]);
    expect(legendLines("Layer_Lower")).toEqual(["Layer_", "Lower"]);
    expect(legendLines("Enter")).toEqual(["Enter"]);
  });

  it("shrinks a legend too wide for its cap, but keeps it readable", () => {
    const narrow = legendLayout("Backspace", 0.8);
    expect(px(narrow.size)).toBeLessThan(11);
    expect(px(narrow.size)).toBeGreaterThanOrEqual(8);
  });

  it("sizes the line below only when there is one", () => {
    expect(legendLayout("A", 1).subSize).toBe(0);
    expect(legendLayout("A", 1, { sub: "Shift" }).subSize).toBeGreaterThan(0);
  });
});
