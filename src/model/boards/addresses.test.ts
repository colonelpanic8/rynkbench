import { describe, expect, it } from "vitest";
import {
  GLOVE80_ADDRESSES,
  GLOVE80_COLS,
  GLOVE80_GRID,
} from "./glove80";
import { GO60_ADDRESSES } from "./go60";

function matrixKey(row: number, col: number): string {
  return `${row},${col}`;
}

function expectCompleteUniqueScheme(
  addresses: Record<string, string>,
  expectedPositions: readonly string[],
): void {
  expect(Object.keys(addresses).sort()).toEqual([...expectedPositions].sort());
  expect(new Set(Object.values(addresses)).size).toBe(expectedPositions.length);
  expect(Object.values(addresses).every((address) => /^(LH|RH)-(?:C\d+R\d+|T\d+)$/.test(address)))
    .toBe(true);
}

describe("Glove80 physical addresses", () => {
  const expectedPositions = GLOVE80_GRID.flatMap((logical, offset) =>
    logical === null
      ? []
      : [matrixKey(Math.floor(offset / GLOVE80_COLS), offset % GLOVE80_COLS)],
  );

  it("covers all 80 physical keys exactly once", () => {
    expect(expectedPositions).toHaveLength(80);
    expectCompleteUniqueScheme(GLOVE80_ADDRESSES, expectedPositions);
  });

  it("numbers finger columns from the thumbs and rows from the top", () => {
    expect(GLOVE80_ADDRESSES["2,5"]).toBe("LH-C1R3");
    expect(GLOVE80_ADDRESSES["2,0"]).toBe("LH-C6R3");
    expect(GLOVE80_ADDRESSES["2,8"]).toBe("RH-C1R3");
    expect(GLOVE80_ADDRESSES["0,12"]).toBe("RH-C5R1");
    expect(GLOVE80_ADDRESSES["0,13"]).toBe("RH-C6R1");
  });

  it("numbers the upper thumb fan before the lower fan, outer to inner", () => {
    expect([0, 1, 2, 3, 4, 5].map((row) => GLOVE80_ADDRESSES[`${row},6`])).toEqual([
      "LH-T1",
      "LH-T2",
      "LH-T3",
      "LH-T4",
      "LH-T5",
      "LH-T6",
    ]);
    expect(GLOVE80_ADDRESSES["0,7"]).toBe("RH-T1");
    expect(GLOVE80_ADDRESSES["5,7"]).toBe("RH-T6");
    expect(GLOVE80_ADDRESSES["0,5"]).toBeUndefined();
    expect(GLOVE80_ADDRESSES["5,8"]).toBeUndefined();
  });
});

describe("Go60 physical addresses", () => {
  const expectedPositions = [
    ...Array.from({ length: 4 }, (_, row) =>
      [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13].map((col) => matrixKey(row, col)),
    ).flat(),
    ...[2, 3, 4, 9, 10, 11].map((col) => matrixKey(4, col)),
    ...Array.from({ length: 3 }, (_, row) =>
      [matrixKey(row, 6), matrixKey(row, 7)],
    ).flat(),
  ];

  it("covers all 60 physical keys exactly once", () => {
    expect(expectedPositions).toHaveLength(60);
    expectCompleteUniqueScheme(GO60_ADDRESSES, expectedPositions);
  });

  it("uses the same hand-relative finger convention as the Glove80", () => {
    expect(GO60_ADDRESSES["2,5"]).toBe("LH-C1R3");
    expect(GO60_ADDRESSES["2,8"]).toBe("RH-C1R3");
    expect(GO60_ADDRESSES["0,13"]).toBe("RH-C6R1");
    expect(GO60_ADDRESSES["4,2"]).toBe("LH-C4R5");
    expect(GO60_ADDRESSES["4,11"]).toBe("RH-C4R5");
  });

  it("numbers each three-key thumb fan outer to inner", () => {
    expect([0, 1, 2].map((row) => GO60_ADDRESSES[`${row},6`])).toEqual([
      "LH-T1",
      "LH-T2",
      "LH-T3",
    ]);
    expect([0, 1, 2].map((row) => GO60_ADDRESSES[`${row},7`])).toEqual([
      "RH-T1",
      "RH-T2",
      "RH-T3",
    ]);
    expect(GO60_ADDRESSES["3,6"]).toBeUndefined();
    expect(GO60_ADDRESSES["4,8"]).toBeUndefined();
  });
});
