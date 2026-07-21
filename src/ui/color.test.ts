import { describe, expect, it } from "vitest";
import { emissiveRgb } from "./color";

describe("emissiveRgb", () => {
  it("leaves off and already-visible colors unchanged", () => {
    expect(emissiveRgb({ r: 0, g: 0, b: 0 })).toEqual({ r: 0, g: 0, b: 0 });
    expect(emissiveRgb({ r: 0, g: 0, b: 255 })).toEqual({ r: 0, g: 0, b: 255 });
  });

  it("makes dim firmware colors visible without changing their hue ratio", () => {
    expect(emissiveRgb({ r: 32, g: 32, b: 32 })).toEqual({ r: 96, g: 96, b: 96 });
    expect(emissiveRgb({ r: 8, g: 16, b: 32 })).toEqual({ r: 24, g: 48, b: 96 });
  });
});
