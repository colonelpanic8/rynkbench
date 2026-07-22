// The mock backend's engine: a BoardSpec is one simulated device (static
// identity, geometry, topology, defaults); MockSession drives its mutable
// in-memory state behind the RynkSession seam. Every op resolves through a
// small random latency so the UI's loading states are exercised honestly,
// and topic pushes arrive on timers like a real device's.

import type {
  Action,
  BatteryStatus,
  BehaviorConfig,
  BleStatus,
  Combo,
  ConnectionStatus,
  DeviceCapabilities,
  DeviceInfo,
  EncoderAction,
  Fork,
  HidKeyCode,
  KeyAction,
  LayoutInfo,
  LedIndicator,
  LightingBackgroundState,
  LightingCapabilities,
  LightingCompiledSceneStatus,
  LightingConditionalSceneCell,
  LightingConditionalSceneStatus,
  LightingControls,
  LightingExtension,
  LightingExtensionState,
  LightingLayerPolicy,
  LightingLed,
  LightingLedId,
  LightingOverlayCell,
  LightingOutputModeState,
  LightingPhysicalKey,
  LightingRoute,
  LightingSceneCell,
  LightingSceneStatus,
  LightingState,
  LightingZone,
  LightingZoneId,
  ModifierCombination,
  Morse,
  MouseButtons,
  ProtocolVersion,
  StateBits,
  TopicEvent,
} from "../../vendor/rynk-wasm/rynk_wasm";
import type {
  BehaviorOps,
  ComboOps,
  DeviceOps,
  ForkOps,
  KeymapOps,
  LightingOps,
  MacroOps,
  MorseOps,
  RynkSession,
  SessionKind,
  SessionProvider,
  LightingTopology,
} from "../types";

export interface BoardSpec {
  title: string;
  description: string;
  info: DeviceInfo;
  capabilities: DeviceCapabilities;
  protocol: ProtocolVersion;
  connection: ConnectionStatus;
  layout: LayoutInfo;
  topology: LightingTopology;
  /** Layer-major, row-major defaults; num_layers × (num_rows × num_cols). */
  defaultLayers: KeyAction[][];
  /** Initial authoritative layer state. The default layer is always added to
   * the active set. */
  initialDefaultLayer?: number;
  initialActiveLayers?: number[];
  /** Per-layer encoder defaults; [layer][encoderId]. */
  defaultEncoders: EncoderAction[][];
  battery: BatteryStatus;
  brightness: number;
  background: LightingBackgroundState;
  behavior: BehaviorConfig;
  ledIndicator: LedIndicator;
  /** Battery each split peripheral reports; wired halves say `"Unavailable"`. */
  peripheralBattery?: BatteryStatus;
  /** Pre-programmed slots, filling the table from slot 0. */
  seedCombos?: Combo[];
  seedMorse?: Morse[];
  seedForks?: Fork[];
  /** Max stored layer-scene cells; 0/absent simulates pre-scene firmware. */
  sceneCapacity?: number;
  /** Scene cells stored "in flash" when the session opens. */
  seedScenes?: LightingSceneCell[];
  /** Immutable board defaults compiled into the simulated firmware. Omit to
   *  simulate firmware predating compiled-scene readback; [] is supported. */
  compiledScenes?: LightingSceneCell[];
  compiledScenePolicy?: LightingLayerPolicy;
  /** Immutable conditional rules and controls compiled from keyboard.toml. */
  conditionalScenes?: LightingConditionalSceneCell[];
  lightingControls?: LightingControls;
  /** Three-state output policy readback. Omit for older simulated firmware. */
  lightingOutputMode?: LightingOutputModeState;
  /** Host-selectable extension effect pack (static name lists plus the boot
   *  selection). Omit to simulate firmware without EXTENSION_EFFECTS. */
  extensionEffects?: {
    effects: string[];
    palettes: string[];
    initial: LightingExtensionState;
  };
}

export function hid(code: HidKeyCode): KeyAction {
  return { Single: { Key: { Hid: code } } };
}

export function layerOn(layer: number): KeyAction {
  return { Single: { LayerOn: layer } };
}

export function noModifiers(): ModifierCombination {
  return {
    left_ctrl: false,
    left_shift: false,
    left_alt: false,
    left_gui: false,
    right_ctrl: false,
    right_shift: false,
    right_alt: false,
    right_gui: false,
  };
}

export function noLeds(): LedIndicator {
  return { num_lock: false, caps_lock: false, scroll_lock: false, compose: false, kana: false };
}

function noMouse(): MouseButtons {
  return {
    button1: false,
    button2: false,
    button3: false,
    button4: false,
    button5: false,
    button6: false,
    button7: false,
    button8: false,
  };
}

/** Zero state bits: match nothing (the wire default for fork conditions). */
export function noStateBits(): StateBits {
  return { modifiers: noModifiers(), leds: noLeds(), mouse: noMouse() };
}

// Empty slots mirror what real firmware reports for unprogrammed entries.
export function emptyCombo(): Combo {
  return { actions: [], output: "No", layer: undefined };
}

export function emptyMorse(): Morse {
  return {
    profile: {
      unilateral_tap: undefined,
      enable_flow_tap: undefined,
      mode: undefined,
      hold_timeout_ms: undefined,
      gap_timeout_ms: undefined,
    },
    actions: [],
  };
}

export function emptyFork(): Fork {
  return {
    trigger: "No",
    negative_output: "No",
    positive_output: "No",
    match_any: noStateBits(),
    match_none: noStateBits(),
    kept_modifiers: noModifiers(),
    bindable: true,
  };
}

// Slot values cross the session boundary in both directions, so every read
// and write clones — callers can never alias the mock's internal state.
const cloneStateBits = (bits: StateBits): StateBits => ({
  modifiers: { ...bits.modifiers },
  leds: { ...bits.leds },
  mouse: { ...bits.mouse },
});

const cloneCombo = (combo: Combo): Combo => ({ ...combo, actions: [...combo.actions] });

const cloneMorse = (morse: Morse): Morse => ({
  profile: { ...morse.profile },
  actions: morse.actions.map(([pattern, action]): [number, Action] => [pattern, action]),
});

const cloneFork = (fork: Fork): Fork => ({
  ...fork,
  match_any: cloneStateBits(fork.match_any),
  match_none: cloneStateBits(fork.match_none),
  kept_modifiers: { ...fork.kept_modifiers },
});

function buildSlots<T>(count: number, empty: () => T, clone: (value: T) => T, seeds?: T[]): T[] {
  const slots = Array.from({ length: count }, empty);
  seeds?.forEach((seed, index) => {
    if (index < count) slots[index] = clone(seed);
  });
  return slots;
}

/** One simulated light: identity, matrix key, geometry, wiring, zones. */
export interface SimLed {
  id: LightingLedId;
  row: number;
  col: number;
  x: number;
  y: number;
  node: number;
  physicalIndex: number;
  zoneIds: LightingZoneId[];
}

export function buildTopology(
  revision: number,
  zones: LightingZone[],
  simLeds: SimLed[],
): LightingTopology {
  const zoneMemberships: LightingZoneId[] = [];
  const leds: LightingLed[] = [];
  const physicalKeys: LightingPhysicalKey[] = [];
  const routes: LightingRoute[] = [];
  for (const led of simLeds) {
    const zone_start = zoneMemberships.length;
    zoneMemberships.push(...led.zoneIds);
    leds.push({
      id: led.id,
      key: { row: led.row, col: led.col },
      position: { x: led.x, y: led.y, z: 0 },
      zone_start,
      zone_len: led.zoneIds.length,
    });
    physicalKeys.push({
      matrix: { row: led.row, col: led.col },
      center: { x: led.x, y: led.y, z: 0 },
      size: { width: 1, height: 1 },
      rotation: 0,
    });
    routes.push({ led_id: led.id, node: led.node, output: 0, physical_index: led.physicalIndex });
  }
  const keys = simLeds.map((led) => ({ row: led.row, col: led.col }));
  return { revision, keys, physicalKeys, leds, routes, zones, zoneMemberships };
}

// LightingFeatureFlags::LAYER_SCENES (rmk-types); the generated .d.ts erases
// the bitflag constants to a plain number, so the value is mirrored here.
export const LAYER_SCENES = 1 << 6;
export const COMPILED_LAYER_SCENES = 1 << 8;
export const COMPILED_CONDITIONAL_SCENES = 1 << 9;
export const OUTPUT_MODE = 1 << 10;
export const EXTENSION_EFFECTS = 1 << 11;
const SCENE_CHUNK_CAPACITY = 16;

const sceneKey = (cell: { layer: number; led_id: LightingLedId }): string =>
  `${cell.layer}:${cell.led_id}`;

const cloneScene = (cell: LightingSceneCell): LightingSceneCell => structuredClone(cell);

const BATTERY_PUSH_MS = 30_000;
// While the matrix tester polls, a few random keys toggle every couple of
// seconds; the simulation stops itself once polling goes quiet.
const MATRIX_SIM_MS = 2_000;
const MATRIX_IDLE_MS = 5_000;

/** Resolve `work`'s result after 5–15 ms, rejecting if it throws. */
function latency<T>(work: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(work());
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }, 5 + Math.random() * 10);
  });
}

interface OverlayEntry {
  cell: LightingOverlayCell;
  /** Clock timestamp at which the cell expires; null = no TTL. */
  expiresAt: number | null;
}

class MockSession implements RynkSession {
  readonly kind: SessionKind = "mock";
  readonly label: string;

  private readonly spec: BoardSpec;
  private readonly layers: KeyAction[][];
  private readonly encoders: EncoderAction[][];
  private readonly knownLeds: Set<LightingLedId>;
  private base = 0;
  private current = 0;
  private activeLayers = new Set<number>([0]);
  private battery: BatteryStatus;
  private revision = 1;
  private outputEnabled = true;
  private brightness: number;
  private background: LightingBackgroundState;
  private overlay = new Map<LightingLedId, OverlayEntry>();
  private extensionState: LightingExtensionState | null = null;
  /** Durable scene table keyed `${layer}:${led_id}`, insertion-ordered. */
  private readonly sceneTable = new Map<string, LightingSceneCell>();
  private layerPolicy: LightingLayerPolicy = "EffectiveOnly";
  private readonly comboTable: Combo[];
  private readonly morseTable: Morse[];
  private readonly forkTable: Fork[];
  private readonly macroBytes: Uint8Array;
  private behaviorConfig: BehaviorConfig;
  private readonly indicator: LedIndicator;
  private readonly ble: BleStatus;
  private readonly matrixBitmap: Uint8Array;
  private readonly modifiers = noModifiers();
  private matrixTimer: ReturnType<typeof setInterval> | null = null;
  private lastMatrixPoll = 0;
  private topicHandler: ((event: TopicEvent) => void) | null = null;
  private disconnectHandler: (() => void) | null = null;
  private batteryTimer: ReturnType<typeof setInterval>;
  private ttlTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(spec: BoardSpec) {
    this.spec = spec;
    this.label = spec.info.product_name;
    this.layers = spec.defaultLayers.map((actions) => [...actions]);
    this.base = this.checkLayer(spec.initialDefaultLayer ?? 0);
    this.activeLayers = new Set((spec.initialActiveLayers ?? [this.base]).map((layer) => this.checkLayer(layer)));
    this.activeLayers.add(this.base);
    this.current = Math.max(...this.activeLayers);
    this.encoders = spec.defaultEncoders.map((perLayer) => perLayer.map((action) => ({ ...action })));
    this.knownLeds = new Set(spec.topology.leds.map((led) => led.id));
    for (const cell of spec.seedScenes ?? []) {
      this.checkSceneCell(cell);
      this.sceneTable.set(sceneKey(cell), cloneScene(cell));
    }
    for (const cell of spec.compiledScenes ?? []) this.checkSceneCell(cell);
    this.battery = spec.battery;
    this.brightness = spec.brightness;
    this.background = { ...spec.background };
    this.extensionState = spec.extensionEffects ? { ...spec.extensionEffects.initial } : null;
    const caps = spec.capabilities;
    this.comboTable = buildSlots(caps.max_combos, emptyCombo, cloneCombo, spec.seedCombos);
    this.morseTable = buildSlots(caps.max_morse, emptyMorse, cloneMorse, spec.seedMorse);
    this.forkTable = buildSlots(caps.max_forks, emptyFork, cloneFork, spec.seedForks);
    this.macroBytes = new Uint8Array(caps.macro_space_size);
    this.behaviorConfig = { ...spec.behavior };
    this.indicator = { ...spec.ledIndicator };
    this.ble = { ...spec.connection.ble };
    this.matrixBitmap = new Uint8Array(caps.num_rows * Math.ceil(caps.num_cols / 8));
    this.batteryTimer = setInterval(() => this.pushBattery(), BATTERY_PUSH_MS);
  }

  readonly device: DeviceOps = {
    info: () => latency(() => this.spec.info),
    capabilities: () => latency(() => this.spec.capabilities),
    protocolVersion: () => latency(() => this.spec.protocol),
    layout: () => latency(() => this.spec.layout),
    battery: () => latency(() => this.battery),
    connectionStatus: () => latency(() => this.spec.connection),
    // Bootloader entry drops the link, same as the real device would.
    rebootToBootloader: () =>
      latency(() => {
        const handler = this.disconnectHandler;
        void this.close();
        handler?.();
      }),
    bleStatus: () => latency(() => ({ ...this.ble })),
    clearBleProfile: (slot) =>
      latency(() => {
        const { num_ble_profiles } = this.spec.capabilities;
        if (!Number.isInteger(slot) || slot < 0 || slot >= num_ble_profiles) {
          throw new Error(`BLE profile ${slot} out of range`);
        }
      }),
    peripheralStatus: (slot) =>
      latency(() => {
        const { num_split_peripherals } = this.spec.capabilities;
        if (!Number.isInteger(slot) || slot < 0 || slot >= num_split_peripherals) {
          throw new Error(`peripheral ${slot} out of range`);
        }
        return { connected: true, battery: this.spec.peripheralBattery ?? "Unavailable" };
      }),
    matrixState: () =>
      latency(() => {
        this.lastMatrixPoll = Date.now();
        this.ensureMatrixSim();
        return { pressed_bitmap: [...this.matrixBitmap] };
      }),
    modifierState: () => latency(() => ({ ...this.modifiers })),
    ledIndicator: () => latency(() => ({ ...this.indicator })),
  };

  readonly keymap: KeymapOps = {
    readAll: () =>
      latency(() => this.layers.map((actions, layer) => ({ layer, actions: [...actions] }))),
    setKey: (layer, row, col, action) =>
      latency(() => {
        this.layers[this.checkLayer(layer)][this.keyIndex(row, col)] = action;
      }),
    getEncoder: (encoderId, layer) =>
      latency(() => this.encoders[this.checkLayer(layer)][this.checkEncoder(encoderId)]),
    setEncoder: (encoderId, layer, action) =>
      latency(() => {
        this.encoders[this.checkLayer(layer)][this.checkEncoder(encoderId)] = action;
      }),
    currentLayer: () => latency(() => this.current),
    defaultLayer: () => latency(() => this.base),
    layerState: () =>
      latency(() => ({
        defaultLayer: this.base,
        activeLayers: [...this.activeLayers].sort((a, b) => a - b),
        complete: true,
      })),
    setDefaultLayer: (layer) =>
      latency(() => {
        this.base = this.checkLayer(layer);
        this.activeLayers = new Set([this.base]);
        this.current = layer;
        this.emit({ LayerChange: layer });
      }),
  };

  readonly lighting: LightingOps = {
    capabilities: () => latency(() => this.lightingCapabilities()),
    state: () => latency(() => this.lightingState()),
    outputMode: () =>
      latency(() => {
        if (this.spec.lightingOutputMode === undefined) {
          throw new Error("this firmware does not support lighting output-mode readback");
        }
        return structuredClone(this.spec.lightingOutputMode);
      }),
    topology: () => latency(() => this.spec.topology),
    replaceOverlay: (cells) =>
      latency(() => {
        const now = Date.now();
        const next = new Map<LightingLedId, OverlayEntry>();
        for (const cell of cells) {
          if (!this.knownLeds.has(cell.led_id)) throw new Error(`unknown LED ${cell.led_id}`);
          if (cell.ttl_ms !== undefined && cell.ttl_ms <= 0) throw new Error("invalid TTL");
          next.set(cell.led_id, {
            cell,
            expiresAt: cell.ttl_ms === undefined ? null : now + cell.ttl_ms,
          });
        }
        this.overlay = next;
        return this.touchLighting();
      }),
    clearOverlay: () =>
      latency(() => {
        this.overlay.clear();
        return this.touchLighting();
      }),
    readOverlay: () =>
      latency(() => {
        this.pruneExpired();
        const now = Date.now();
        return [...this.overlay.values()].map(({ cell, expiresAt }) => ({
          ...cell,
          ttl_ms: expiresAt === null ? undefined : Math.max(1, expiresAt - now),
        }));
      }),
    setState: (state) =>
      latency(() => {
        this.outputEnabled = state.output_enabled;
        this.brightness = state.output_brightness;
        this.background = { ...state.background };
        return this.touchLighting();
      }),
    extension: () => latency(() => this.readExtension()),
    extensionNames: (kind) =>
      latency(() => {
        const pack = this.requireExtensionEffects();
        return [...(kind === "Effects" ? pack.effects : pack.palettes)];
      }),
    setExtensionState: (state) => {
      // The revision handshake reads the current revision, then writes the
      // guarded set — mirrored here by snapshotting at call time so any
      // mutation landing in the latency window rejects the stale write,
      // exactly like the firmware's compare-and-set.
      const expected = this.revision;
      return latency(() => {
        const pack = this.requireExtensionEffects();
        this.checkExtensionState(pack, state);
        if (this.revision !== expected) {
          throw new Error(
            `StateRevisionConflict: lighting revision moved (expected ${expected}, now ${this.revision})`,
          );
        }
        this.extensionState = { ...state };
        return this.touchLighting();
      });
    },
    scenes: {
      sceneStatus: () => latency(() => this.sceneStatus()),
      readScenes: () =>
        latency(() => {
          this.requireScenes();
          return [...this.sceneTable.values()].map(cloneScene);
        }),
      replaceScenes: (cells) =>
        latency(() => {
          this.requireScenes();
          const capacity = this.spec.sceneCapacity!;
          if (cells.length > capacity) {
            throw new Error(`scene table full: ${cells.length} cells, capacity ${capacity}`);
          }
          // Validate the whole batch before mutating, like the transactional
          // commit on real firmware: a bad cell leaves the table untouched.
          const next = new Map<string, LightingSceneCell>();
          for (const cell of cells) {
            this.checkSceneCell(cell);
            next.set(sceneKey(cell), cloneScene(cell));
          }
          this.sceneTable.clear();
          for (const [key, cell] of next) this.sceneTable.set(key, cell);
          return this.touchLighting();
        }),
      setLayerPolicy: (policy) =>
        latency(() => {
          this.requireScenes();
          this.layerPolicy = policy;
          return this.touchLighting();
        }),
      compiledStatus: () => latency(() => this.compiledSceneStatus()),
      readCompiledScenes: () =>
        latency(() => {
          this.requireCompiledScenes();
          return this.spec.compiledScenes!.map(cloneScene);
        }),
      conditionalStatus: () => latency(() => this.conditionalSceneStatus()),
      readConditionalScenes: () =>
        latency(() => {
          this.requireConditionalScenes();
          return structuredClone(this.spec.conditionalScenes ?? []);
        }),
    },
  };

  readonly combos: ComboOps = {
    readAll: () => latency(() => this.comboTable.map(cloneCombo)),
    set: (index, combo) =>
      latency(() => {
        const slot = this.checkSlot(index, this.comboTable.length, "combo");
        if (combo.actions.length > this.spec.capabilities.max_combo_keys) {
          throw new Error(`combo has ${combo.actions.length} keys, max ${this.spec.capabilities.max_combo_keys}`);
        }
        this.comboTable[slot] = cloneCombo(combo);
      }),
  };

  readonly morse: MorseOps = {
    readAll: () => latency(() => this.morseTable.map(cloneMorse)),
    set: (index, morse) =>
      latency(() => {
        const slot = this.checkSlot(index, this.morseTable.length, "morse");
        if (morse.actions.length > this.spec.capabilities.max_patterns_per_key) {
          throw new Error(`morse has ${morse.actions.length} patterns, max ${this.spec.capabilities.max_patterns_per_key}`);
        }
        this.morseTable[slot] = cloneMorse(morse);
      }),
  };

  readonly forks: ForkOps = {
    readAll: () => latency(() => this.forkTable.map(cloneFork)),
    set: (index, fork) =>
      latency(() => {
        this.forkTable[this.checkSlot(index, this.forkTable.length, "fork")] = cloneFork(fork);
      }),
  };

  readonly macros: MacroOps = {
    read: () => latency(() => new Uint8Array(this.macroBytes)),
    write: (data) =>
      latency(() => {
        if (data.length > this.macroBytes.length) {
          throw new Error(`macro data is ${data.length} bytes, capacity ${this.macroBytes.length}`);
        }
        this.macroBytes.fill(0);
        this.macroBytes.set(data);
      }),
  };

  readonly behavior: BehaviorOps = {
    get: () => latency(() => ({ ...this.behaviorConfig })),
    set: (config) =>
      latency(() => {
        this.behaviorConfig = { ...config };
      }),
  };

  onTopic(handler: (event: TopicEvent) => void): void {
    this.topicHandler = handler;
  }

  onDisconnect(handler: () => void): void {
    this.disconnectHandler = handler;
  }

  async close(): Promise<void> {
    this.closed = true;
    clearInterval(this.batteryTimer);
    if (this.ttlTimer !== null) clearTimeout(this.ttlTimer);
    this.ttlTimer = null;
    if (this.matrixTimer !== null) clearInterval(this.matrixTimer);
    this.matrixTimer = null;
  }

  private emit(event: TopicEvent): void {
    if (!this.closed) this.topicHandler?.(event);
  }

  private checkLayer(layer: number): number {
    if (!Number.isInteger(layer) || layer < 0 || layer >= this.layers.length) {
      throw new Error(`layer ${layer} out of range`);
    }
    return layer;
  }

  private checkEncoder(encoderId: number): number {
    if (!Number.isInteger(encoderId) || encoderId < 0 || encoderId >= this.spec.capabilities.num_encoders) {
      throw new Error(`encoder ${encoderId} out of range`);
    }
    return encoderId;
  }

  private checkSlot(index: number, count: number, what: string): number {
    if (!Number.isInteger(index) || index < 0 || index >= count) {
      throw new Error(`${what} slot ${index} out of range`);
    }
    return index;
  }

  private keyIndex(row: number, col: number): number {
    const { num_rows, num_cols } = this.spec.capabilities;
    if (row < 0 || row >= num_rows || col < 0 || col >= num_cols) {
      throw new Error(`key (${row},${col}) out of range`);
    }
    return row * num_cols + col;
  }

  private lightingState(): LightingState {
    return {
      revision: this.revision,
      output_enabled: this.outputEnabled,
      output_brightness: this.brightness,
      background: { ...this.background },
      overlay_len: this.overlay.size,
    };
  }

  private lightingCapabilities(): LightingCapabilities {
    const topology = this.spec.topology;
    const outputs = new Set(topology.routes.map((route) => `${route.node}/${route.output}`));
    return {
      topology_revision: topology.revision,
      logical_key_count: topology.keys.length,
      physical_key_count: topology.physicalKeys.length,
      led_count: topology.leds.length,
      zone_count: topology.zones.length,
      zone_membership_count: topology.zoneMemberships.length,
      output_count: outputs.size,
      route_count: topology.routes.length,
      overlay_capacity: topology.leds.length,
      page_capacity: 32,
      overlay_chunk_capacity: 16,
      features:
        ((this.spec.sceneCapacity ?? 0) > 0 ? LAYER_SCENES : 0) |
        (this.spec.compiledScenes !== undefined ? COMPILED_LAYER_SCENES : 0) |
        (this.spec.conditionalScenes !== undefined || this.spec.lightingControls !== undefined
          ? COMPILED_CONDITIONAL_SCENES
          : 0) |
        (this.spec.lightingOutputMode !== undefined ? OUTPUT_MODE : 0) |
        (this.spec.extensionEffects !== undefined ? EXTENSION_EFFECTS : 0),
      effects: 0b111, // solid | blink | breathe
    };
  }

  private requireExtensionEffects(): NonNullable<BoardSpec["extensionEffects"]> {
    const pack = this.spec.extensionEffects;
    if (pack === undefined) {
      throw new Error("this firmware does not support extension effects");
    }
    return pack;
  }

  private readExtension(): LightingExtension {
    const pack = this.requireExtensionEffects();
    return {
      revision: this.revision,
      effect_count: pack.effects.length,
      palette_count: pack.palettes.length,
      state: { ...this.extensionState! },
    };
  }

  private checkExtensionState(
    pack: NonNullable<BoardSpec["extensionEffects"]>,
    state: LightingExtensionState,
  ): void {
    if (!Number.isInteger(state.effect) || state.effect < 0 || state.effect >= pack.effects.length) {
      throw new Error(`extension effect ${state.effect} out of range`);
    }
    if (
      !Number.isInteger(state.palette) ||
      state.palette < 0 ||
      state.palette >= pack.palettes.length
    ) {
      throw new Error(`extension palette ${state.palette} out of range`);
    }
  }

  private requireScenes(): void {
    if ((this.spec.sceneCapacity ?? 0) === 0) {
      throw new Error("this firmware does not support on-device layer scenes");
    }
  }

  private sceneStatus(): LightingSceneStatus {
    this.requireScenes();
    return {
      revision: this.revision,
      capacity: this.spec.sceneCapacity!,
      scene_len: this.sceneTable.size,
      policy: this.layerPolicy,
      chunk_capacity: SCENE_CHUNK_CAPACITY,
    };
  }

  private requireCompiledScenes(): void {
    if (this.spec.compiledScenes === undefined) {
      throw new Error("this firmware does not support compiled layer-scene readback");
    }
  }

  private compiledSceneStatus(): LightingCompiledSceneStatus {
    this.requireCompiledScenes();
    return {
      topology_revision: this.spec.topology.revision,
      scene_len: this.spec.compiledScenes!.length,
      policy: this.spec.compiledScenePolicy ?? "EffectiveOnly",
      chunk_capacity: SCENE_CHUNK_CAPACITY,
    };
  }

  private requireConditionalScenes(): void {
    if (this.spec.conditionalScenes === undefined && this.spec.lightingControls === undefined) {
      throw new Error("this firmware does not support conditional-scene readback");
    }
  }

  private conditionalSceneStatus(): LightingConditionalSceneStatus {
    this.requireConditionalScenes();
    return {
      topology_revision: this.spec.topology.revision,
      cell_len: this.spec.conditionalScenes?.length ?? 0,
      chunk_capacity: SCENE_CHUNK_CAPACITY,
      controls: structuredClone(
        this.spec.lightingControls ?? {
          output_toggle_user_action: undefined,
          wake_layer: undefined,
        },
      ),
    };
  }

  private checkSceneCell(cell: LightingSceneCell): void {
    const { num_layers } = this.spec.capabilities;
    if (!Number.isInteger(cell.layer) || cell.layer < 0 || cell.layer >= num_layers) {
      throw new Error(`layer ${cell.layer} out of range`);
    }
    if (!this.knownLeds.has(cell.led_id)) throw new Error(`unknown LED ${cell.led_id}`);
  }

  /** After any overlay mutation: bump revision, rearm TTL expiry, notify. */
  private touchLighting(): LightingState {
    this.revision += 1;
    this.scheduleExpiry();
    this.emit({ LightingChange: undefined });
    return this.lightingState();
  }

  private pruneExpired(): boolean {
    const now = Date.now();
    let pruned = false;
    for (const [id, entry] of this.overlay) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        this.overlay.delete(id);
        pruned = true;
      }
    }
    return pruned;
  }

  private scheduleExpiry(): void {
    if (this.ttlTimer !== null) {
      clearTimeout(this.ttlTimer);
      this.ttlTimer = null;
    }
    if (this.closed) return;
    let next = Infinity;
    for (const { expiresAt } of this.overlay.values()) {
      if (expiresAt !== null) next = Math.min(next, expiresAt);
    }
    if (next === Infinity) return;
    this.ttlTimer = setTimeout(() => {
      this.ttlTimer = null;
      if (this.pruneExpired()) {
        this.revision += 1;
        this.emit({ LightingChange: undefined });
      }
      this.scheduleExpiry();
    }, Math.max(0, next - Date.now()));
  }

  /** Lazily start the press simulation; it winds down once polling stops. */
  private ensureMatrixSim(): void {
    if (this.matrixTimer !== null || this.closed) return;
    this.matrixTimer = setInterval(() => {
      if (Date.now() - this.lastMatrixPoll > MATRIX_IDLE_MS) {
        clearInterval(this.matrixTimer!);
        this.matrixTimer = null;
        this.matrixBitmap.fill(0);
        return;
      }
      this.matrixBitmap.fill(0);
      // Hold down a few real keys (never matrix holes) until the next tick.
      const keys = this.spec.topology.keys;
      const bytesPerRow = Math.ceil(this.spec.capabilities.num_cols / 8);
      const presses = 1 + Math.floor(Math.random() * 3);
      for (let press = 0; press < presses; press++) {
        const { row, col } = keys[Math.floor(Math.random() * keys.length)];
        this.matrixBitmap[row * bytesPerRow + (col >> 3)] |= 1 << (col & 7);
      }
    }, MATRIX_SIM_MS);
  }

  private pushBattery(): void {
    if (this.battery !== "Unavailable" && this.battery.Available.charge_state === "Discharging") {
      const level = this.battery.Available.level;
      if (level !== undefined && level > 5) {
        this.battery = { Available: { charge_state: "Discharging", level: level - 1 } };
      }
    }
    this.emit({ BatteryStatusChange: this.battery });
  }
}

export function mockProvider(spec: BoardSpec): SessionProvider {
  return {
    kind: "mock",
    title: spec.title,
    description: spec.description,
    available: () => true,
    connect: () => latency<RynkSession>(() => new MockSession(spec)),
  };
}
