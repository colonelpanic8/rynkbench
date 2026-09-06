// Static Go60 knowledge: the 5x14 matrix its firmware walks, the per-key
// legends, and the LED-chain index behind each key — the Go60's counterpart to
// the Glove80 table next door.

import type { BoardEnrichment } from "../keyboard";
import { buildMoergoAddresses, type MatrixPosition } from "./moergo";

export const GO60_ROWS = 5;
export const GO60_COLS = 14;

/** One key: where the matrix has it, what it says, and its LED-chain index. */
export interface Go60Key extends MatrixPosition {
  label: string;
  led: number;
}

const FINGER_LABELS = [
  ["=", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "−"],
  ["Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "\\"],
  ["Ctrl", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'"],
  ["Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "Shift"],
] as const;

// The chain enters each finger column at its top key and runs down it, so a
// column's LED ids are consecutive from these starts.
const LEFT_LED_BY_COLUMN = [26, 22, 17, 12, 7, 3];
const RIGHT_LED_BY_COLUMN = [33, 37, 42, 47, 52, 56];

// Four complete six-column finger rows per half, then the three middle columns
// on the bottom row. The three-key thumb fans occupy matrix columns 6 and 7.
// This mirrors the physical walk in go60-firmware.toml.
function buildKeys(): Go60Key[] {
  const keys: Go60Key[] = [];
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      keys.push({ row, col, label: FINGER_LABELS[row][col], led: LEFT_LED_BY_COLUMN[col] + row });
    }
    for (let col = 8; col < 14; col += 1) {
      keys.push({
        row,
        col,
        label: FINGER_LABELS[row][col - 2],
        led: RIGHT_LED_BY_COLUMN[col - 8] + row,
      });
    }
  }
  for (const [col, label, led] of [
    [2, "lower-left outer", 21],
    [3, "lower-left middle", 16],
    [4, "lower-left inner", 11],
    [9, "lower-right inner", 41],
    [10, "lower-right middle", 46],
    [11, "lower-right outer", 51],
  ] as const) {
    keys.push({ row: 4, col, label, led });
  }
  for (let row = 0; row < 3; row += 1) {
    keys.push({ row, col: 6, label: `left thumb ${row + 1}`, led: row });
    keys.push({ row, col: 7, label: `right thumb ${3 - row}`, led: 30 + row });
  }
  return keys;
}

export const GO60_KEYS: readonly Go60Key[] = buildKeys();

export const GO60_MATRIX_POSITIONS: readonly MatrixPosition[] = GO60_KEYS.map(
  ({ row, col }) => ({ row, col }),
);

export const GO60_ADDRESSES = buildMoergoAddresses(GO60_MATRIX_POSITIONS);

export const GO60_LABELS: Record<string, string> = Object.fromEntries(
  GO60_KEYS.map((key) => [`${key.row},${key.col}`, key.label]),
);

// Go60's 40 mm pads sit in the open inner corner of each half, directly above
// the curved thumb fan. Device ids match the firmware's left/right assignment.
export const GO60_POINTING_DEVICES = [
  { id: 0, label: "Left trackpad", x: 7.2, y: 3.5, radius: 1.05 },
  { id: 1, label: "Right trackpad", x: 9.8, y: 3.5, radius: 1.05 },
] as const;

export const go60Enrichment: BoardEnrichment = {
  displayName: "Go60",
  labels: GO60_LABELS,
  addresses: GO60_ADDRESSES,
  pointingDevices: [...GO60_POINTING_DEVICES],
};
