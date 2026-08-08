// The Rynkbench session seam.
//
// Everything above this interface is backend-neutral UI; everything below it
// is one of the pluggable backends (mock, WebHID/Web Serial via rynk-wasm, or
// native Tauri HID). Nothing outside src/session/ may import transport or wasm
// machinery — but *types* from the vendored rynk-wasm package are fine
// anywhere: `import type` is erased at compile time, so the mock backend and
// the UI share the generated protocol types without pulling in wasm.
//
// Design rules:
// - Connection is modeled as "request a session" because the most constrained
//   browser backends can only open a device from a user-gesture-triggered
//   picker. Backends that can enumerate devices freely still fit.
// - Paged topology endpoints are wrapped into whole-topology reads here; the
//   UI never sees revision-pinned pagination.
// - v1 scope is keymap + lighting + device status. Combos, macros, forks and
//   morse exist in the protocol and can be added to this seam later.

import type {
  AutoMouseLayerConfig,
  AutoMouseLayerConfigState,
  BatteryStatus,
  BehaviorConfig,
  BehaviorOptions,
  BleStatus,
  BuildInfo,
  Combo,
  ConnectionStatus,
  DeviceCapabilities,
  DeviceInfo,
  EncoderAction,
  Fork,
  KeyAction,
  LayoutInfo,
  LedIndicator,
  LightingCapabilities,
  LightingCompiledSceneStatus,
  LightingConditionalSceneCell,
  LightingExtendedConditionalSceneCell,
  LightingConditionalSceneStatus,
  LightingExtension,
  LightingExtensionLayers,
  LightingExtensionNameKind,
  LightingExtensionParam,
  LightingExtensionState,
  LightingLed,
  LightingMatrixPosition,
  LightingMutableState,
  LightingOverlayCell,
  LightingOutputModeState,
  LightingLayerPolicy,
  LightingPhysicalKey,
  LightingRoute,
  LightingRuntimeConditionalSceneStatus,
  LightingSceneCell,
  LightingSceneStatus,
  LightingState,
  LightingZone,
  LightingZoneId,
  MatrixState,
  ModifierCombination,
  Morse,
  MorseHoldTriggerPosition,
  MorseHoldTriggerPositionState,
  MorseProfileEntry,
  MorseProfileState,
  PeripheralStatus,
  ProtocolVersion,
  SplitCentralLatencyPolicy,
  SplitCentralLatencyState,
  TopicEvent,
} from "../vendor/rynk-wasm/rynk_wasm";

/** Which backend produced a session. Drives labels, never behavior. */
export type SessionKind =
  | "mock"
  | "webhid"
  | "webserial"
  | "webbluetooth"
  | "native"
  | "nativeble";

/** A fully-assembled lighting topology (all pages, one revision). */
export interface LightingTopology {
  revision: number;
  keys: LightingMatrixPosition[];
  physicalKeys: LightingPhysicalKey[];
  leds: LightingLed[];
  routes: LightingRoute[];
  zones: LightingZone[];
  /** Flat zone-membership table indexed by LightingLed.zone_start/zone_len. */
  zoneMemberships: LightingZoneId[];
}

/** One layer's key actions in matrix order (row-major, rows × cols). */
export interface LayerKeymap {
  layer: number;
  actions: KeyAction[];
}

/** Every layer currently participating in key resolution. `complete` is
 * false only for legacy firmware that lacks GetLayerState. */
export interface LayerSnapshot {
  defaultLayer: number;
  activeLayers: number[];
  complete: boolean;
}

export interface KeymapOps {
  /** Read every layer. Row-major within each layer. */
  readAll(): Promise<LayerKeymap[]>;
  setKey(layer: number, row: number, col: number, action: KeyAction): Promise<void>;
  getEncoder(encoderId: number, layer: number): Promise<EncoderAction>;
  setEncoder(encoderId: number, layer: number, action: EncoderAction): Promise<void>;
  currentLayer(): Promise<number>;
  defaultLayer(): Promise<number>;
  layerState(): Promise<LayerSnapshot>;
  setDefaultLayer(layer: number): Promise<void>;
}

export interface LightingOps {
  capabilities(): Promise<LightingCapabilities>;
  state(): Promise<LightingState>;
  /** Configured three-state output policy and its live effective state. */
  outputMode(): Promise<LightingOutputModeState>;
  topology(): Promise<LightingTopology>;
  /** Atomically replace the whole overlay (wraps the chunked transaction). */
  replaceOverlay(cells: LightingOverlayCell[]): Promise<LightingState>;
  clearOverlay(): Promise<LightingState>;
  readOverlay(): Promise<LightingOverlayCell[]>;
  /** Mutate background/output state; revision handshake is the backend's job. */
  setState(state: LightingMutableState): Promise<LightingState>;
  /** Extension discovery: firmware-provided name-list sizes plus live state.
   *  Supported iff the firmware advertises EXTENSION_EFFECTS; unsupported
   *  firmware rejects with a descriptive error. */
  extension(): Promise<LightingExtension>;
  /** Optional second effect from the extension's ordinary effect list. */
  extensionLayers(): Promise<LightingExtensionLayers>;
  /** Read one whole extension name list (paging is the backend's job). */
  extensionNames(kind: LightingExtensionNameKind): Promise<string[]>;
  /** Replace the extension state; revision handshake is the backend's job. */
  setExtensionState(state: LightingExtensionState): Promise<LightingState>;
  setExtensionLayers(overlay: number | undefined): Promise<LightingState>;
  /** Read one effect's whole generic parameter list (paging is the backend's
   *  job). Parameters are per-(effect, ordinal) and the firmware names and
   *  bounds them; nothing here ascribes meaning to any name. Effects with no
   *  parameters resolve to []. Firmware predating per-effect parameters
   *  rejects with a descriptive error — callers feature-detect by catching. */
  extensionParams(effect: number): Promise<LightingExtensionParam[]>;
  /** Set one parameter of one effect (the effect need not be the active one);
   *  revision handshake is the backend's job. */
  setExtensionParam(effect: number, index: number, value: number): Promise<LightingState>;
  /** Durable per-layer scenes (firmware feature; localStorage presets are the
   *  fallback). Supported iff the firmware advertises LAYER_SCENES and
   *  sceneStatus() reports capacity > 0; on unsupported firmware
   *  sceneStatus() rejects with a descriptive error. */
  scenes: LightingSceneOps;
  /** The mutable, host-owned conditional table. Distinct from
   *  `scenes.readConditionalScenes()`, which serves the board's immutable
   *  compiled rules. Supported iff the firmware advertises
   *  RUNTIME_CONDITIONAL_SCENES; unsupported firmware rejects every op with a
   *  descriptive error, which callers treat as "no such surface". */
  conditionalScenes: LightingRuntimeConditionalOps;
}

/** Ordered, mutable conditional rules — the runtime counterpart of the board's
 *  compiled conditional source. Rules compose in TABLE ORDER and a later rule
 *  wins a slot a earlier one also claims, so the order *is* the meaning: never
 *  reorder a table on the way through this seam. Runtime cells override the
 *  compiled rules on slots they share. */
export interface LightingRuntimeConditionalOps {
  /** Occupancy and capacity, pinned to the lighting state revision. */
  status(): Promise<LightingRuntimeConditionalSceneStatus>;
  /** Read the whole ordered table (paging under one pinned revision, with a
   *  restart when the revision drifts, is the backend's job). */
  read(): Promise<LightingExtendedConditionalSceneCell[]>;
  /** Atomically replace the whole table, in the order given (wraps the
   *  begin/put-chunks/commit transaction and its revision handshake).
   *  Rejects cells carrying predicates the connected firmware cannot store
   *  rather than writing them away. */
  replace(cells: LightingExtendedConditionalSceneCell[]): Promise<LightingState>;
}

export interface LightingSceneOps {
  sceneStatus(): Promise<LightingSceneStatus>;
  /** Read the whole stored scene table (paging is the backend's job). */
  readScenes(): Promise<LightingSceneCell[]>;
  /** Atomically replace the whole scene table (wraps the chunked transaction). */
  replaceScenes(cells: LightingSceneCell[]): Promise<LightingState>;
  /** Set the layer-composition policy; revision handshake is the backend's job. */
  setLayerPolicy(policy: LightingLayerPolicy): Promise<LightingState>;
  /** Discover the immutable layer scenes compiled into this firmware build. */
  compiledStatus(): Promise<LightingCompiledSceneStatus>;
  /** Read the whole immutable compiled scene source (paging is the backend's job). */
  readCompiledScenes(): Promise<LightingSceneCell[]>;
  /** Discover conditional scenes and board-level controls compiled from keyboard.toml. */
  conditionalStatus(): Promise<LightingConditionalSceneStatus>;
  /** Read immutable conditional cells in firmware composition order. */
  readConditionalScenes(): Promise<LightingConditionalSceneCell[]>;
}

/** Slot-table ops (combos, morse, forks) share one shape: the backend reads
 *  the full table (bulk endpoints where supported) and writes one slot. */
export interface ComboOps {
  readAll(): Promise<Combo[]>;
  set(index: number, combo: Combo): Promise<void>;
}

export interface MorseOps {
  readAll(): Promise<Morse[]>;
  set(index: number, morse: Morse): Promise<void>;
}

export interface ForkOps {
  readAll(): Promise<Fork[]>;
  set(index: number, fork: Fork): Promise<void>;
}

/** The flat macro byte region (capabilities.macro_space_size bytes; 0 = no
 *  macro support). Chunked transfer is the backend's job. */
export interface MacroOps {
  read(): Promise<Uint8Array>;
  write(data: Uint8Array): Promise<void>;
}

export interface BehaviorOps {
  get(): Promise<BehaviorConfig>;
  set(config: BehaviorConfig): Promise<void>;
  options(): Promise<BehaviorOptions>;
  setOptions(options: BehaviorOptions): Promise<void>;
  profiles(): Promise<MorseProfileState>;
  setProfile(entry: MorseProfileEntry): Promise<void>;
  deleteProfile(index: number): Promise<void>;
  holdTriggerPositions(): Promise<MorseHoldTriggerPositionState>;
  setHoldTriggerPositions(positions: MorseHoldTriggerPosition[]): Promise<void>;
  autoMouseLayers(): Promise<AutoMouseLayerConfigState>;
  setAutoMouseLayers(configs: AutoMouseLayerConfig[]): Promise<void>;
}

export interface DeviceOps {
  info(): Promise<DeviceInfo>;
  capabilities(): Promise<DeviceCapabilities>;
  protocolVersion(): Promise<ProtocolVersion>;
  /** Application-defined build identity. Diagnostics only — the label names
   *  the firmware's source revisions, which no version number does. */
  buildInfo(): Promise<BuildInfo>;
  layout(): Promise<LayoutInfo>;
  battery(): Promise<BatteryStatus>;
  connectionStatus(): Promise<ConnectionStatus>;
  rebootToBootloader(): Promise<void>;
  bleStatus(): Promise<BleStatus>;
  clearBleProfile(slot: number): Promise<void>;
  /** Make `slot` the active BLE profile. Drops any live link and
   *  re-advertises, so the reported status settles a moment later. */
  switchBleProfile(slot: number): Promise<void>;
  peripheralStatus(slot: number): Promise<PeripheralStatus>;
  /** Live pressed-key bitmap, for the matrix tester. */
  matrixState(): Promise<MatrixState>;
  /** Final resolved modifier bitmap used by the HID keyboard report. */
  modifierState(): Promise<ModifierCombination>;
  ledIndicator(): Promise<LedIndicator>;
  /** Volatile active-mode BLE latency policy for a split central. */
  splitCentralLatency(): Promise<SplitCentralLatencyState>;
  setSplitCentralLatency(policy: SplitCentralLatencyPolicy): Promise<SplitCentralLatencyState>;
}

export interface RynkSession {
  readonly kind: SessionKind;
  /** Human-readable device label for the connection readout. */
  readonly label: string;
  readonly device: DeviceOps;
  readonly keymap: KeymapOps;
  readonly lighting: LightingOps;
  readonly combos: ComboOps;
  readonly morse: MorseOps;
  readonly forks: ForkOps;
  readonly macros: MacroOps;
  readonly behavior: BehaviorOps;
  /** Register the single handler for server-push topic events. */
  onTopic(handler: (event: TopicEvent) => void): void;
  /** Register the single handler called when the link drops unexpectedly. */
  onDisconnect(handler: () => void): void;
  close(): Promise<void>;
}

/** A connectable backend surfaced on the connect screen. */
export interface SessionProvider {
  readonly kind: SessionKind;
  readonly title: string;
  readonly description: string;
  /** Whether this backend can work in the current environment. */
  available(): boolean;
  /**
   * Open a session. Must be called from a user gesture (click) so backends
   * that show a browser device picker are permitted to do so.
   */
  connect(): Promise<RynkSession>;
  /**
   * Reopen the most recently connected device without requiring a user
   * gesture or showing a device picker. Used for automatic recovery after an
   * unexpected transport drop.
   */
  reconnect(): Promise<RynkSession>;
}
