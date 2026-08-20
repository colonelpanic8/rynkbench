// Simulated Glove80: split ergo, 80 keys on a 6x14 matrix (with 4 holes),
// per-key RGB mirroring the real LED-chain order. Physical geometry (column
// stagger, thumb-cluster fans) is representative mock data; chain indices are
// ported from ui/src/lib/glove80-layout.ts; legends come from the shared
// enrichment tables so the default keymap and rendered labels agree.

import type {
  ComboDefinition,
  DeviceCapabilities,
  DeviceInfo,
  EncoderAction,
  Fork,
  HidKeyCode,
  Key,
  KeyAction,
  LightingConditionalSceneCell,
  LightingExtendedConditionalSceneCell,
  LightingSceneCell,
  LightingZone,
  Morse,
} from "../../vendor/rynk-wasm/rynk_wasm";
import {
  GLOVE80_BOARD_KEYS,
  GLOVE80_COLS,
  GLOVE80_GRID,
  GLOVE80_ROWS,
  glove80Enrichment,
  type Glove80Key,
} from "../../model/boards/glove80";
import {
  buildTopology,
  emptyFork,
  emptyMorse,
  emptyMorseProfile,
  hid,
  layerOn,
  noModifiers,
  noStateBits,
  type BoardSpec,
  type SimLed,
} from "./board";

// Placement + LED-chain data is the shared board table in model/boards —
// the same real geometry current firmware serves through GetLayout.
type BoardKey = Glove80Key;

const boardKeys = GLOVE80_BOARD_KEYS;

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
    pivot: undefined,
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
  const layers = [base, ...Array.from({ length: NUM_LAYERS - 1 }, () => [...transparent])];
  layers[2][3 * GLOVE80_COLS + 2] = { Single: { User: 13 } };
  layers[2][3 * GLOVE80_COLS + 3] = { Single: { User: 13 } };
  return layers;
}

const capabilities: DeviceCapabilities = {
  num_layers: NUM_LAYERS,
  num_rows: GLOVE80_ROWS,
  num_cols: GLOVE80_COLS,
  num_encoders: 0,
  max_combos: 32,
  max_combo_keys: 4,
  macro_space_size: 512,
  max_morse: 16,
  max_patterns_per_key: 8,
  max_forks: 16,
  storage_enabled: true,
  lighting_enabled: true,
  is_split: true,
  num_split_peripherals: 1,
  ble_enabled: true,
  num_ble_profiles: 4,
  max_payload_size: 256,
  max_bulk_keys: 28,
  max_bulk_items: 4,
  macro_chunk_size: 28,
  bulk_transfer_supported: true,
};

// A few pre-programmed advanced slots so the editors open onto real data;
// the rest of each table reads back as empty, like fresh firmware.

// J+K chorded together produce Escape (the classic vim combo).
const seedCombos: ComboDefinition[] = [
  { Actions: { actions: [hid("J"), hid("K")], output: hid("Escape"), layer: undefined } },
];

// Morse slot 0: tap (pattern 0b1·0) types Escape, hold (0b1·1) enables layer 1.
const seedMorse: Morse[] = [
  {
    ...emptyMorse(),
    profile: { ...emptyMorse().profile, mode: "Normal", hold_timeout_ms: 200 },
    actions: [
      [0b10, { Key: { Hid: "Escape" } }],
      [0b11, { LayerOn: 1 }],
    ],
  },
];

// Fork slot 0: Dot becomes Semicolon while either Shift is held.
const shiftBits = {
  ...noStateBits(),
  modifiers: { ...noModifiers(), left_shift: true, right_shift: true },
};
const seedForks: Fork[] = [
  {
    ...emptyFork(),
    trigger: hid("Dot"),
    negative_output: hid("Dot"),
    positive_output: hid("Semicolon"),
    match_any: shiftBits,
  },
];

// A small on-device scene: layer 1 tints the number row amber, the durable
// per-layer lighting the real firmware keeps in flash.
const seedScenes: LightingSceneCell[] = gridEntries
  .filter(({ row, col }) => /^[0-9]$/.test(labels[`${row},${col}`] ?? ""))
  .map(({ logical }) => ({
    layer: 1,
    led_id: boardKeys.get(logical)!.led,
    effect: { Solid: { color: { r: 255, g: 170, b: 30 } } },
  }));

// Immutable defaults reported by the mock firmware through the same protocol
// source as hardware. These mirror this mock board build; the UI never infers
// them from the Glove80 model.
const compiledScenes: LightingSceneCell[] = [
  ...[3, 43, 4, 44, 5, 45].map(
    (led_id): LightingSceneCell => ({
      layer: 0,
      led_id,
      effect: { Solid: { color: { r: 24, g: 24, b: 24 } } },
    }),
  ),
  ...([0, 40, 1, 41, 2, 42, 6, 46, 7, 47, 8, 48, 9, 49] as const).flatMap(
    (led_id): LightingSceneCell[] =>
      [
        { layer: 0, color: { r: 0, g: 0, b: 255 } },
        { layer: 1, color: { r: 0, g: 255, b: 0 } },
        { layer: 2, color: { r: 255, g: 0, b: 255 } },
        { layer: 3, color: { r: 255, g: 0, b: 0 } },
      ].map(({ layer, color }) => ({ layer, led_id, effect: { Solid: { color } } })),
  ),
];

const solid = (r: number, g: number, b: number) =>
  ({ Solid: { color: { r, g, b } } }) as const;

function ledForLabel(wanted: string): number {
  const entry = gridEntries.find(({ row, col }) => labels[`${row},${col}`] === wanted);
  if (!entry) throw new Error(`mock Glove80 has no ${wanted} key`);
  return boardKeys.get(entry.logical)!.led;
}

// Representative keyboard.toml-compiled rules: F1-F5 show active layers,
// layer 3 marks its gaming keys, and the Magic layer exposes both batteries.
const conditionalScenes: LightingConditionalSceneCell[] = [];
for (let layer = 0; layer < 5; layer++) {
  const led_id = ledForLabel(`F${layer + 1}`);
  conditionalScenes.push(
    {
      conditions: {
        layer: { layer, active: false },
        battery: undefined,
        output_mode: undefined,
      },
      led_id,
      effect: solid(180, 20, 20),
    },
    {
      conditions: {
        layer: { layer, active: true },
        battery: undefined,
        output_mode: undefined,
      },
      led_id,
      effect: solid(20, 180, 70),
    },
  );
}
for (const label of ["W", "A", "S", "D"]) {
  conditionalScenes.push({
    conditions: {
      layer: { layer: 3, active: true },
      battery: undefined,
      output_mode: undefined,
    },
    led_id: ledForLabel(label),
    effect: solid(220, 35, 35),
  });
}
conditionalScenes.push({
  conditions: {
    layer: { layer: 3, active: true },
    battery: undefined,
    output_mode: undefined,
  },
  led_id: ledForLabel("⌫"),
  effect: solid(255, 155, 25),
});
for (const [node, leds] of [
  [0, [39, 38, 37, 36, 35]],
  [1, [79, 78, 77, 76, 75]],
] as const) {
  leds.forEach((led_id, index) => {
    conditionalScenes.push({
      conditions: {
        layer: { layer: 2, active: true },
        battery: { node, min_level: 1 + index * 20, max_level: undefined, charge: "Any" },
        output_mode: undefined,
      },
      led_id,
      effect: solid(30, 190, 70),
    });
  });
}
conditionalScenes.push({
  conditions: {
    layer: { layer: 2, active: true },
    battery: undefined,
    output_mode: undefined,
  },
  led_id: ledForLabel("S"),
  effect: solid(160, 160, 160),
});

// The mutable ordered table, as a host would have written it: a battery
// warning that outranks the compiled gauge on the same LED, and a layer-3
// override that recolors one of the compiled gaming keys. Order is meaning —
// the blink lands after the solid warning and wins the slot they share.
const seedRuntimeConditionalScenes: LightingExtendedConditionalSceneCell[] = [
  {
    cell: {
      conditions: {
        layer: undefined,
        battery: { node: 0, min_level: undefined, max_level: 20, charge: "Discharging" },
        output_mode: undefined,
      },
      led_id: ledForLabel("Esc"),
      effect: solid(200, 40, 0),
    },
    connection: undefined,
    effects: undefined,
  },
  {
    cell: {
      conditions: {
        layer: undefined,
        battery: { node: 0, min_level: undefined, max_level: 10, charge: "Discharging" },
        output_mode: undefined,
      },
      led_id: ledForLabel("Esc"),
      effect: { Blink: { color: { r: 255, g: 0, b: 0 }, period_ms: 600, phase_ms: 0, duty: 128 } },
    },
    connection: undefined,
    effects: undefined,
  },
  {
    cell: {
      conditions: {
        layer: undefined,
        battery: { node: 1, min_level: undefined, max_level: 20, charge: "Discharging" },
        output_mode: undefined,
      },
      led_id: ledForLabel("Del"),
      effect: solid(200, 40, 0),
    },
    connection: undefined,
    effects: undefined,
  },
  {
    cell: {
      conditions: {
        layer: { layer: 0, active: true },
        battery: {
          node: 0,
          min_level: undefined,
          max_level: undefined,
          charge: "Charging",
        },
        output_mode: undefined,
      },
      led_id: ledForLabel("Esc"),
      effect: { Breathe: { color: { r: 0, g: 200, b: 90 }, period_ms: 2400, phase_ms: 0, step_ms: 16 } },
    },
    connection: undefined,
    effects: undefined,
  },
  {
    cell: {
      conditions: {
        layer: { layer: 3, active: true },
        battery: undefined,
        output_mode: undefined,
      },
      led_id: ledForLabel("W"),
      effect: { Blink: { color: { r: 40, g: 120, b: 255 }, period_ms: 800, phase_ms: 0, duty: 160 } },
    },
    connection: undefined,
    effects: undefined,
  },
  ...([
    ["AlwaysOn", solid(0, 128, 0)],
    ["AlwaysOff", solid(128, 0, 0)],
    ["PoweredOnly", solid(0, 64, 160)],
  ] as const).map(([output_mode, effect]) => ({
    cell: {
      conditions: {
        layer: { layer: 2, active: true },
        battery: undefined,
        output_mode,
      },
      led_id: ledForLabel("A"),
      effect,
    },
    connection: undefined,
    effects: undefined,
  })),
  // The extended predicates, so the mock exercises the same editors a current
  // keyboard does: an effects-state indicator and a USB-presence indicator.
  {
    cell: {
      conditions: { layer: { layer: 2, active: true }, battery: undefined, output_mode: undefined },
      led_id: ledForLabel("Z"),
      effect: solid(0, 128, 0),
    },
    connection: undefined,
    effects: { enabled: true },
  },
  {
    cell: {
      conditions: { layer: { layer: 2, active: true }, battery: undefined, output_mode: undefined },
      led_id: ledForLabel("Z"),
      effect: solid(128, 0, 0),
    },
    connection: undefined,
    effects: { enabled: false },
  },
  {
    cell: {
      conditions: { layer: { layer: 2, active: true }, battery: undefined, output_mode: undefined },
      led_id: ledForLabel("X"),
      effect: solid(0, 160, 64),
    },
    connection: {
      transport: undefined,
      profile: undefined,
      ble_state: undefined,
      bonded: undefined,
      usb_connected: true,
    },
    effects: undefined,
  },
];

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
  build: { label: "config 0e70aaf9 / glove80-rmk v0.1.0 (mockbuil) / RMK rmk-v0.8.2-992-gmockbuil" },
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
  layerNames: ["Base", "Lower", "Magic", "Games", "Mac Hyper", "Paseo"],
  pointingConfig: {
    revision: 1,
    device_count: 0,
    devices: [],
    override_count: 0,
    overrides: [],
  },
  initialDefaultLayer: 1,
  initialActiveLayers: [1, 2, 3],
  defaultEncoders,
  battery: { Available: { charge_state: "Discharging", level: 84 } },
  brightness: 180,
  background: { enabled: false, hue: 0, saturation: 0, value: 32, speed: 128, mode: "Solid" },
  behavior: {
    combo_timeout_ms: 50,
    oneshot_timeout_ms: 1000,
    tap_interval_ms: 200,
    tap_capslock_interval_ms: 350,
    morse_default_profile: emptyMorseProfile(),
    morse_prior_idle_time_ms: 0,
  },
  ledIndicator: { num_lock: false, caps_lock: false, scroll_lock: false, compose: false, kana: false },
  peripheralBattery: { Available: { charge_state: "Discharging", level: 79 } },
  seedCombos,
  seedMorse,
  seedForks,
  holdTriggerPositionCapacity: 32,
  seedHoldTriggerPositions: [
    { profile: 255, row: 3, col: 8 },
    { profile: 255, row: 3, col: 9 },
  ],
  sceneCapacity: 256,
  seedScenes,
  compiledScenes,
  compiledScenePolicy: "EffectiveOnly",
  conditionalScenes,
  lightingControls: { output_toggle_user_action: undefined, wake_layers: 1 << 2 },
  runtimeConditionalCapacity: 64,
  runtimeConditionalPredicates: true,
  seedRuntimeConditionalScenes,
  // The real firmware's extension band: PaletteFX effects with its palette
  // pack (display names from rmk-palettefx/palettes/*.toml).
  extensionEffects: {
    effects: [
      "Gradient",
      "Flow",
      "Vortex",
      "Sparkle",
      "Ripple",
      "Rain",
      "Reactive",
      "Crosshair",
      "Tracer",
      "Keyfall",
      "Shockwave",
      "Comet",
    ],
    palettes: [
      "Afterburn",
      "Amber",
      "Bad Wolf",
      "Carnival",
      "Classic",
      "Dracula",
      "Groovy",
      "Not Pink",
      "Phosphor",
      "Polarized",
      "Rose Gold",
      "Sport",
      "Synthwave",
      "Thermal",
      "Viridis",
      "Watermelon",
    ],
    initial: { effect: 5, palette: 0, value: 128, speed: 128 },
    overlay: 6,
    // Only some effects declare parameters, and the names/bounds are the
    // firmware's to choose — the UI renders whatever is advertised here.
    params: {
      5: [
        { name: "Drops", min: 1, max: 32, default: 6 },
        { name: "Spawn x10ms", min: 1, max: 255, default: 30 },
        { name: "Trail", min: 16, max: 255, default: 128 },
        { name: "Width", min: 4, max: 64, default: 14 },
        { name: "Rain hue", min: 0, max: 255, default: 172 },
      ],
      7: [
        { name: "Motion", min: 0, max: 3, default: 0 },
        { name: "Duration x10ms", min: 4, max: 255, default: 16 },
        { name: "Arm width", min: 0, max: 48, default: 8 },
        { name: "Pulse width", min: 4, max: 192, default: 56 },
        { name: "Crosses", min: 1, max: 16, default: 4 },
        { name: "Arm hue", min: 0, max: 255, default: 172 },
        { name: "Key hue", min: 0, max: 255, default: 16 },
      ],
      11: [
        { name: "Lag x10ms", min: 4, max: 120, default: 32 },
        { name: "Distance pace", min: 0, max: 255, default: 200 },
        { name: "Momentum", min: 0, max: 255, default: 168 },
        { name: "Trail x10ms", min: 0, max: 80, default: 20 },
        { name: "Head size", min: 4, max: 40, default: 14 },
        { name: "Linger x10ms", min: 4, max: 255, default: 80 },
      ],
    },
  },
  lightingOutputMode: {
    mode: "PoweredOnly",
    powered: false,
    wake_active: true,
    effective_enabled: true,
    powered_only_scope: "Local",
    cycle_user_action: 13,
    wake_layers: 1 << 2,
    indicator: undefined,
  },
};
