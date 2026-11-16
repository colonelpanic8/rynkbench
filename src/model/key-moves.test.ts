import { describe, expect, it } from "vitest";
import type { KeyAction } from "../vendor/rynk-wasm/rynk_wasm";
import { planKeyDrop, type KeyPlace } from "./key-moves";

const W = { Single: { Key: { Hid: "W" } } } as unknown as KeyAction;
const E = { Single: { Key: { Hid: "E" } } } as unknown as KeyAction;
const keys = new Map<string, KeyAction>([["0:0", W], ["0:1", E], ["0:2", "No"]]);
const at = (place: KeyPlace) => keys.get(`${place.row}:${place.col}`) ?? "No";
const a = { row: 0, col: 0 };
const b = { row: 0, col: 1 };
const empty = { row: 0, col: 2 };

describe("dropping a key on another", () => {
  it("swaps the two, writing the destination first", () => {
    expect(planKeyDrop(at, a, b, false)).toEqual([
      { place: b, action: W },
      { place: a, action: E },
    ]);
  });

  it("copies it with a modifier held, leaving the source as it is", () => {
    expect(planKeyDrop(at, a, b, true)).toEqual([{ place: b, action: W }]);
  });

  it("swaps with an empty key, so the source is left empty", () => {
    expect(planKeyDrop(at, a, empty, false)).toEqual([
      { place: empty, action: W },
      { place: a, action: "No" },
    ]);
  });

  it("writes nothing for a drop on itself or on a key doing the same", () => {
    expect(planKeyDrop(at, a, a, false)).toEqual([]);
    expect(planKeyDrop(() => W, a, b, false)).toEqual([]);
  });
});
