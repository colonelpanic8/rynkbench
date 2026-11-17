import { describe, expect, it } from "vitest";
import { DEFAULT_TIMING } from "./effect";
import type { KeyLight } from "./key-light";
import { tryOutLightOf, tryOutPlan } from "./try-out";

const red: KeyLight = { kind: "color", color: { r: 255, g: 0, b: 0 }, effect: "Solid", timing: DEFAULT_TIMING };

describe("try-out lights", () => {
  it("give a colour with the lifetime, or none without one", () => {
    expect(tryOutPlan(red, [3, 4], 2500)?.cells.map((cell) => [cell.led_id, cell.ttl_ms])).toEqual([[3, 2500], [4, 2500]]);
    expect(tryOutPlan(red, [3], null)?.cells[0].ttl_ms).toBeUndefined();
  });

  it("take a key's light away with Off, and refuse the stored-only choices", () => {
    expect(tryOutPlan({ kind: "off" }, [3], 2500)).toEqual({ cells: [], erase: [3] });
    expect(tryOutPlan({ kind: "below" }, [3], null)).toBeNull();
    expect(tryOutPlan({ kind: "usb" }, [3], null)).toBeNull();
  });

  it("read a key without one as Off, and one with one as its colour", () => {
    expect(tryOutLightOf(undefined)).toEqual({ kind: "off" });
    expect(tryOutLightOf(tryOutPlan(red, [3], 2500)!.cells[0])).toEqual(red);
  });
});
