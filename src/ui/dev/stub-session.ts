// DEV-ONLY stub backend: a simulated 4x12 ortho board with two encoders,
// full lighting topology, and fake latency. Appended to the provider list
// only when import.meta.env.DEV — never part of a production build's registry.
// The real registry lives in src/session/index.ts.

import type {
  BatteryStatus,
  BehaviorConfig,
  BleStatus,
  Combo,
  ConnectionStatus,
  DeviceCapabilities,
  DeviceInfo,
  EncoderAction,
  Fork,
  Key,
  KeyAction,
  LayoutInfo,
  LedIndicator,
  LightingBackgroundState,
  LightingCapabilities,
  LightingLed,
  LightingMutableState,
  LightingOverlayCell,
  LightingState,
  LightingZone,
  LightingZoneId,
  MatrixState,
  Morse,
  PeripheralStatus,
  ProtocolVersion,
  TopicEvent,
} from "../../vendor/rynk-wasm/rynk_wasm";
import type {
  LayerKeymap,
  LightingTopology,
  RynkSession,
  SessionProvider,
} from "../../session/types";

const ROWS = 4;
const COLS = 12;
const LAYERS = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function lag(): Promise<void> {
  await sleep(40 + Math.random() * 70);
}

function key(code: string): KeyAction {
  return { Single: { Key: { Hid: code as never } } };
}

function mod(sym: "ctrl" | "shift" | "alt" | "gui"): KeyAction {
  return {
    Single: {
      Modifier: {
        left_ctrl: sym === "ctrl",
        left_shift: sym === "shift",
        left_alt: sym === "alt",
        left_gui: sym === "gui",
        right_ctrl: false,
        right_shift: false,
        right_alt: false,
        right_gui: false,
      },
    },
  };
}

function layerOn(n: number): KeyAction {
  return { Single: { LayerOn: n } };
}

function buildLayer0(): KeyAction[] {
  const rows: KeyAction[][] = [
    [
      key("Tab"), key("Q"), key("W"), key("E"), key("R"), key("T"),
      key("Y"), key("U"), key("I"), key("O"), key("P"), key("Backspace"),
    ],
    [
      key("Escape"), key("A"), key("S"), key("D"), key("F"), key("G"),
      key("H"), key("J"), key("K"), key("L"), key("Semicolon"), key("Quote"),
    ],
    [
      mod("shift"), key("Z"), key("X"), key("C"), key("V"), key("B"),
      key("N"), key("M"), key("Comma"), key("Dot"), key("Slash"), key("Enter"),
    ],
    [
      mod("ctrl"), mod("gui"), mod("alt"),
      { TapHold: [{ Key: { Hid: "Escape" as never } }, { LayerOn: 1 }, 200] },
      layerOn(1), key("Space"), key("Space"), layerOn(2),
      key("Left"), key("Down"), key("Up"), key("Right"),
    ],
  ];
  return rows.flat();
}

function buildLayer1(): KeyAction[] {
  const out: KeyAction[] = [];
  const fRow = ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"];
  const dRow = ["Grave", "Kc1", "Kc2", "Kc3", "Kc4", "Kc5", "Kc6", "Kc7", "Kc8", "Kc9", "Kc0", "Delete"];
  for (const c of fRow) out.push(key(c));
  for (const c of dRow) out.push(key(c));
  for (let i = 0; i < COLS; i++) out.push("Transparent");
  for (let i = 0; i < COLS; i++) out.push(i === 3 ? "No" : "Transparent");
  return out;
}

function buildLayer2(): KeyAction[] {
  const out: KeyAction[] = [];
  const media: KeyAction[] = [
    key("MediaPlayPause"), key("MediaPrevTrack"), key("MediaNextTrack"),
    key("AudioMute"), key("AudioVolDown"), key("AudioVolUp"),
    { Single: { Light: "RgbTog" } }, { Single: { Light: "RgbHui" } },
    { Single: { Light: "RgbVai" } }, { Single: { Light: "RgbVad" } },
    { Single: { KeyboardControl: "Bootloader" } }, "No",
  ];
  out.push(...media);
  for (let i = 0; i < COLS * 3; i++) out.push("Transparent");
  return out;
}

function buildLayer3(): KeyAction[] {
  const out: KeyAction[] = [];
  for (let i = 0; i < ROWS * COLS; i++) {
    out.push(i === 0 ? { Single: { DefaultLayer: 0 } } : "Transparent");
  }
  return out;
}

const ZONES: LightingZone[] = [
  { id: 0, name: "Left half" },
  { id: 1, name: "Right half" },
  { id: 2, name: "Home row" },
  { id: 3, name: "Bottom row" },
];

function zonesFor(row: number, col: number): number[] {
  const z: number[] = [col < COLS / 2 ? 0 : 1];
  if (row === 1) z.push(2);
  if (row === 3) z.push(3);
  return z;
}

function buildTopology(): LightingTopology {
  const leds: LightingLed[] = [];
  const memberships: LightingZoneId[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const zones = zonesFor(r, c);
      leds.push({
        id: r * COLS + c,
        key: { row: r, col: c },
        position: { x: c, y: r, z: 0 },
        zone_start: memberships.length,
        zone_len: zones.length,
      });
      memberships.push(...zones);
    }
  }
  return {
    revision: 1,
    keys: leds.map((l) => l.key!),
    physicalKeys: [],
    leds,
    routes: [],
    zones: ZONES,
    zoneMemberships: memberships,
  };
}

function buildLayout(): LayoutInfo {
  const keys: Key[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      keys.push({
        row: r,
        col: c,
        rect: { x: c * 1.02, y: r * 1.02, w: 0.94, h: 0.94 },
        r: 0,
        rect2: undefined,
      });
    }
  }
  return {
    default_variant: 0,
    variants: [
      {
        name: "Stub Ortho 48",
        keys,
        encoders: [
          { id: 0, x: (COLS - 1) * 1.02 + 1.35, y: 0.1 },
          { id: 1, x: (COLS - 1) * 1.02 + 1.35, y: 1.35 },
        ],
      },
    ],
  };
}

const CAPS: DeviceCapabilities = {
  num_layers: LAYERS,
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
  max_bulk_configs: 4,
  macro_chunk_size: 32,
  bulk_transfer_supported: true,
};

const INFO: DeviceInfo = {
  rmk_version: { major: 0, minor: 7, patch: 3 },
  vendor_id: 0x1209,
  product_id: 0x0001,
  manufacturer: "Rynk Labs",
  product_name: "Stub Ortho 48",
  serial_number: "DEV-STUB-0001",
};

const PROTOCOL: ProtocolVersion = { major: 1, minor: 0 };

function emptyBits() {
  return {
    modifiers: {
      left_ctrl: false,
      left_shift: false,
      left_alt: false,
      left_gui: false,
      right_ctrl: false,
      right_shift: false,
      right_alt: false,
      right_gui: false,
    },
    leds: { num_lock: false, caps_lock: false, scroll_lock: false, compose: false, kana: false },
    mouse: {
      button1: false,
      button2: false,
      button3: false,
      button4: false,
      button5: false,
      button6: false,
      button7: false,
      button8: false,
    },
  };
}

class StubSession implements RynkSession {
  readonly kind = "mock" as const;
  readonly label = "Dev stub · Stub Ortho 48";

  private layers: KeyAction[][] = [buildLayer0(), buildLayer1(), buildLayer2(), buildLayer3()];
  private encoderMap = new Map<string, EncoderAction>();
  private overlay = new Map<number, LightingOverlayCell>();
  private lightingRevision = 1;
  private currentLayerNum = 0;
  private defaultLayerNum = 0;
  private batteryLevel = 87;
  private outputEnabled = true;
  private brightness = 200;
  private background: LightingBackgroundState = {
    enabled: false,
    hue: 0,
    saturation: 0,
    value: 0,
    speed: 0,
    mode: "Solid",
  };
  private comboTable: Combo[] = Array.from({ length: CAPS.max_combos }, () => ({
    actions: [],
    output: "No" as const,
    layer: undefined,
  }));
  private morseTable: Morse[] = Array.from({ length: CAPS.max_morse }, () => ({
    profile: {
      unilateral_tap: undefined,
      enable_flow_tap: undefined,
      mode: undefined,
      hold_timeout_ms: undefined,
      gap_timeout_ms: undefined,
    },
    actions: [],
  }));
  private forkTable: Fork[] = Array.from({ length: CAPS.max_forks }, () => ({
    trigger: "No" as const,
    negative_output: "No" as const,
    positive_output: "No" as const,
    match_any: emptyBits(),
    match_none: emptyBits(),
    kept_modifiers: emptyBits().modifiers,
    bindable: true,
  }));
  private macroRegion = new Uint8Array(CAPS.macro_space_size);
  private behaviorConfig: BehaviorConfig = {
    combo_timeout_ms: 50,
    oneshot_timeout_ms: 1000,
    tap_interval_ms: 200,
    tap_capslock_interval_ms: 350,
  };
  private topicHandler: ((event: TopicEvent) => void) | null = null;
  private disconnectHandler: (() => void) | null = null;
  private batteryTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.encoderMap.set("0:0", {
      clockwise: key("AudioVolUp"),
      counter_clockwise: key("AudioVolDown"),
    });
    this.encoderMap.set("1:0", {
      clockwise: key("MediaNextTrack"),
      counter_clockwise: key("MediaPrevTrack"),
    });
    this.batteryTimer = setInterval(() => {
      this.batteryLevel = Math.max(5, this.batteryLevel - 1);
      this.emit({ BatteryStatusChange: this.batteryState() });
    }, 20000);
  }

  private emit(event: TopicEvent) {
    this.topicHandler?.(event);
  }

  private batteryState(): BatteryStatus {
    return {
      Available: { charge_state: "Discharging", level: this.batteryLevel },
    };
  }

  device = {
    info: async (): Promise<DeviceInfo> => {
      await lag();
      return INFO;
    },
    capabilities: async (): Promise<DeviceCapabilities> => {
      await lag();
      return CAPS;
    },
    protocolVersion: async (): Promise<ProtocolVersion> => {
      await lag();
      return PROTOCOL;
    },
    layout: async (): Promise<LayoutInfo> => {
      await lag();
      return buildLayout();
    },
    battery: async (): Promise<BatteryStatus> => {
      await lag();
      return this.batteryState();
    },
    connectionStatus: async (): Promise<ConnectionStatus> => {
      await lag();
      return {
        usb: "Configured",
        ble: { profile: 0, state: "Inactive" },
        preferred: "Usb",
      };
    },
    rebootToBootloader: async (): Promise<void> => {
      await sleep(400);
    },
    bleStatus: async (): Promise<BleStatus> => {
      await lag();
      return { profile: 0, state: "Inactive" };
    },
    clearBleProfile: async (): Promise<void> => {
      await lag();
    },
    peripheralStatus: async (): Promise<PeripheralStatus> => {
      await lag();
      return { connected: true, battery: "Unavailable" };
    },
    matrixState: async (): Promise<MatrixState> => {
      await lag();
      const bitmap = new Array(ROWS * Math.ceil(COLS / 8)).fill(0);
      return { pressed_bitmap: bitmap };
    },
    modifierState: async () => {
      await lag();
      return emptyBits().modifiers;
    },
    ledIndicator: async (): Promise<LedIndicator> => {
      await lag();
      return { num_lock: false, caps_lock: false, scroll_lock: false, compose: false, kana: false };
    },
  };

  combos = {
    readAll: async (): Promise<Combo[]> => {
      await lag();
      return structuredClone(this.comboTable);
    },
    set: async (index: number, combo: Combo): Promise<void> => {
      await lag();
      this.comboTable[index] = structuredClone(combo);
    },
  };

  morse = {
    readAll: async (): Promise<Morse[]> => {
      await lag();
      return structuredClone(this.morseTable);
    },
    set: async (index: number, morse: Morse): Promise<void> => {
      await lag();
      this.morseTable[index] = structuredClone(morse);
    },
  };

  forks = {
    readAll: async (): Promise<Fork[]> => {
      await lag();
      return structuredClone(this.forkTable);
    },
    set: async (index: number, fork: Fork): Promise<void> => {
      await lag();
      this.forkTable[index] = structuredClone(fork);
    },
  };

  macros = {
    read: async (): Promise<Uint8Array> => {
      await lag();
      return new Uint8Array(this.macroRegion);
    },
    write: async (data: Uint8Array): Promise<void> => {
      await lag();
      this.macroRegion.fill(0);
      this.macroRegion.set(data.slice(0, this.macroRegion.length));
    },
  };

  behavior = {
    get: async (): Promise<BehaviorConfig> => {
      await lag();
      return { ...this.behaviorConfig };
    },
    set: async (config: BehaviorConfig): Promise<void> => {
      await lag();
      this.behaviorConfig = { ...config };
    },
  };

  keymap = {
    readAll: async (): Promise<LayerKeymap[]> => {
      await sleep(160);
      return this.layers.map((actions, layer) => ({
        layer,
        actions: structuredClone(actions),
      }));
    },
    setKey: async (layer: number, row: number, col: number, action: KeyAction): Promise<void> => {
      await lag();
      this.layers[layer][row * COLS + col] = structuredClone(action);
    },
    getEncoder: async (encoderId: number, layer: number): Promise<EncoderAction> => {
      await lag();
      return structuredClone(
        this.encoderMap.get(`${encoderId}:${layer}`) ?? {
          clockwise: "No" as const,
          counter_clockwise: "No" as const,
        },
      );
    },
    setEncoder: async (encoderId: number, layer: number, action: EncoderAction): Promise<void> => {
      await lag();
      this.encoderMap.set(`${encoderId}:${layer}`, structuredClone(action));
    },
    currentLayer: async (): Promise<number> => {
      await lag();
      return this.currentLayerNum;
    },
    defaultLayer: async (): Promise<number> => {
      await lag();
      return this.defaultLayerNum;
    },
    layerState: async () => {
      await lag();
      return {
        defaultLayer: this.defaultLayerNum,
        activeLayers: [...new Set([this.defaultLayerNum, this.currentLayerNum])],
        complete: true,
      };
    },
    setDefaultLayer: async (layer: number): Promise<void> => {
      await lag();
      this.defaultLayerNum = layer;
      this.currentLayerNum = layer;
      // Demonstrates the live layer chip.
      setTimeout(() => this.emit({ LayerChange: layer }), 120);
    },
  };

  lighting = {
    capabilities: async (): Promise<LightingCapabilities> => {
      await lag();
      return {
        topology_revision: 1,
        logical_key_count: ROWS * COLS,
        physical_key_count: ROWS * COLS,
        led_count: ROWS * COLS,
        zone_count: ZONES.length,
        zone_membership_count: 0,
        output_count: 1,
        route_count: ROWS * COLS,
        overlay_capacity: 64,
        page_capacity: 16,
        overlay_chunk_capacity: 8,
        features: 0,
        effects: 7,
      };
    },
    state: async (): Promise<LightingState> => {
      await lag();
      return this.lightingStateNow();
    },
    outputMode: async (): Promise<never> => {
      throw new Error("this firmware does not support lighting output-mode readback");
    },
    topology: async (): Promise<LightingTopology> => {
      await sleep(120);
      return buildTopology();
    },
    replaceOverlay: async (cells: LightingOverlayCell[]): Promise<LightingState> => {
      await sleep(180);
      this.overlay = new Map(cells.map((c) => [c.led_id, structuredClone(c)]));
      this.lightingRevision += 1;
      setTimeout(() => this.emit({ LightingChange: undefined }), 80);
      return this.lightingStateNow();
    },
    clearOverlay: async (): Promise<LightingState> => {
      await lag();
      this.overlay.clear();
      this.lightingRevision += 1;
      setTimeout(() => this.emit({ LightingChange: undefined }), 80);
      return this.lightingStateNow();
    },
    readOverlay: async (): Promise<LightingOverlayCell[]> => {
      await lag();
      return [...this.overlay.values()].map((c) => structuredClone(c));
    },
    setState: async (state: LightingMutableState): Promise<LightingState> => {
      await lag();
      this.outputEnabled = state.output_enabled;
      this.brightness = state.output_brightness;
      this.background = { ...state.background };
      this.lightingRevision += 1;
      return this.lightingStateNow();
    },
    // The stub predates layer scenes; every scene op reports unsupported, so
    // the UI exercises the localStorage fallback path.
    scenes: {
      sceneStatus: async (): Promise<never> => {
        await lag();
        throw new Error("this firmware does not support on-device layer scenes");
      },
      readScenes: async (): Promise<never> => {
        throw new Error("this firmware does not support on-device layer scenes");
      },
      replaceScenes: async (): Promise<never> => {
        throw new Error("this firmware does not support on-device layer scenes");
      },
      setLayerPolicy: async (): Promise<never> => {
        throw new Error("this firmware does not support on-device layer scenes");
      },
      compiledStatus: async (): Promise<never> => {
        throw new Error("this firmware does not support compiled layer-scene readback");
      },
      readCompiledScenes: async (): Promise<never> => {
        throw new Error("this firmware does not support compiled layer-scene readback");
      },
      conditionalStatus: async (): Promise<never> => {
        throw new Error("this firmware does not support conditional-scene readback");
      },
      readConditionalScenes: async (): Promise<never> => {
        throw new Error("this firmware does not support conditional-scene readback");
      },
    },
  };

  private lightingStateNow(): LightingState {
    return {
      revision: this.lightingRevision,
      output_enabled: this.outputEnabled,
      output_brightness: this.brightness,
      background: { ...this.background },
      overlay_len: this.overlay.size,
    };
  }

  onTopic(handler: (event: TopicEvent) => void): void {
    this.topicHandler = handler;
  }

  onDisconnect(handler: () => void): void {
    this.disconnectHandler = handler;
    void this.disconnectHandler;
  }

  async close(): Promise<void> {
    clearInterval(this.batteryTimer);
    this.topicHandler = null;
  }
}

export const devStubProvider: SessionProvider = {
  kind: "mock",
  title: "Dev stub board",
  description: "In-memory simulated 4×12 ortho with encoders and lighting",
  available: () => true,
  connect: async () => {
    await sleep(700);
    return new StubSession();
  },
};
