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

export const glove80Enrichment: BoardEnrichment = {
  displayName: "Glove80",
  labels: buildLabels(),
};
