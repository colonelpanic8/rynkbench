// Simulated Glove80: split ergo, 80 keys on a 6x14 matrix (with 4 holes),
// per-key RGB mirroring the real LED-chain order. Physical geometry (column
// stagger, thumb-cluster fans) is traced from the official MoErgo Layout
// Editor; chain indices are ported from ui/src/lib/glove80-layout.ts; legends
// come from the shared enrichment tables so the default keymap and the
// rendered labels agree.

import type {
  DeviceCapabilities,
  DeviceInfo,
  EncoderAction,
  HidKeyCode,
  Key,
  KeyAction,
  LightingZone,
} from "../../vendor/rynk-wasm/rynk_wasm";
import {
  GLOVE80_COLS,
  GLOVE80_GRID,
  GLOVE80_ROWS,
  glove80Enrichment,
} from "../../model/boards/glove80";
import { buildTopology, hid, layerOn, type BoardSpec, type SimLed } from "./board";

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

interface BoardKey {
  /** Visual key center, in key-units (1u pitch). */
  x: number;
  y: number;
  /** Clockwise rotation in degrees, about the key's own center. */
  rot: number;
  led: number;
  thumb: boolean;
}

// Physical geometry traced from the official MoErgo Layout Editor
// (my.glove80.com): main-grid columns span cells 0-5 (left) and 12-17
// (right); the two outermost columns of each half sit 0.5u lower than the
// finger columns. The thumb clusters are 2x3 fans angled inward.
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

function buildBoardKeys(): Map<number, BoardKey> {
  const keys = new Map<number, BoardKey>();
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

const boardKeys = buildBoardKeys();

const gridEntries = GLOVE80_GRID.flatMap((logical, grid) =>
  logical === null
    ? []
    : [{ logical, row: Math.floor(grid / GLOVE80_COLS), col: grid % GLOVE80_COLS }],
);

// Wire semantics (rmk-config layout.rs walk()): rect.x/y is the key's final
// visual center and r is clockwise degrees about that center — so the visual
// coordinates are stored directly.
function placedKey(row: number, col: number, board: BoardKey): Key {
  return {
    row,
    col,
    rect: { x: board.x, y: board.y, w: 1, h: 1 },
    r: board.rot,
    rect2: undefined,
  };
}

const layoutKeys: Key[] = gridEntries.map(({ logical, row, col }) =>
  placedKey(row, col, boardKeys.get(logical)!),
);

const ZONE_LEFT = 0;
const ZONE_RIGHT = 1;
const ZONE_THUMBS = 2;

const zones: LightingZone[] = [
  { id: ZONE_LEFT, name: "left-half" },
  { id: ZONE_RIGHT, name: "right-half" },
  { id: ZONE_THUMBS, name: "thumbs" },
];

// LED id = chain index; the left half is node 0 (chain 0–39), the right half
// node 1 (chain 40–79, per-node physical index 0–39).
const simLeds: SimLed[] = gridEntries
  .map(({ logical, row, col }): SimLed => {
    const board = boardKeys.get(logical)!;
    const left = board.led < 40;
    return {
      id: board.led,
      row,
      col,
      x: board.x,
      y: board.y,
      node: left ? 0 : 1,
      physicalIndex: left ? board.led : board.led - 40,
      zoneIds: [left ? ZONE_LEFT : ZONE_RIGHT, ...(board.thumb ? [ZONE_THUMBS] : [])],
    };
  })
  .sort((a, b) => a.id - b.id);

const labels = glove80Enrichment.labels ?? {};

const LEGEND_ACTIONS: Record<string, KeyAction> = {
  "=": hid("Equal"),
  "−": hid("Minus"),
  "\\": hid("Backslash"),
  ";": hid("Semicolon"),
  "'": hid("Quote"),
  ",": hid("Comma"),
  ".": hid("Dot"),
  "/": hid("Slash"),
  "`": hid("Grave"),
  "[": hid("LeftBracket"),
  "]": hid("RightBracket"),
  Tab: hid("Tab"),
  Esc: hid("Escape"),
  Del: hid("Delete"),
  Home: hid("Home"),
  End: hid("End"),
  Enter: hid("Enter"),
  Space: hid("Space"),
  "⌫": hid("Backspace"),
  "←": hid("Left"),
  "→": hid("Right"),
  "↑": hid("Up"),
  "↓": hid("Down"),
  Magic: layerOn(1),
  L3: layerOn(2),
  L4: layerOn(3),
};

function actionForLegend(label: string, rightHalf: boolean): KeyAction {
  switch (label) {
    case "Shift":
      return hid(rightHalf ? "RShift" : "LShift");
    case "Ctrl":
      return hid(rightHalf ? "RCtrl" : "LCtrl");
    case "Alt":
      return hid(rightHalf ? "RAlt" : "LAlt");
    case "⌘":
      return hid(rightHalf ? "RGui" : "LGui");
  }
  const fixed = LEGEND_ACTIONS[label];
  if (fixed) return fixed;
  if (/^(F[1-9]|F10|[A-Z])$/.test(label)) return hid(label as HidKeyCode);
  if (/^[0-9]$/.test(label)) return hid(`Kc${label}` as HidKeyCode);
  return "No";
}

const NUM_LAYERS = 4;
const GRID_SIZE = GLOVE80_ROWS * GLOVE80_COLS;

function buildLayers(): KeyAction[][] {
  const layerAt = (fill: (label: string, rightHalf: boolean) => KeyAction): KeyAction[] =>
    Array.from({ length: GRID_SIZE }, (_, index) => {
      const col = index % GLOVE80_COLS;
      const label = labels[`${Math.floor(index / GLOVE80_COLS)},${col}`];
      return label === undefined ? "No" : fill(label, col >= 7);
    });
  const base = layerAt(actionForLegend);
  const transparent = layerAt(() => "Transparent");
  return [base, ...Array.from({ length: NUM_LAYERS - 1 }, () => [...transparent])];
}

const capabilities: DeviceCapabilities = {
  num_layers: NUM_LAYERS,
  num_rows: GLOVE80_ROWS,
  num_cols: GLOVE80_COLS,
  num_encoders: 0,
  max_combos: 8,
  max_combo_keys: 4,
  macro_space_size: 0,
  max_morse: 0,
  max_patterns_per_key: 0,
  max_forks: 0,
  storage_enabled: true,
  lighting_enabled: true,
  is_split: true,
  num_split_peripherals: 1,
  ble_enabled: true,
  num_ble_profiles: 4,
  max_payload_size: 256,
  max_bulk_keys: 28,
  max_bulk_configs: 4,
  macro_chunk_size: 0,
  bulk_transfer_supported: true,
};

const info: DeviceInfo = {
  rmk_version: { major: 0, minor: 7, patch: 0 },
  vendor_id: 0x16c0,
  product_id: 0x27db,
  manufacturer: "MoErgo",
  product_name: "Glove80",
  serial_number: "MOCK-GLOVE80-001",
};

const defaultEncoders: EncoderAction[][] = Array.from({ length: NUM_LAYERS }, () => []);

export const glove80Board: BoardSpec = {
  title: "Demo: Glove80",
  description: "Simulated split ergo board — 80 keys, dual halves, per-key RGB.",
  info,
  capabilities,
  protocol: { major: 1, minor: 0 },
  connection: {
    usb: "Suspended",
    ble: { profile: 0, state: "Connected" },
    preferred: "Ble",
  },
  layout: {
    default_variant: 0,
    variants: [{ name: "Glove80", keys: layoutKeys, encoders: [] }],
  },
  topology: buildTopology(1, zones, simLeds),
  defaultLayers: buildLayers(),
  defaultEncoders,
  battery: { Available: { charge_state: "Discharging", level: 84 } },
  brightness: 180,
  background: { enabled: true, hue: 152, saturation: 180, value: 140, speed: 40, mode: "Solid" },
};
