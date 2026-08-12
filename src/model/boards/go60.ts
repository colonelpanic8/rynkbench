import type { BoardEnrichment } from "../keyboard";
import { buildMoergoAddresses, type MatrixPosition } from "./moergo";

export const GO60_ROWS = 5;
export const GO60_COLS = 14;

// Four complete six-column finger rows per half, then the three middle
// columns on the bottom row. The three-key thumb fans occupy matrix columns 6
// and 7. This mirrors the physical walk in go60-firmware.toml.
export const GO60_MATRIX_POSITIONS: readonly MatrixPosition[] = [
  ...Array.from({ length: 4 }, (_, row) =>
    [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13].map((col) => ({ row, col })),
  ).flat(),
  ...[2, 3, 4, 9, 10, 11].map((col) => ({ row: 4, col })),
  ...Array.from({ length: 3 }, (_, row) => [6, 7].map((col) => ({ row, col }))).flat(),
];

export const GO60_ADDRESSES = buildMoergoAddresses(GO60_MATRIX_POSITIONS);

export const go60Enrichment: BoardEnrichment = {
  displayName: "Go60",
  addresses: GO60_ADDRESSES,
};
