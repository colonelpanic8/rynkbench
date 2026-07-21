// The mock backend's engine: a BoardSpec is one simulated device (static
// identity, geometry, topology, defaults); MockSession drives its mutable
// in-memory state behind the RynkSession seam. Every op resolves through a
// small random latency so the UI's loading states are exercised honestly,
// and topic pushes arrive on timers like a real device's.

import type {
  BatteryStatus,
  ConnectionStatus,
  DeviceCapabilities,
  DeviceInfo,
  EncoderAction,
  HidKeyCode,
  KeyAction,
  LayoutInfo,
  LightingBackgroundState,
  LightingCapabilities,
  LightingLed,
  LightingLedId,
  LightingOverlayCell,
  LightingPhysicalKey,
  LightingRoute,
  LightingState,
  LightingZone,
  LightingZoneId,
  ProtocolVersion,
  TopicEvent,
} from "../../vendor/rynk-wasm/rynk_wasm";
import type {
  DeviceOps,
  KeymapOps,
  LightingOps,
  LightingTopology,
  RynkSession,
  SessionKind,
  SessionProvider,
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
  /** Per-layer encoder defaults; [layer][encoderId]. */
  defaultEncoders: EncoderAction[][];
  battery: BatteryStatus;
  brightness: number;
  background: LightingBackgroundState;
}

export function hid(code: HidKeyCode): KeyAction {
  return { Single: { Key: { Hid: code } } };
}

export function layerOn(layer: number): KeyAction {
  return { Single: { LayerOn: layer } };
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

const BATTERY_PUSH_MS = 30_000;

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
  private battery: BatteryStatus;
  private revision = 1;
  private brightness: number;
  private background: LightingBackgroundState;
  private overlay = new Map<LightingLedId, OverlayEntry>();
  private topicHandler: ((event: TopicEvent) => void) | null = null;
  private disconnectHandler: (() => void) | null = null;
  private batteryTimer: ReturnType<typeof setInterval>;
  private ttlTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(spec: BoardSpec) {
    this.spec = spec;
    this.label = spec.info.product_name;
    this.layers = spec.defaultLayers.map((actions) => [...actions]);
    this.encoders = spec.defaultEncoders.map((perLayer) => perLayer.map((action) => ({ ...action })));
    this.knownLeds = new Set(spec.topology.leds.map((led) => led.id));
    this.battery = spec.battery;
    this.brightness = spec.brightness;
    this.background = { ...spec.background };
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
    setDefaultLayer: (layer) =>
      latency(() => {
        this.base = this.checkLayer(layer);
        this.current = layer;
        this.emit({ LayerChange: layer });
      }),
  };

  readonly lighting: LightingOps = {
    capabilities: () => latency(() => this.lightingCapabilities()),
    state: () => latency(() => this.lightingState()),
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
      output_enabled: true,
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
      features: 0,
      effects: 0b111, // solid | blink | breathe
    };
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
