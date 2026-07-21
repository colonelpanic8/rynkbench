// Simulated "Ortho 60": a plain 5x12 ortholinear board with one rotary
// encoder and a serpentine LED strip. Deliberately nothing like the Glove80 —
// different matrix, different wiring, different vendor — and it ships no
// enrichment entry, so the UI must render it purely from device data.

import type {
  DeviceCapabilities,
  DeviceInfo,
  EncoderAction,
  HidKeyCode,
  Key,
  KeyAction,
  LightingZone,
} from "../../vendor/rynk-wasm/rynk_wasm";
import { buildTopology, hid, layerOn, type BoardSpec, type SimLed } from "./board";

const ROWS = 5;
const COLS = 12;
const NUM_LAYERS = 3;

const layoutKeys: Key[] = Array.from({ length: ROWS * COLS }, (_, index) => {
  const row = Math.floor(index / COLS);
  const col = index % COLS;
  return { row, col, rect: { x: col, y: row, w: 1, h: 1 }, r: 0, rect2: undefined };
});

const ZONE_NUMBER_ROW = 0;
const ZONE_BOTTOM_ROW = 1;

const zones: LightingZone[] = [
  { id: ZONE_NUMBER_ROW, name: "number-row" },
  { id: ZONE_BOTTOM_ROW, name: "bottom-row" },
];

// One strip, wired serpentine: even rows run left→right, odd rows right→left.
const simLeds: SimLed[] = Array.from({ length: ROWS * COLS }, (_, index): SimLed => {
  const row = Math.floor(index / COLS);
  const col = index % COLS;
  const chainCol = row % 2 === 0 ? col : COLS - 1 - col;
  const zoneIds = row === 0 ? [ZONE_NUMBER_ROW] : row === ROWS - 1 ? [ZONE_BOTTOM_ROW] : [];
  return { id: index, row, col, x: col, y: row, node: 0, physicalIndex: row * COLS + chainCol, zoneIds };
});

const row = (...codes: HidKeyCode[]): KeyAction[] => codes.map(hid);

const baseLayer: KeyAction[] = [
  ...row("Grave", "Kc1", "Kc2", "Kc3", "Kc4", "Kc5", "Kc6", "Kc7", "Kc8", "Kc9", "Kc0", "Backspace"),
  ...row("Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "Delete"),
  ...row("Escape", "A", "S", "D", "F", "G", "H", "J", "K", "L", "Semicolon", "Quote"),
  ...row("LShift", "Z", "X", "C", "V", "B", "N", "M", "Comma", "Dot", "Slash", "Enter"),
  hid("LCtrl"),
  hid("Application"),
  hid("LGui"),
  hid("LAlt"),
  layerOn(1),
  hid("Space"),
  hid("Space"),
  layerOn(2),
  ...row("Left", "Down", "Up", "Right"),
];

const defaultLayers: KeyAction[][] = [
  baseLayer,
  ...Array.from({ length: NUM_LAYERS - 1 }, (): KeyAction[] =>
    Array.from({ length: ROWS * COLS }, () => "Transparent"),
  ),
];

const defaultEncoders: EncoderAction[][] = [
  [{ clockwise: hid("AudioVolUp"), counter_clockwise: hid("AudioVolDown") }],
  ...Array.from({ length: NUM_LAYERS - 1 }, (): EncoderAction[] => [
    { clockwise: "Transparent", counter_clockwise: "Transparent" },
  ]),
];

const capabilities: DeviceCapabilities = {
  num_layers: NUM_LAYERS,
  num_rows: ROWS,
  num_cols: COLS,
  num_encoders: 1,
  max_combos: 4,
  max_combo_keys: 4,
  macro_space_size: 0,
  max_morse: 0,
  max_patterns_per_key: 0,
  max_forks: 0,
  storage_enabled: true,
  lighting_enabled: true,
  is_split: false,
  num_split_peripherals: 0,
  ble_enabled: false,
  num_ble_profiles: 0,
  max_payload_size: 256,
  max_bulk_keys: 28,
  max_bulk_configs: 4,
  macro_chunk_size: 0,
  bulk_transfer_supported: true,
};

const info: DeviceInfo = {
  rmk_version: { major: 0, minor: 7, patch: 0 },
  vendor_id: 0xfeed,
  product_id: 0x6060,
  manufacturer: "Keebworks",
  product_name: "Ortho 60",
  serial_number: "MOCK-ORTHO60-001",
};

export const ortho60Board: BoardSpec = {
  title: "Demo: Ortho 60",
  description: "Simulated 5x12 ortholinear board with a rotary encoder and an RGB strip.",
  info,
  capabilities,
  protocol: { major: 1, minor: 0 },
  connection: {
    usb: "Configured",
    ble: { profile: 0, state: "Inactive" },
    preferred: "Usb",
  },
  layout: {
    default_variant: 0,
    variants: [{ name: "Ortho 60", keys: layoutKeys, encoders: [{ id: 0, x: 12.7, y: 0 }] }],
  },
  topology: buildTopology(1, zones, simLeds),
  defaultLayers,
  defaultEncoders,
  battery: "Unavailable",
  brightness: 200,
  background: { enabled: true, hue: 28, saturation: 200, value: 150, speed: 60, mode: "Breathe" },
};
