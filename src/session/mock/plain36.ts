// Simulated "Plain 36": a wired 3x12 board as stock RMK builds it without the
// optional radios and lights: no RGB, no Bluetooth, no encoders, no pointing,
// no split. Its lighting calls answer "unsupported", as firmware built without
// lighting does. It is the board that proves every screen works with none of
// them.

import type {
  DeviceCapabilities,
  DeviceInfo,
  EncoderAction,
  HidKeyCode,
  Key,
  KeyAction,
} from "../../vendor/rynk-wasm/rynk_wasm";
import { emptyMorseProfile } from "../../model/slots";
import { hid, layerOn, type BoardSpec } from "./board";
import { buildTopology } from "./topology";

const ROWS = 3;
const COLS = 12;
const NUM_LAYERS = 3;

const layoutKeys: Key[] = Array.from({ length: ROWS * COLS }, (_, index) => ({
  row: Math.floor(index / COLS),
  col: index % COLS,
  rect: { x: (index % COLS) * 1.02, y: Math.floor(index / COLS) * 1.02, w: 0.94, h: 0.94 },
  r: 0,
  rect2: undefined,
  pivot: undefined,
}));

const row = (...codes: HidKeyCode[]): KeyAction[] => codes.map(hid);
const transparentRow = (): KeyAction[] => Array.from({ length: COLS }, (): KeyAction => "Transparent");

const baseLayer: KeyAction[] = [
  ...row("Q", "W", "E", "R", "T", "Escape", "Backspace", "Y", "U", "I", "O", "P"),
  ...row("A", "S", "D", "F", "G", "Tab", "Enter", "H", "J", "K", "L", "Semicolon"),
  hid("Z"),
  hid("X"),
  hid("C"),
  hid("V"),
  { TapHold: [{ Key: { Hid: "B" } }, { LayerOn: 1 }, 255] },
  hid("Space"),
  hid("Space"),
  layerOn(2),
  ...row("N", "M", "Comma", "Dot"),
];

const numberLayer: KeyAction[] = [
  ...row("Kc1", "Kc2", "Kc3", "Kc4", "Kc5", "Grave", "Delete", "Kc6", "Kc7", "Kc8", "Kc9", "Kc0"),
  ...row("Left", "Down", "Up", "Right", "Minus", "Equal", "Quote", "Slash", "LeftBracket", "RightBracket", "Backslash", "Enter"),
  ...transparentRow(),
];

const systemLayer: KeyAction[] = [
  ...row("F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"),
  ...row("MediaPlayPause", "MediaPrevTrack", "MediaNextTrack", "AudioMute", "AudioVolDown", "AudioVolUp"),
  ...transparentRow().slice(0, COLS / 2),
  { Single: { KeyboardControl: "Bootloader" } },
  ...transparentRow().slice(1),
];

const capabilities: DeviceCapabilities = {
  num_layers: NUM_LAYERS,
  num_rows: ROWS,
  num_cols: COLS,
  num_encoders: 0,
  max_combos: 8,
  max_combo_keys: 4,
  macro_space_size: 256,
  max_morses: 8,
  max_patterns_per_key: 8,
  max_forks: 8,
  storage_enabled: true,
  lighting_enabled: false,
  is_split: false,
  num_split_peripherals: 0,
  ble_enabled: false,
  num_ble_profiles: 0,
  max_connections: 0,
  dongle_profile: undefined,
  max_payload_size: 64,
  max_bulk_keys: 16,
  max_bulk_items: 4,
  max_macros: 16,
  macros_writable: true,
  bulk_transfer_supported: true,
};

const info: DeviceInfo = {
  rmk_version: { major: 0, minor: 8, patch: 2 },
  vendor_id: 0x4c4b,
  product_id: 0x0036,
  manufacturer: "RMK",
  product_name: "Plain 36",
  serial_number: "PLAIN-36-0001",
};

export const plain36Board: BoardSpec = {
  title: "Demo: Plain 36",
  description: "Simulated wired 3x12 board on stock RMK: no RGB, no Bluetooth, no encoders.",
  info,
  capabilities,
  protocol: { major: 1, minor: 0 },
  build: { label: "plain36-rmk v0.1.0 (plainbui) / RMK rmk-v0.8.2-992-gplainbui" },
  connection: {
    usb: "Configured",
    ble: [],
    selected: 0,
    preferred: "Usb",
  },
  layout: {
    default_variant: 0,
    variants: [{ name: "Plain 36", keys: layoutKeys, encoders: [] }],
  },
  topology: buildTopology(0, [], []),
  defaultLayers: [baseLayer, numberLayer, systemLayer],
  layerNames: ["Base", "Numbers", "System"],
  defaultEncoders: Array.from({ length: NUM_LAYERS }, (): EncoderAction[] => []),
  battery: "Unavailable",
  brightness: 0,
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
