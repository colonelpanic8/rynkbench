// Static Glove80 knowledge: per-key legend text and the 6x14 keymap-grid →
// board-key assignment, ported from ui/src/lib/glove80-layout.ts (the
// firmware's Vial grid; positions 5, 8, 75, 78 are matrix holes).

import type { BoardEnrichment } from "../keyboard";

export const GLOVE80_ROWS = 6;
export const GLOVE80_COLS = 14;

const LABELS = [
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10",
  "=", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "−",
  "Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "\\",
  "Ctrl", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'",
  "Shift", "Z", "X", "C", "V", "B", "Esc", "Del", "Magic", "⌘", "L4", "⌫",
  "N", "M", ",", ".", "/", "Shift", "`", "Home", "End", "←", "→", "⌫",
  "⌘", "Alt", "⌘", "Enter", "Space", "↑", "↓", "[", "]", "L3",
] as const;

/** Grid position (row-major, 84 entries) → logical key index, null = hole. */
export const GLOVE80_GRID: readonly (number | null)[] = [
  // r0: F-row + thumb tops (Esc / ⌫)
  0, 1, 2, 3, 4, null, 52, 57, null, 5, 6, 7, 8, 9,
  // r1: number row + thumbs (Del / L4)
  10, 11, 12, 13, 14, 15, 53, 56, 16, 17, 18, 19, 20, 21,
  // r2: top letter row + thumbs (Magic / ⌘)
  22, 23, 24, 25, 26, 27, 54, 55, 28, 29, 30, 31, 32, 33,
  // r3: home row + lower thumbs
  34, 35, 36, 37, 38, 39, 69, 74, 40, 41, 42, 43, 44, 45,
  // r4: bottom letter row + lower thumbs
  46, 47, 48, 49, 50, 51, 70, 73, 58, 59, 60, 61, 62, 63,
  // r5: outer bottom row + lower thumbs
  64, 65, 66, 67, 68, null, 71, 72, null, 75, 76, 77, 78, 79,
];

function buildLabels(): Record<string, string> {
  const labels: Record<string, string> = {};
  GLOVE80_GRID.forEach((logical, grid) => {
    if (logical === null) return;
    labels[`${Math.floor(grid / GLOVE80_COLS)},${grid % GLOVE80_COLS}`] = LABELS[logical];
  });
  return labels;
}

// --- physical geometry -----------------------------------------------------
//
// Traced from the official MoErgo Layout Editor (my.glove80.com): main-grid
// columns span cells 0-5 (left) and 12-17 (right); the two outermost columns
// of each half sit 0.5u lower than the finger columns; the thumb clusters are
// 2x3 fans angled inward. Shipping firmware still reports the flat schematic
// grid from keyboard.toml, so this doubles as the enrichment geometry
// override until the firmware carries the real shape itself.

/** Per-logical-key placement plus its LED-chain index and thumb membership. */
export interface Glove80Key {
  /** Visual key center, in key-units (1u pitch). */
  x: number;
  y: number;
  /** Clockwise rotation in degrees, about the key's own center. */
  rot: number;
  led: number;
  thumb: boolean;
}

// LED-chain indices per visual row, left half; the right half mirrors them
// at +40. Thumb clusters own chain positions 0–5 (left) and 40–45 (right).
const MAIN_LED_ROWS_LEFT = [
  [34, 28, 22, 16, 10],
  [35, 29, 23, 17, 11, 6],
  [36, 30, 24, 18, 12, 7],
  [37, 31, 25, 19, 13, 8],
  [38, 32, 26, 20, 14, 9],
  [39, 33, 27, 21, 15],
] as const;

const LOGICAL_ROWS = [
  { left: [0, 1, 2, 3, 4], right: [5, 6, 7, 8, 9] },
  { left: [10, 11, 12, 13, 14, 15], right: [16, 17, 18, 19, 20, 21] },
  { left: [22, 23, 24, 25, 26, 27], right: [28, 29, 30, 31, 32, 33] },
  { left: [34, 35, 36, 37, 38, 39], right: [40, 41, 42, 43, 44, 45] },
  { left: [46, 47, 48, 49, 50, 51], right: [58, 59, 60, 61, 62, 63] },
  { left: [64, 65, 66, 67, 68], right: [75, 76, 77, 78, 79] },
] as const;

const MIRROR_WIDTH = 17; // x' = MIRROR_WIDTH - x reflects left half onto right
const STAGGERED_LEFT_CELLS = new Set([0, 1]);

// Left thumb fan: visual center (x, y) and clockwise degrees, outer-to-inner,
// top row then bottom row. The right fan is its exact mirror image.
const THUMB_FAN: Array<[number, number, number]> = [
  [6.07, 4.95, 20],
  [7.0, 5.37, 30],
  [7.85, 6.01, 45],
  [5.12, 5.84, 15],
  [6.12, 6.25, 25],
  [7.07, 6.93, 45],
];

function buildBoardKeys(): Map<number, Glove80Key> {
  const keys = new Map<number, Glove80Key>();
  MAIN_LED_ROWS_LEFT.forEach((leftLeds, row) => {
    const rightLeds = [...leftLeds].reverse().map((index) => index + 40);
    const { left, right } = LOGICAL_ROWS[row];
    // 5-key rows lack the innermost finger column, so the right half's cells
    // shift by one to stay flush against the board's outer edge.
    const rightStart = 12 + (6 - leftLeds.length);
    leftLeds.forEach((led, column) => {
      const y = row + (STAGGERED_LEFT_CELLS.has(column) ? 0.5 : 0);
      keys.set(left[column], { x: column, y, rot: 0, led, thumb: false });
    });
    rightLeds.forEach((led, column) => {
      const x = rightStart + column;
      const y = row + (STAGGERED_LEFT_CELLS.has(MIRROR_WIDTH - x) ? 0.5 : 0);
      keys.set(right[column], { x, y, rot: 0, led, thumb: false });
    });
  });
  const leftThumbLogical = [52, 53, 54, 69, 70, 71];
  const rightThumbLogical = [55, 56, 57, 72, 73, 74];
  const leftThumbLeds = [0, 1, 2, 3, 4, 5];
  const rightThumbLeds = [42, 41, 40, 45, 44, 43];
  for (let index = 0; index < 6; index++) {
    const [x, y, rot] = THUMB_FAN[index];
    keys.set(leftThumbLogical[index], { x, y, rot, led: leftThumbLeds[index], thumb: true });
    // Right thumb logicals run inner-to-outer, so mirror the reversed fan row.
    const row = Math.floor(index / 3);
    const [mx, my, mrot] = THUMB_FAN[row * 3 + (2 - (index % 3))];
    keys.set(rightThumbLogical[index], {
      x: MIRROR_WIDTH - mx,
      y: my,
      rot: -mrot,
      led: rightThumbLeds[index],
      thumb: true,
    });
  }
  return keys;
}

/** Logical key index → real placement + LED chain, shared by the mock device
 *  and the enrichment geometry override. */
export const GLOVE80_BOARD_KEYS: Map<number, Glove80Key> = buildBoardKeys();

function buildGeometry(): Record<string, { x: number; y: number; r: number }> {
  const geometry: Record<string, { x: number; y: number; r: number }> = {};
  GLOVE80_GRID.forEach((logical, grid) => {
    if (logical === null) return;
    const key = GLOVE80_BOARD_KEYS.get(logical);
    if (!key) return;
    const at = `${Math.floor(grid / GLOVE80_COLS)},${grid % GLOVE80_COLS}`;
    geometry[at] = { x: key.x, y: key.y, r: key.rot };
  });
  return geometry;
}

export const glove80Enrichment: BoardEnrichment = {
  displayName: "Glove80",
  labels: buildLabels(),
  geometry: buildGeometry(),
};
