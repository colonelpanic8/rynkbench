// Simulated "Dev stub 48": a bare 4x12 ortho with two encoders and a plain LED
// grid, and deliberately nothing else — no layer scenes, no compiled or
// conditional lighting, no extension effects, no output-mode policy, no
// pointing, no split, no runtime hold triggers. It is the board that proves
// every optional surface degrades instead of breaking.

import type {
  DeviceCapabilities,
  DeviceInfo,
  EncoderAction,
  HidKeyCode,
  Key,
  KeyAction,
  LightingZone,
} from "../../vendor/rynk-wasm/rynk_wasm";
import { emptyMorseProfile } from "../../model/slots";
import { buildTopology, hid, layerOn, type BoardSpec, type SimLed } from "./board";

const ROWS = 4;
const COLS = 12;
const NUM_LAYERS = 4;

const layoutKeys: Key[] = Array.from({ length: ROWS * COLS }, (_, index) => ({
  row: Math.floor(index / COLS),
  col: index % COLS,
  rect: { x: (index % COLS) * 1.02, y: Math.floor(index / COLS) * 1.02, w: 0.94, h: 0.94 },
  r: 0,
  rect2: undefined,
  pivot: undefined,
}));

const ZONE_LEFT = 0;
const ZONE_RIGHT = 1;
const ZONE_HOME_ROW = 2;
const ZONE_BOTTOM_ROW = 3;

const zones: LightingZone[] = [
  { id: ZONE_LEFT, name: "left-half" },
  { id: ZONE_RIGHT, name: "right-half" },
  { id: ZONE_HOME_ROW, name: "home-row" },
  { id: ZONE_BOTTOM_ROW, name: "bottom-row" },
];

const simLeds: SimLed[] = Array.from({ length: ROWS * COLS }, (_, index): SimLed => {
  const row = Math.floor(index / COLS);
  const col = index % COLS;
  return {
    id: index,
    row,
    col,
    x: col,
    y: row,
    node: 0,
    physicalIndex: index,
    zoneIds: [
      col < COLS / 2 ? ZONE_LEFT : ZONE_RIGHT,
      ...(row === 1 ? [ZONE_HOME_ROW] : []),
      ...(row === ROWS - 1 ? [ZONE_BOTTOM_ROW] : []),
    ],
  };
});

const row = (...codes: HidKeyCode[]): KeyAction[] => codes.map(hid);
const transparentLayer = (): KeyAction[] =>
  Array.from({ length: ROWS * COLS }, (): KeyAction => "Transparent");

const baseLayer: KeyAction[] = [
  ...row("Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "Backspace"),
  ...row("Escape", "A", "S", "D", "F", "G", "H", "J", "K", "L", "Semicolon", "Quote"),
  ...row("LShift", "Z", "X", "C", "V", "B", "N", "M", "Comma", "Dot", "Slash", "Enter"),
  hid("LCtrl"),
  hid("LGui"),
  hid("LAlt"),
  { TapHold: [{ Key: { Hid: "Escape" } }, { LayerOn: 1 }, 255] },
  layerOn(1),
  hid("Space"),
  hid("Space"),
  layerOn(2),
  ...row("Left", "Down", "Up", "Right"),
];

const navigationLayer: KeyAction[] = [
  ...row("F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"),
  ...row("Grave", "Kc1", "Kc2", "Kc3", "Kc4", "Kc5", "Kc6", "Kc7", "Kc8", "Kc9", "Kc0", "Delete"),
  ...transparentLayer().slice(0, COLS * 2),
];

const mediaLayer: KeyAction[] = [
  hid("MediaPlayPause"),
  hid("MediaPrevTrack"),
  hid("MediaNextTrack"),
  hid("AudioMute"),
  hid("AudioVolDown"),
  hid("AudioVolUp"),
  { Single: { Light: "RgbTog" } },
  { Single: { Light: "RgbHui" } },
  { Single: { Light: "RgbVai" } },
  { Single: { Light: "RgbVad" } },
  { Single: { KeyboardControl: "Bootloader" } },
  "No",
  ...transparentLayer().slice(0, COLS * 3),
];

const defaultLayerLayer: KeyAction[] = [
  { Single: { DefaultLayer: 0 } },
  ...transparentLayer().slice(1),
];

const defaultLayers: KeyAction[][] = [
  baseLayer,
  navigationLayer,
  mediaLayer,
  defaultLayerLayer,
];

const defaultEncoders: EncoderAction[][] = [
  [
    { clockwise: hid("AudioVolUp"), counter_clockwise: hid("AudioVolDown") },
    { clockwise: hid("MediaNextTrack"), counter_clockwise: hid("MediaPrevTrack") },
  ],
  ...Array.from({ length: NUM_LAYERS - 1 }, (): EncoderAction[] => [
    { clockwise: "Transparent", counter_clockwise: "Transparent" },
    { clockwise: "Transparent", counter_clockwise: "Transparent" },
  ]),
];

const capabilities: DeviceCapabilities = {
  num_layers: NUM_LAYERS,
  num_rows: ROWS,
  num_cols: COLS,
  num_encoders: 2,
  max_combos: 16,
  max_combo_keys: 4,
  macro_space_size: 1024,
  max_morse: 8,
  max_patterns_per_key: 8,
  max_forks: 8,
  storage_enabled: true,
  lighting_enabled: true,
  is_split: false,
  num_split_peripherals: 0,
  ble_enabled: true,
  num_ble_profiles: 3,
  max_payload_size: 64,
  max_bulk_keys: 16,
  max_bulk_items: 4,
  macro_chunk_size: 32,
  bulk_transfer_supported: true,
};

const info: DeviceInfo = {
  rmk_version: { major: 0, minor: 7, patch: 3 },
  vendor_id: 0x1209,
  product_id: 0x0001,
  manufacturer: "Rynk Labs",
  product_name: "Stub Ortho 48",
  serial_number: "DEV-STUB-0001",
};

export const stub48Board: BoardSpec = {
  title: "Dev stub 4×12",
  description: "Simulated 4x12 ortho with encoders and lighting, and no optional firmware surfaces.",
  info,
  capabilities,
  protocol: { major: 1, minor: 0 },
  build: { label: "stub-rmk v0.0.0 (stubbuil) / RMK rmk-v0.8.2-992-gstubbuil" },
  connection: {
    usb: "Configured",
    ble: { profile: 0, state: "Inactive" },
    preferred: "Usb",
  },
  layout: {
    default_variant: 0,
    variants: [
      {
        name: "Stub Ortho 48",
        keys: layoutKeys,
        encoders: [
          { id: 0, x: (COLS - 1) * 1.02 + 1.35, y: 0.1, pivot: undefined },
          { id: 1, x: (COLS - 1) * 1.02 + 1.35, y: 1.35, pivot: undefined },
        ],
      },
    ],
  },
  topology: buildTopology(1, zones, simLeds),
  defaultLayers,
  layerNames: ["Base", "Navigation", "Media", "Reset"],
  defaultEncoders,
  battery: { Available: { charge_state: "Discharging", level: 87 } },
  brightness: 200,
  background: { enabled: false, hue: 0, saturation: 0, value: 0, speed: 0, mode: "Solid" },
  behavior: {
    combo_timeout_ms: 50,
    oneshot_timeout_ms: 1000,
    tap_interval_ms: 200,
    tap_capslock_interval_ms: 350,
    morse_default_profile: emptyMorseProfile(),
    morse_prior_idle_time_ms: 0,
  },
  ledIndicator: { num_lock: false, caps_lock: false, scroll_lock: false, compose: false, kana: false },
};
