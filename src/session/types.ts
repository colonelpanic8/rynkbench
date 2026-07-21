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
  ConnectionStatus,
  DeviceCapabilities,
  DeviceInfo,
  EncoderAction,
  KeyAction,
  LayoutInfo,
  LightingCapabilities,
  LightingLed,
  LightingMatrixPosition,
  LightingOverlayCell,
  LightingPhysicalKey,
  LightingRoute,
  LightingState,
  LightingZone,
  LightingZoneId,
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

export interface KeymapOps {
  /** Read every layer. Row-major within each layer. */
  readAll(): Promise<LayerKeymap[]>;
  setKey(layer: number, row: number, col: number, action: KeyAction): Promise<void>;
  getEncoder(encoderId: number, layer: number): Promise<EncoderAction>;
  setEncoder(encoderId: number, layer: number, action: EncoderAction): Promise<void>;
  currentLayer(): Promise<number>;
  defaultLayer(): Promise<number>;
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
}

export interface DeviceOps {
  info(): Promise<DeviceInfo>;
  capabilities(): Promise<DeviceCapabilities>;
  protocolVersion(): Promise<ProtocolVersion>;
  layout(): Promise<LayoutInfo>;
  battery(): Promise<BatteryStatus>;
  connectionStatus(): Promise<ConnectionStatus>;
  rebootToBootloader(): Promise<void>;
}

export interface RynkSession {
  readonly kind: SessionKind;
  /** Human-readable device label for the connection readout. */
  readonly label: string;
  readonly device: DeviceOps;
  readonly keymap: KeymapOps;
  readonly lighting: LightingOps;
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
