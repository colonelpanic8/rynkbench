// The Rynkbench session seam.
//
// Everything above this interface is backend-neutral UI; everything below it
// is one of the pluggable backends (mock, WebHID via rynk-wasm, and later a
// native Tauri transport). Nothing outside src/session/ may import transport
// or wasm machinery — but *types* from the vendored rynk-wasm package are
// fine anywhere: `import type` is erased at compile time, so the mock backend
// and the UI share the generated protocol types without pulling in wasm.
//
// Design rules:
// - Connection is modeled as "request a session" because the most constrained
//   backend (WebHID) can only open a device from a user-gesture-triggered
//   browser picker. Backends that can enumerate devices freely still fit.
// - Paged topology endpoints are wrapped into whole-topology reads here; the
//   UI never sees revision-pinned pagination.
// - v1 scope is keymap + lighting + device status. Combos, macros, forks and
//   morse exist in the protocol and can be added to this seam later.

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
  KeyAction,
  LayoutInfo,
  LedIndicator,
  LightingCapabilities,
  LightingCompiledSceneStatus,
  LightingLed,
  LightingMatrixPosition,
  LightingMutableState,
  LightingOverlayCell,
  LightingLayerPolicy,
  LightingPhysicalKey,
  LightingRoute,
  LightingSceneCell,
  LightingSceneStatus,
  LightingState,
  LightingZone,
  LightingZoneId,
  MatrixState,
  Morse,
  PeripheralStatus,
  ProtocolVersion,
  TopicEvent,
} from "../vendor/rynk-wasm/rynk_wasm";

/** Which backend produced a session. Drives labels, never behavior. */
export type SessionKind = "mock" | "webhid" | "webbluetooth" | "native";

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
  topology(): Promise<LightingTopology>;
  /** Atomically replace the whole overlay (wraps the chunked transaction). */
  replaceOverlay(cells: LightingOverlayCell[]): Promise<LightingState>;
  clearOverlay(): Promise<LightingState>;
  readOverlay(): Promise<LightingOverlayCell[]>;
  /** Mutate background/output state; revision handshake is the backend's job. */
  setState(state: LightingMutableState): Promise<LightingState>;
  /** Durable per-layer scenes (firmware feature; localStorage presets are the
   *  fallback). Supported iff the firmware advertises LAYER_SCENES and
   *  sceneStatus() reports capacity > 0; on unsupported firmware
   *  sceneStatus() rejects with a descriptive error. */
  scenes: LightingSceneOps;
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
}

export interface DeviceOps {
  info(): Promise<DeviceInfo>;
  capabilities(): Promise<DeviceCapabilities>;
  protocolVersion(): Promise<ProtocolVersion>;
  layout(): Promise<LayoutInfo>;
  battery(): Promise<BatteryStatus>;
  connectionStatus(): Promise<ConnectionStatus>;
  rebootToBootloader(): Promise<void>;
  bleStatus(): Promise<BleStatus>;
  clearBleProfile(slot: number): Promise<void>;
  peripheralStatus(slot: number): Promise<PeripheralStatus>;
  /** Live pressed-key bitmap, for the matrix tester. */
  matrixState(): Promise<MatrixState>;
  ledIndicator(): Promise<LedIndicator>;
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
}
