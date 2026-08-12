// RynkSession over a live wasm RynkClient and a RynkByteLink — the shared
// core of every USB transport (WebHID, Web Serial, native Tauri). Transports
// supply the link plus a disconnect watcher; everything protocol-shaped lives
// here.
//
// The protocol allows one request in flight (next_topic is the sanctioned
// exception: one parked pull runs alongside one request), so every op goes
// through a serializing queue. A topic pump runs from construction until the
// link dies; multi-message operations (keymap sweep, topology read, overlay
// transaction) hold the queue for their whole critical section.

import type {
  ComboDefinition,
  DeviceCapabilities,
  Fork,
  KeyAction,
  LayerState,
  LightingCapabilities,
  LightingCompiledSceneStatus,
  LightingConditionalSceneCell,
  LightingConditionalSceneStatus,
  LightingExtendedConditionalSceneCell,
  LightingExtendedRuntimeConditionalScenesPage,
  LightingExtension,
  LightingExtensionNameKind,
  LightingExtensionParam,
  LightingExtensionState,
  LightingOutputModeState,
  LightingLayerPolicy,
  LightingMutableState,
  LightingOverlayCell,
  LightingOverlayPage,
  LightingOverlayPageRequest,
  LightingPageRequest,
  LightingRuntimeConditionalScenePageRequest,
  LightingRuntimeConditionalScenesPage,
  LightingRuntimeConditionalSceneStatus,
  LightingSceneCell,
  LightingSceneStatus,
  LightingState,
  Morse,
  PointingConfig,
  RynkClient,
  TopicEvent,
} from "../vendor/rynk-wasm/rynk_wasm";
import type {
  BehaviorOps,
  ComboOps,
  DeviceOps,
  ForkOps,
  KeymapOps,
  LayerKeymap,
  LayerSnapshot,
  LightingOps,
  LightingTopology,
  MacroOps,
  MorseOps,
  PointingOps,
  RynkSession,
  SessionKind,
} from "./types";
import type { RynkByteLink } from "./rynk-link";
import { sessionLog, type SessionLog } from "./diagnostics";

/** Transport-specific pieces a LinkSession cannot know itself. */
export interface LinkSessionHooks {
  kind: SessionKind;
  /**
   * Start watching the transport for surprise device loss. `onUnplug` must be
   * called when the device disappears out from under the session; the
   * returned function stops watching (called from `close()`).
   */
  watchDisconnect(onUnplug: () => void): () => void;
  /** Override the request watchdog (tests). Defaults to REQUEST_TIMEOUT_MS. */
  requestTimeoutMs?: number;
  /** Where to record the request trace. Defaults to the shared sessionLog. */
  log?: SessionLog;
}

/** How long one device request may go unanswered before the link is declared
 *  dead. Requests settle in single-digit milliseconds on a healthy link, so
 *  this only ever fires on a device that has genuinely stopped answering. */
export const REQUEST_TIMEOUT_MS = 5_000;

export class RequestTimeout extends Error {
  readonly op: string;
  readonly timeoutMs: number;

  constructor(op: string, timeoutMs: number) {
    super(`the keyboard did not answer ${op} within ${timeoutMs}ms — the link was closed`);
    this.op = op;
    this.timeoutMs = timeoutMs;
    this.name = "RequestTimeout";
  }
}

/** Requests that are parked by design and must never be timed out. */
const UNWATCHED_CALLS = new Set(["next_topic", "free"]);

/**
 * Put a watchdog on every request the driver makes.
 *
 * Without this a dropped response wedges the session permanently: the wasm
 * call never settles, so the caller's promise never settles, and the
 * serializing queue behind it never advances again.
 *
 * A timeout cannot be a local failure. The protocol allows one request in
 * flight, so a response that arrives after we gave up would be read as the
 * answer to whatever request ran next — every later read would be silently
 * wrong. `onTimeout` therefore ends the link, and the session reports a
 * disconnect rather than carrying on against a stream it can no longer trust.
 */
export function watchdogClient<T extends object>(
  client: T,
  {
    timeoutMs,
    onTimeout,
    log,
  }: { timeoutMs: number; onTimeout: (op: string) => void; log?: SessionLog },
): T {
  if (timeoutMs <= 0 && !log) return client;
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== "function" || UNWATCHED_CALLS.has(String(prop))) return value;
      const op = String(prop);
      return (...args: unknown[]) => {
        const result = (value as (...a: unknown[]) => unknown).apply(target, args);
        if (!(result instanceof Promise)) return result;
        const started = performance.now();
        const record = (outcome: "ok" | "error" | "timeout", detail?: unknown) =>
          log?.request({
            op,
            at: Date.now(),
            durationMs: performance.now() - started,
            outcome,
            detail: detail === undefined ? undefined : errorText(detail),
          });
        return new Promise((resolve, reject) => {
          const timer =
            timeoutMs > 0
              ? setTimeout(() => {
                  const failure = new RequestTimeout(op, timeoutMs);
                  record("timeout", failure);
                  onTimeout(op);
                  reject(failure);
                }, timeoutMs)
              : undefined;
          result.then(
            (settled) => {
              clearTimeout(timer);
              record("ok");
              resolve(settled);
            },
            (error: unknown) => {
              clearTimeout(timer);
              record("error", error);
              reject(error);
            },
          );
        });
      };
    },
  });
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

interface LightingPage<T> {
  topology_revision: number;
  total_count: number;
  items: T[];
}

interface ExtensionNamesClient {
  get_lighting_extension(): Promise<LightingExtension>;
  get_lighting_extension_names(request: {
    kind: LightingExtensionNameKind;
    offset: number;
  }): Promise<{ total: number; items: string[] }>;
}

interface ExtensionParamsClient {
  get_lighting_extension_params(request: {
    effect: number;
    offset: number;
  }): Promise<{ revision: number; total: number; items: LightingExtensionParam[] }>;
}

interface RuntimeConditionalClient {
  get_lighting_runtime_conditional_scene_status(): Promise<LightingRuntimeConditionalSceneStatus>;
  get_lighting_runtime_conditional_scenes(
    request: LightingRuntimeConditionalScenePageRequest,
  ): Promise<LightingRuntimeConditionalScenesPage>;
}

interface ExtendedRuntimeConditionalClient {
  get_lighting_extended_runtime_conditional_scene_status(): Promise<LightingRuntimeConditionalSceneStatus>;
  get_lighting_extended_runtime_conditional_scenes(
    request: LightingRuntimeConditionalScenePageRequest,
  ): Promise<LightingExtendedRuntimeConditionalScenesPage>;
}

interface RuntimeConditionalStatusClient {
  get_lighting_capabilities(): Promise<LightingCapabilities>;
  get_lighting_runtime_conditional_scene_status(): Promise<LightingRuntimeConditionalSceneStatus>;
  get_lighting_extended_runtime_conditional_scene_status(): Promise<LightingRuntimeConditionalSceneStatus>;
}

/** The two conditional-table readers differ only in which endpoint pair they
 *  call, so they share one pager rather than one copy of the coherence rules
 *  each. */
interface ConditionalPager<Cell> {
  status(): Promise<LightingRuntimeConditionalSceneStatus>;
  page(request: LightingRuntimeConditionalScenePageRequest): Promise<{
    revision: number;
    total_count: number;
    items: Cell[];
  }>;
}

const TOPOLOGY_READ_ATTEMPTS = 3;
const OVERLAY_READ_ATTEMPTS = 3;
const SCENE_READ_ATTEMPTS = 3;
const EXTENSION_PARAM_READ_ATTEMPTS = 3;
const RUNTIME_CONDITIONAL_READ_ATTEMPTS = 3;

// LightingFeatureFlags::LAYER_SCENES (rmk-types); the generated .d.ts erases
// the bitflag constants to a plain number, so the value is mirrored here.
const LAYER_SCENES = 1 << 6;
const COMPILED_LAYER_SCENES = 1 << 8;
const COMPILED_CONDITIONAL_SCENES = 1 << 9;
const OUTPUT_MODE = 1 << 10;
const EXTENSION_EFFECTS = 1 << 11;
const RUNTIME_CONDITIONAL_SCENES = 1 << 12;
// LightingFeatureFlags::RUNTIME_EFFECTS_CONDITIONS. This bit describes the
// extended cell's *encoding*, not just an extra predicate: firmware that
// advertises only RUNTIME_CONNECTION_CONDITIONS (1 << 14) speaks an earlier
// extended cell, so gating on that bit instead would risk a misparse. Anything
// short of this bit therefore uses the legacy endpoints.
const RUNTIME_EFFECTS_CONDITIONS = 1 << 15;

/** The topology changed under a paged read; the whole read restarts. */
class TopologyDrift extends Error {
  constructor(expected: number, got: number) {
    super(`lighting topology revision changed mid-read (${expected} -> ${got})`);
  }
}

function isRevisionConflict(error: unknown): boolean {
  // The firmware may reject a stale-pinned page outright instead of returning
  // a fresh-revision page; the wasm layer surfaces that as a serialized
  // LightingError. Either shape means: restart the read.
  return error instanceof TopologyDrift || String(error).includes("TopologyRevisionConflict");
}

function isStateRevisionConflict(error: unknown): boolean {
  return String(error).includes("StateRevisionConflict");
}

function isRetryableConditionalReadError(error: unknown): boolean {
  const message = String(error);
  return message.includes("response decode failed") ||
    message.includes("did not answer") ||
    message.includes("Transport") ||
    message.includes("transport") ||
    message.includes("link died");
}

interface OverlayReadClient {
  get_lighting_state(): Promise<LightingState>;
  get_lighting_overlay(request: LightingOverlayPageRequest): Promise<LightingOverlayPage>;
}

/** Decode the protocol's least-significant-bit-first active-layer bitmap. */
export function decodeLayerState(state: LayerState): LayerSnapshot {
  const activeLayers: number[] = [];
  for (let byte = 0; byte < state.active_bitmap.length; byte++) {
    for (let bit = 0; bit < 8; bit++) {
      if ((state.active_bitmap[byte] & (1 << bit)) !== 0) {
        activeLayers.push(byte * 8 + bit);
      }
    }
  }
  return {
    defaultLayer: state.default_layer,
    activeLayers,
    complete: true,
  };
}

/** Read one coherent overlay snapshot, retrying if mutation or TTL expiry
 * invalidates the pinned lighting-state revision between pages. */
export async function readLightingOverlay(
  client: OverlayReadClient,
  attempts = OVERLAY_READ_ATTEMPTS,
): Promise<LightingOverlayCell[]> {
  let lastConflict: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const state = await client.get_lighting_state();
    const cells: LightingOverlayCell[] = [];
    let offset = 0;
    let firstPage = true;
    try {
      // Request one page even for an empty overlay. Besides returning the
      // empty snapshot, this probes endpoint support on older firmware.
      while (firstPage || offset < state.overlay_len) {
        firstPage = false;
        const page = await client.get_lighting_overlay({
          revision: state.revision,
          offset,
        });
        if (page.revision !== state.revision || page.total_count !== state.overlay_len) {
          throw new Error(
            `overlay page disagrees with pinned state ` +
              `(revision ${state.revision}, count ${state.overlay_len})`,
          );
        }
        if (offset >= state.overlay_len) {
          if (page.items.length !== 0) {
            throw new Error("empty overlay snapshot returned unexpected cells");
          }
          break;
        }
        if (page.items.length === 0 || offset + page.items.length > state.overlay_len) {
          throw new Error(`overlay page stalled or exceeded count at cell ${offset}`);
        }
        cells.push(...page.items);
        offset = cells.length;
      }
      if (cells.length !== state.overlay_len) {
        throw new Error(
          `overlay pagination ended at ${cells.length} of ${state.overlay_len} cells`,
        );
      }
      return cells;
    } catch (error) {
      if (!isStateRevisionConflict(error)) throw error;
      lastConflict = error;
    }
  }
  throw new Error(`lighting overlay kept changing across ${attempts} read attempts`, {
    cause: lastConflict,
  });
}

export async function readLightingExtensionNames(
  client: ExtensionNamesClient,
  kind: LightingExtensionNameKind,
  discovered?: LightingExtension,
): Promise<string[]> {
  const extension = discovered ?? (await client.get_lighting_extension());
  const total = kind === "Effects" ? extension.effect_count : extension.palette_count;
  const names: string[] = [];
  while (names.length < total) {
    const page = await client.get_lighting_extension_names({ kind, offset: names.length });
    if (page.total !== total) {
      throw new Error(`extension name list disagrees with discovery (${page.total} vs ${total})`);
    }
    if (page.items.length === 0) {
      throw new Error(`extension name read stalled at ${names.length} of ${total}`);
    }
    if (names.length + page.items.length > total) {
      throw new Error(`extension name page exceeded advertised total ${total}`);
    }
    names.push(...page.items);
  }
  return names;
}

/** Read one effect's whole parameter list. Unlike name pages these carry live
 * values pinned to the lighting-state revision, so a revision moving under the
 * read restarts it — the same rule the overlay read follows. */
export async function readLightingExtensionParams(
  client: ExtensionParamsClient,
  effect: number,
  attempts = EXTENSION_PARAM_READ_ATTEMPTS,
): Promise<LightingExtensionParam[]> {
  let lastDrift: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const params: LightingExtensionParam[] = [];
    let revision: number | null = null;
    let total: number | null = null;
    let drifted = false;
    while (total === null || params.length < total) {
      const page = await client.get_lighting_extension_params({
        effect,
        offset: params.length,
      });
      if (revision === null) {
        revision = page.revision;
        total = page.total;
      } else if (page.revision !== revision) {
        lastDrift = new Error(
          `extension parameters changed mid-read (${revision} -> ${page.revision})`,
        );
        drifted = true;
        break;
      } else if (page.total !== total) {
        throw new Error(`extension parameter list disagrees with itself (${page.total} vs ${total})`);
      }
      if (total === 0) break;
      if (page.items.length === 0) {
        throw new Error(`extension parameter read stalled at ${params.length} of ${total}`);
      }
      if (params.length + page.items.length > total) {
        throw new Error(`extension parameter page exceeded advertised total ${total}`);
      }
      params.push(...page.items);
    }
    if (!drifted) return params;
  }
  throw new Error(`extension parameters kept changing across ${attempts} read attempts`, {
    cause: lastDrift,
  });
}

/** Read the whole mutable conditional table in one coherent snapshot: page
 * under the revision the status reported, and restart from a fresh status if a
 * lighting mutation moves that revision mid-read. Order is preserved exactly —
 * these rules compose in table order, so reordering them would change what the
 * keyboard renders. */
export async function readLightingRuntimeConditionalScenes(
  client: RuntimeConditionalClient,
  attempts = RUNTIME_CONDITIONAL_READ_ATTEMPTS,
): Promise<LightingConditionalSceneCell[]> {
  return readConditionalTable(
    {
      status: () => client.get_lighting_runtime_conditional_scene_status(),
      page: (request) => client.get_lighting_runtime_conditional_scenes(request),
    },
    attempts,
  );
}

/** The extended table read. Same coherence rules; the cells additionally carry
 *  the connection and effects predicates the legacy endpoints omit. Reading a
 *  predicate-bearing table through the legacy pair and writing it back is what
 *  silently strips those predicates, so callers that can use this must. */
export async function readLightingExtendedRuntimeConditionalScenes(
  client: ExtendedRuntimeConditionalClient,
  attempts = RUNTIME_CONDITIONAL_READ_ATTEMPTS,
): Promise<LightingExtendedConditionalSceneCell[]> {
  return readConditionalTable(
    {
      status: () => client.get_lighting_extended_runtime_conditional_scene_status(),
      page: (request) => client.get_lighting_extended_runtime_conditional_scenes(request),
    },
    attempts,
  );
}

export async function readLightingRuntimeConditionalStatus(
  client: RuntimeConditionalStatusClient,
): Promise<LightingRuntimeConditionalSceneStatus> {
  const caps = await client.get_lighting_capabilities();
  if ((caps.features & RUNTIME_CONDITIONAL_SCENES) === 0) {
    throw new Error("this firmware does not support runtime conditional scenes");
  }
  return (caps.features & RUNTIME_EFFECTS_CONDITIONS) !== 0
    ? client.get_lighting_extended_runtime_conditional_scene_status()
    : client.get_lighting_runtime_conditional_scene_status();
}

async function readConditionalTable<Cell>(
  pager: ConditionalPager<Cell>,
  attempts: number,
): Promise<Cell[]> {
  let lastError: unknown;
  let onlyConflicts = true;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      // Request the status even for an empty table: besides pinning the
      // revision, it probes endpoint support on firmware without the surface.
      const status = await pager.status();
      const cells: Cell[] = [];
      while (cells.length < status.cell_len) {
        const page = await pager.page({
          revision: status.revision,
          offset: cells.length,
        });
        if (page.revision !== status.revision || page.total_count !== status.cell_len) {
          throw new Error(
            `StateRevisionConflict: runtime conditional table changed mid-read ` +
              `(${status.revision} -> ${page.revision})`,
          );
        }
        if (page.items.length === 0) {
          throw new Error(
            `runtime conditional read stalled at cell ${cells.length} of ${status.cell_len}`,
          );
        }
        if (cells.length + page.items.length > status.cell_len) {
          throw new Error(
            `runtime conditional page exceeded advertised total ${status.cell_len}`,
          );
        }
        cells.push(...page.items);
      }
      return cells;
    } catch (error) {
      if (!isStateRevisionConflict(error) && !isRetryableConditionalReadError(error)) throw error;
      lastError = error;
      onlyConflicts &&= isStateRevisionConflict(error);
    }
  }
  throw new Error(
    onlyConflicts
      ? `runtime conditional table kept changing across ${attempts} read attempts`
      : `runtime conditional table read failed across ${attempts} attempts`,
    { cause: lastError },
  );
}

export class LinkSession implements RynkSession {
  readonly kind: SessionKind;
  readonly label: string;
  readonly device: DeviceOps;
  readonly keymap: KeymapOps;
  readonly lighting: LightingOps;
  readonly combos: ComboOps;
  readonly morse: MorseOps;
  readonly forks: ForkOps;
  readonly macros: MacroOps;
  readonly behavior: BehaviorOps;
  readonly pointing: PointingOps;

  private readonly client: RynkClient;
  private readonly link: RynkByteLink;
  private readonly unwatchDisconnect: () => void;
  private readonly log: SessionLog;
  private readonly pumpDone: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  private chunkCapacity: number | null = null;
  private topicHandler: ((event: TopicEvent) => void) | null = null;
  private disconnectHandler: (() => void) | null = null;

  constructor(client: RynkClient, link: RynkByteLink, hooks: LinkSessionHooks) {
    // Every op below closes over this binding, so the watchdog has to replace
    // it before any of them are built.
    client = watchdogClient(client, {
      timeoutMs: hooks.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
      onTimeout: () => this.failLink(),
      log: hooks.log ?? sessionLog,
    });
    this.log = hooks.log ?? sessionLog;
    this.log.event(`session opened on ${hooks.kind} (${link.label})`);
    this.client = client;
    this.link = link;
    this.kind = hooks.kind;
    this.label = link.label;

    this.unwatchDisconnect = hooks.watchDisconnect(() => {
      this.log.event("device unplugged");
      this.link.end();
      if (!this.closed) this.disconnectHandler?.();
    });
    this.pumpDone = this.pumpTopics();

    this.device = {
      info: () => this.run(() => client.get_device_info()),
      capabilities: () => this.run(() => client.get_capabilities()),
      protocolVersion: () => this.run(() => client.get_version()),
      buildInfo: () => this.run(() => client.get_build_info()),
      layout: () => this.run(() => client.get_layout()),
      battery: () => this.run(() => client.get_battery_status()),
      connectionStatus: () => this.run(() => client.get_connection_status()),
      rebootToBootloader: () => this.run(() => client.bootloader_jump()),
      bleStatus: () => this.run(() => client.get_ble_status()),
      clearBleProfile: (slot) => this.run(() => client.clear_ble_profile(slot)),
      switchBleProfile: (slot) => this.run(() => client.switch_ble_profile(slot)),
      peripheralStatus: (slot) => this.run(() => client.get_peripheral_status(slot)),
      matrixState: () => this.run(() => client.get_matrix_state()),
      modifierState: () => this.run(() => client.get_modifier_state()),
      ledIndicator: () => this.run(() => client.get_led_indicator()),
      splitCentralLatency: () => this.run(() => client.get_split_central_latency()),
      setSplitCentralLatency: (policy) =>
        this.run(() => client.set_split_central_latency(policy)),
    };

    this.keymap = {
      readAll: () => this.run(() => this.readAllLayers()),
      replaceAll: (layers) => this.run(() => this.replaceAllLayers(layers)),
      setKey: (layer, row, col, action) => this.run(() => client.set_key(layer, row, col, action)),
      getEncoder: (encoderId, layer) => this.run(() => client.get_encoder(encoderId, layer)),
      setEncoder: (encoderId, layer, action) =>
        this.run(() => client.set_encoder(encoderId, layer, action)),
      currentLayer: () => this.run(() => client.get_current_layer()),
      defaultLayer: () => this.run(() => client.get_default_layer()),
      layerState: () => this.run(() => this.readLayerState()),
      setDefaultLayer: (layer) => this.run(() => client.set_default_layer(layer)),
      getLayerMetadata: (layer) => this.run(() => client.get_layer_metadata(layer)),
      setLayerMetadata: (layer, metadata) =>
        this.run(() => client.set_layer_metadata(layer, metadata)),
    };

    this.lighting = {
      capabilities: () => this.run(() => client.get_lighting_capabilities()),
      state: () => this.run(() => client.get_lighting_state()),
      outputMode: () => this.run(() => this.readOutputMode()),
      topology: () => this.run(() => this.readTopology()),
      replaceOverlay: (cells) => this.run(() => this.replaceOverlayCells(cells)),
      clearOverlay: () =>
        this.run(async () => {
          const state = await client.get_lighting_state();
          return client.clear_lighting_overlay({ expected_revision: state.revision });
        }),
      readOverlay: () => this.run(() => readLightingOverlay(client)),
      setState: (state) => this.run(() => this.setLightingState(state)),
      setWakeLayers: (layers) =>
        this.run(async () => {
          const state = await client.get_lighting_state();
          return client.set_lighting_wake_layers({
            expected_revision: state.revision,
            layers,
          });
        }),
      extension: () => this.run(() => this.readExtension()),
      extensionLayers: () => this.run(() => this.client.get_lighting_extension_layers()),
      extensionNames: (kind) => this.run(() => this.readExtensionNames(kind)),
      setExtensionState: (state) => this.run(() => this.setExtensionSelection(state)),
      setExtensionLayers: (overlay) => this.run(() => this.setExtensionLayers(overlay)),
      extensionParams: (effect) => this.run(() => this.readExtensionParams(effect)),
      setExtensionParam: (effect, index, value) =>
        this.run(() => this.setExtensionParamValue(effect, index, value)),
      scenes: {
        sceneStatus: () => this.run(() => this.readSceneStatus()),
        readScenes: () => this.run(() => this.readAllScenes()),
        replaceScenes: (cells) => this.run(() => this.replaceSceneCells(cells)),
        setLayerPolicy: (policy) => this.run(() => this.setSceneLayerPolicy(policy)),
        compiledStatus: () => this.run(() => this.readCompiledSceneStatus()),
        readCompiledScenes: () => this.run(() => this.readAllCompiledScenes()),
        conditionalStatus: () => this.run(() => this.readConditionalSceneStatus()),
        readConditionalScenes: () => this.run(() => this.readAllConditionalScenes()),
      },
      conditionalScenes: {
        status: () => this.run(() => this.readRuntimeConditionalStatus()),
        read: () => this.run(() => this.readAllRuntimeConditionalScenes()),
        replace: (cells) => this.run(() => this.replaceRuntimeConditionalCells(cells)),
      },
    };

    this.combos = {
      readAll: () => this.run(() => this.readCombos()),
      set: (index, combo) => this.run(() => client.set_combo_definition(index, combo)),
    };

    this.morse = {
      readAll: () => this.run(() => this.readMorse()),
      set: (index, morse) => this.run(() => client.set_morse(index, morse)),
    };

    this.forks = {
      readAll: () => this.run(() => this.readForks()),
      set: (index, fork) => this.run(() => client.set_fork(index, fork)),
    };

    this.macros = {
      read: () => this.run(() => this.readMacroRegion()),
      write: (data) => this.run(() => this.writeMacroRegion(data)),
    };

    this.behavior = {
      get: () => this.run(() => client.get_behavior()),
      set: (config) => this.run(() => client.set_behavior(config)),
      options: () => this.run(() => client.get_behavior_options()),
      setOptions: (options) => this.run(() => client.set_behavior_options(options)),
      profiles: () => this.run(() => client.read_morse_profile_state()),
      setProfile: (entry) => this.run(() => client.set_morse_profile_entry({ entry })),
      deleteProfile: (index) => this.run(() => client.delete_morse_profile(index)),
      holdTriggerPositions: () =>
        this.run(() => client.get_morse_hold_trigger_positions()),
      setHoldTriggerPositions: (positions) =>
        this.run(() => client.set_morse_hold_trigger_positions({ positions })),
      autoMouseLayers: () => this.run(() => client.get_auto_mouse_layer_configs()),
      setAutoMouseLayers: (configs) =>
        this.run(() => client.set_auto_mouse_layer_configs({ configs })),
    };

    this.pointing = {
      get: () => this.run(() => client.get_pointing_config()),
      set: (config: PointingConfig) => this.run(() => client.set_pointing_config(config)),
    };
  }

  onTopic(handler: (event: TopicEvent) => void): void {
    this.topicHandler = handler;
  }

  onDisconnect(handler: () => void): void {
    this.disconnectHandler = handler;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.log.event("session closed");
    this.unwatchDisconnect();
    // Ending the link rejects the parked next_topic and any in-flight
    // request; only free the wasm handle once both have settled.
    await this.link.close();
    await this.queue;
    await this.pumpDone;
    this.client.free();
  }

  /** Serialize ops: the protocol allows a single request in flight. */
  /** Tear down a link we can no longer trust: ending it rejects the parked
   *  topic pull and any in-flight request, and the UI is told the device is
   *  gone so it can offer a reconnect. */
  private failLink(): void {
    this.log.event("link ended after a request timed out — the device stopped answering");
    this.link.end();
    if (!this.closed) this.disconnectHandler?.();
  }

  private run<T>(op: () => Promise<T>): Promise<T> {
    const next = this.queue.then(op, op);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async pumpTopics(): Promise<void> {
    for (;;) {
      let event: TopicEvent;
      try {
        event = await this.client.next_topic();
      } catch {
        return; // link died or session closed
      }
      if (this.closed) return;
      this.topicHandler?.(event);
    }
  }

  private async readAllLayers(): Promise<LayerKeymap[]> {
    const caps = await this.client.get_capabilities();
    const perLayer = caps.num_rows * caps.num_cols;
    const layers: LayerKeymap[] = [];
    for (let layer = 0; layer < caps.num_layers; layer++) {
      const actions: KeyAction[] = [];
      if (caps.bulk_transfer_supported) {
        while (actions.length < perLayer) {
          const row = Math.floor(actions.length / caps.num_cols);
          const col = actions.length % caps.num_cols;
          const page = await this.client.get_keymap_bulk(layer, row, col);
          if (page.actions.length === 0) {
            throw new Error(`keymap bulk read stalled at layer ${layer}, key ${actions.length}`);
          }
          actions.push(...page.actions.slice(0, perLayer - actions.length));
        }
      } else {
        for (let key = 0; key < perLayer; key++) {
          actions.push(
            await this.client.get_key(layer, Math.floor(key / caps.num_cols), key % caps.num_cols),
          );
        }
      }
      layers.push({ layer, actions });
    }
    return layers;
  }

  private async replaceAllLayers(layers: LayerKeymap[]): Promise<void> {
    const caps = await this.client.get_capabilities();
    const perLayer = caps.num_rows * caps.num_cols;
    if (layers.length !== caps.num_layers) {
      throw new Error(`keymap write has ${layers.length} layers; expected ${caps.num_layers}`);
    }
    let bulkCapacity = 0;
    if (caps.bulk_transfer_supported && perLayer > 0) {
      bulkCapacity = (await this.client.get_keymap_bulk(0, 0, 0)).actions.length;
      if (bulkCapacity < 1) throw new Error("keymap bulk endpoint returned an empty page");
    }
    for (let layer = 0; layer < caps.num_layers; layer += 1) {
      const actions = layers[layer]?.actions;
      if (layers[layer]?.layer !== layer || actions.length !== perLayer) {
        throw new Error(`keymap write omitted or malformed layer ${layer}`);
      }
      if (bulkCapacity > 0) {
        for (let start = 0; start < perLayer; start += bulkCapacity) {
          await this.client.set_keymap_bulk({
            layer,
            start_row: Math.floor(start / caps.num_cols),
            start_col: start % caps.num_cols,
            actions: actions.slice(start, start + bulkCapacity),
          });
        }
      } else {
        for (let key = 0; key < perLayer; key += 1) {
          await this.client.set_key(
            layer,
            Math.floor(key / caps.num_cols),
            key % caps.num_cols,
            actions[key],
          );
        }
      }
    }
  }

  private async readLayerState(): Promise<LayerSnapshot> {
    try {
      return decodeLayerState(await this.client.get_layer_state());
    } catch {
      // Older firmware exposes only the highest active layer and the default.
      const current = await this.client.get_current_layer();
      const defaultLayer = await this.client.get_default_layer();
      return {
        defaultLayer,
        activeLayers: [...new Set([defaultLayer, current])],
        complete: false,
      };
    }
  }

  private async readCombos(): Promise<ComboDefinition[]> {
    const caps = await this.client.get_capabilities();
    return this.readSlotTable(
      caps,
      caps.max_combos,
      async (start) => (await this.client.get_combo_definition_bulk(start)).definitions,
      (index) => this.client.get_combo_definition(index),
    );
  }

  private async readMorse(): Promise<Morse[]> {
    const caps = await this.client.get_capabilities();
    return this.readSlotTable(
      caps,
      caps.max_morse,
      async (start) => (await this.client.get_morse_bulk(start)).configs,
      (index) => this.client.get_morse(index),
    );
  }

  private async readForks(): Promise<Fork[]> {
    // No bulk endpoint for forks; always per-index.
    const caps = await this.client.get_capabilities();
    const forks: Fork[] = [];
    for (let index = 0; index < caps.max_forks; index++) {
      forks.push(await this.client.get_fork(index));
    }
    return forks;
  }

  private async readSlotTable<T>(
    caps: DeviceCapabilities,
    total: number,
    bulk: (startIndex: number) => Promise<T[]>,
    single: (index: number) => Promise<T>,
  ): Promise<T[]> {
    const items: T[] = [];
    if (caps.bulk_transfer_supported) {
      while (items.length < total) {
        const page = await bulk(items.length);
        if (page.length === 0) {
          throw new Error(`bulk slot read stalled at slot ${items.length} of ${total}`);
        }
        items.push(...page.slice(0, total - items.length));
      }
    } else {
      for (let index = 0; index < total; index++) {
        items.push(await single(index));
      }
    }
    return items;
  }

  private async readMacroRegion(): Promise<Uint8Array> {
    const caps = await this.client.get_capabilities();
    if (caps.macro_space_size === 0) return new Uint8Array(0);
    const region = new Uint8Array(caps.macro_space_size);
    let offset = 0;
    while (offset < caps.macro_space_size) {
      const chunk = await this.client.get_macro(offset);
      if (chunk.data.length === 0) {
        throw new Error(`macro read stalled at byte ${offset} of ${caps.macro_space_size}`);
      }
      const take = chunk.data.slice(0, caps.macro_space_size - offset);
      region.set(take, offset);
      offset += take.length;
    }
    return region;
  }

  private async writeMacroRegion(data: Uint8Array): Promise<void> {
    const caps = await this.client.get_capabilities();
    if (caps.macro_space_size === 0) {
      if (data.length > 0) throw new Error("device has no macro storage");
      return;
    }
    if (data.length > caps.macro_space_size) {
      throw new Error(
        `macro data (${data.length} bytes) exceeds device region (${caps.macro_space_size} bytes)`,
      );
    }
    const step = Math.max(1, caps.macro_chunk_size);
    for (let offset = 0; offset < data.length; offset += step) {
      await this.client.set_macro(offset, {
        data: Array.from(data.subarray(offset, offset + step)),
      });
    }
  }

  private async setLightingState(state: LightingMutableState): Promise<LightingState> {
    // Same revision handshake as clearOverlay, with one retry: if the
    // revision moved between our read and the write, re-read and try once
    // more before surfacing the conflict.
    const current = await this.client.get_lighting_state();
    try {
      return await this.client.set_lighting_state({
        expected_revision: current.revision,
        state,
      });
    } catch (error) {
      if (!String(error).includes("RevisionConflict")) throw error;
      const fresh = await this.client.get_lighting_state();
      return this.client.set_lighting_state({ expected_revision: fresh.revision, state });
    }
  }

  private async readTopology(): Promise<LightingTopology> {
    let lastDrift: unknown;
    for (let attempt = 0; attempt < TOPOLOGY_READ_ATTEMPTS; attempt++) {
      const caps = await this.client.get_lighting_capabilities();
      try {
        return await this.readTopologyAt(caps);
      } catch (error) {
        if (!isRevisionConflict(error)) throw error;
        lastDrift = error;
      }
    }
    throw new Error(
      `lighting topology kept changing across ${TOPOLOGY_READ_ATTEMPTS} read attempts`,
      { cause: lastDrift },
    );
  }

  private async readTopologyAt(caps: LightingCapabilities): Promise<LightingTopology> {
    const revision = caps.topology_revision;
    return {
      revision,
      keys: await this.readPages(
        (r) => this.client.get_lighting_keys(r),
        revision,
        caps.logical_key_count,
      ),
      physicalKeys: await this.readPages(
        (r) => this.client.get_lighting_physical_keys(r),
        revision,
        caps.physical_key_count,
      ),
      leds: await this.readPages((r) => this.client.get_lighting_leds(r), revision, caps.led_count),
      routes: await this.readPages(
        (r) => this.client.get_lighting_routes(r),
        revision,
        caps.route_count,
      ),
      zones: await this.readPages(
        (r) => this.client.get_lighting_zones(r),
        revision,
        caps.zone_count,
      ),
      zoneMemberships: await this.readPages(
        (r) => this.client.get_lighting_zone_memberships(r),
        revision,
        caps.zone_membership_count,
      ),
    };
  }

  private async readPages<T>(
    fetch: (request: LightingPageRequest) => Promise<LightingPage<T>>,
    revision: number,
    total: number,
  ): Promise<T[]> {
    const items: T[] = [];
    while (items.length < total) {
      const page = await fetch({ topology_revision: revision, offset: items.length });
      if (page.topology_revision !== revision || page.total_count !== total) {
        throw new TopologyDrift(revision, page.topology_revision);
      }
      if (page.items.length === 0) {
        throw new Error(`lighting topology page stalled at item ${items.length} of ${total}`);
      }
      items.push(...page.items);
    }
    return items;
  }

  private async replaceOverlayCells(cells: LightingOverlayCell[]): Promise<LightingState> {
    const chunkCapacity = await this.overlayChunkCapacity();
    const state = await this.client.get_lighting_state();
    const transaction = await this.client.begin_lighting_overlay_replace({
      expected_revision: state.revision,
      cell_count: cells.length,
    });
    try {
      for (let offset = 0; offset < cells.length; offset += chunkCapacity) {
        await this.client.put_lighting_overlay_chunk({
          transaction_id: transaction.id,
          offset,
          cells: cells.slice(offset, offset + chunkCapacity),
        });
      }
      return await this.client.commit_lighting_overlay_replace({
        transaction_id: transaction.id,
      });
    } catch (error) {
      await this.client
        .abort_lighting_overlay_replace({ transaction_id: transaction.id })
        .catch(() => undefined);
      throw error;
    }
  }

  private async overlayChunkCapacity(): Promise<number> {
    if (this.chunkCapacity === null) {
      const caps = await this.client.get_lighting_capabilities();
      this.chunkCapacity = Math.max(1, caps.overlay_chunk_capacity);
    }
    return this.chunkCapacity;
  }

  private async readSceneStatus(): Promise<LightingSceneStatus> {
    // Feature-gate before touching the endpoint: pre-scene firmware would
    // reject the unknown request with an opaque protocol error.
    const caps = await this.client.get_lighting_capabilities();
    if ((caps.features & LAYER_SCENES) === 0) {
      throw new Error("this firmware does not support on-device layer scenes");
    }
    return this.client.get_lighting_scene_status();
  }

  private async readAllScenes(): Promise<LightingSceneCell[]> {
    // Scene pages are pinned to the lighting state revision; a mutation
    // mid-read rejects the stale page, so restart the whole read.
    let lastConflict: unknown;
    for (let attempt = 0; attempt < SCENE_READ_ATTEMPTS; attempt++) {
      const status = await this.readSceneStatus();
      try {
        const cells: LightingSceneCell[] = [];
        while (cells.length < status.scene_len) {
          const page = await this.client.get_lighting_scenes({
            revision: status.revision,
            offset: cells.length,
          });
          if (page.revision !== status.revision || page.total_count !== status.scene_len) {
            throw new Error(
              `StateRevisionConflict: scene table changed mid-read (${status.revision} -> ${page.revision})`,
            );
          }
          if (page.items.length === 0) {
            throw new Error(`scene read stalled at cell ${cells.length} of ${status.scene_len}`);
          }
          cells.push(...page.items);
        }
        return cells;
      } catch (error) {
        if (!String(error).includes("RevisionConflict")) throw error;
        lastConflict = error;
      }
    }
    throw new Error(`scene table kept changing across ${SCENE_READ_ATTEMPTS} read attempts`, {
      cause: lastConflict,
    });
  }

  private async readCompiledSceneStatus(): Promise<LightingCompiledSceneStatus> {
    const caps = await this.client.get_lighting_capabilities();
    if ((caps.features & COMPILED_LAYER_SCENES) === 0) {
      throw new Error("this firmware does not support compiled layer-scene readback");
    }
    return this.client.get_lighting_compiled_scene_status();
  }

  private async readAllCompiledScenes(): Promise<LightingSceneCell[]> {
    // The immutable table is topology-pinned. A firmware/topology change in
    // the middle of paging restarts from a fresh status snapshot.
    let lastConflict: unknown;
    for (let attempt = 0; attempt < TOPOLOGY_READ_ATTEMPTS; attempt++) {
      const status = await this.readCompiledSceneStatus();
      try {
        return await this.readPages(
          (request) => this.client.get_lighting_compiled_scenes(request),
          status.topology_revision,
          status.scene_len,
        );
      } catch (error) {
        if (!isRevisionConflict(error)) throw error;
        lastConflict = error;
      }
    }
    throw new Error(
      `compiled scene topology kept changing across ${TOPOLOGY_READ_ATTEMPTS} read attempts`,
      { cause: lastConflict },
    );
  }

  private async readConditionalSceneStatus(): Promise<LightingConditionalSceneStatus> {
    const caps = await this.client.get_lighting_capabilities();
    if ((caps.features & COMPILED_CONDITIONAL_SCENES) === 0) {
      throw new Error("this firmware does not support conditional-scene readback");
    }
    return this.client.get_lighting_conditional_scene_status();
  }

  private async readOutputMode(): Promise<LightingOutputModeState> {
    const caps = await this.client.get_lighting_capabilities();
    if ((caps.features & OUTPUT_MODE) === 0) {
      throw new Error("this firmware does not support lighting output-mode readback");
    }
    return this.client.get_lighting_output_mode();
  }

  private async readExtension(): Promise<LightingExtension> {
    // Feature-gate before touching the endpoint, like readOutputMode: older
    // firmware would reject the unknown request with an opaque protocol error.
    const caps = await this.client.get_lighting_capabilities();
    if ((caps.features & EXTENSION_EFFECTS) === 0) {
      throw new Error("this firmware does not support extension effects");
    }
    return this.client.get_lighting_extension();
  }

  private async readExtensionNames(kind: LightingExtensionNameKind): Promise<string[]> {
    // Feature-gate before touching the names endpoint on older firmware.
    const extension = await this.readExtension();
    return readLightingExtensionNames(this.client, kind, extension);
  }

  private async readExtensionParams(effect: number): Promise<LightingExtensionParam[]> {
    // Feature-gate the effect pack itself; firmware that has the pack but
    // predates per-effect parameters rejects the request below, which callers
    // treat as "no parameter surface" rather than an error to surface.
    await this.readExtension();
    return readLightingExtensionParams(this.client, effect);
  }

  private async setExtensionParamValue(
    effect: number,
    index: number,
    value: number,
  ): Promise<LightingState> {
    // Same one-retry revision handshake as setExtensionSelection.
    const current = await this.client.get_lighting_state();
    try {
      return await this.client.set_lighting_extension_param({
        expected_revision: current.revision,
        effect,
        index,
        value,
      });
    } catch (error) {
      if (!String(error).includes("RevisionConflict")) throw error;
      const fresh = await this.client.get_lighting_state();
      return this.client.set_lighting_extension_param({
        expected_revision: fresh.revision,
        effect,
        index,
        value,
      });
    }
  }

  private async setExtensionSelection(state: LightingExtensionState): Promise<LightingState> {
    // Same one-retry revision handshake as setLightingState.
    const current = await this.readExtension();
    try {
      return await this.client.set_lighting_extension_state({
        expected_revision: current.revision,
        state,
      });
    } catch (error) {
      if (!String(error).includes("RevisionConflict")) throw error;
      const fresh = await this.client.get_lighting_extension();
      return this.client.set_lighting_extension_state({
        expected_revision: fresh.revision,
        state,
      });
    }
  }

  private async setExtensionLayers(overlay: number | undefined): Promise<LightingState> {
    const current = await this.client.get_lighting_extension_layers();
    try {
      return await this.client.set_lighting_extension_layers({
        expected_revision: current.revision,
        overlay,
      });
    } catch (error) {
      if (!String(error).includes("RevisionConflict")) throw error;
      const fresh = await this.client.get_lighting_extension_layers();
      return this.client.set_lighting_extension_layers({
        expected_revision: fresh.revision,
        overlay,
      });
    }
  }

  private async readAllConditionalScenes(): Promise<LightingConditionalSceneCell[]> {
    let lastConflict: unknown;
    for (let attempt = 0; attempt < TOPOLOGY_READ_ATTEMPTS; attempt++) {
      const status = await this.readConditionalSceneStatus();
      try {
        return await this.readPages(
          (request) => this.client.get_lighting_conditional_scenes(request),
          status.topology_revision,
          status.cell_len,
        );
      } catch (error) {
        if (!isRevisionConflict(error)) throw error;
        lastConflict = error;
      }
    }
    throw new Error(
      `conditional scene topology kept changing across ${TOPOLOGY_READ_ATTEMPTS} read attempts`,
      { cause: lastConflict },
    );
  }

  private async readRuntimeConditionalStatus(): Promise<LightingRuntimeConditionalSceneStatus> {
    return readLightingRuntimeConditionalStatus(this.client);
  }

  /** Whether this firmware speaks the extended conditional cell. */
  private async extendedConditionalsSupported(): Promise<boolean> {
    const caps = await this.client.get_lighting_capabilities();
    return (caps.features & RUNTIME_EFFECTS_CONDITIONS) !== 0;
  }

  private async readAllRuntimeConditionalScenes(): Promise<
    LightingExtendedConditionalSceneCell[]
  > {
    await this.readRuntimeConditionalStatus();
    if (await this.extendedConditionalsSupported()) {
      return readLightingExtendedRuntimeConditionalScenes(this.client);
    }
    // Legacy firmware stores no connection or effects predicate, so widening
    // its cells loses nothing.
    const cells = await readLightingRuntimeConditionalScenes(this.client);
    return cells.map((cell) => ({ cell, connection: undefined, effects: undefined }));
  }

  private async replaceRuntimeConditionalCells(
    cells: LightingExtendedConditionalSceneCell[],
  ): Promise<LightingState> {
    // Same shape as replaceSceneCells: one atomic replacement, staged in
    // chunk-sized pages under the revision the status pinned, with a
    // best-effort abort so a failed stage never leaves a dangling transaction.
    const status = await this.readRuntimeConditionalStatus();
    const chunkCapacity = Math.max(1, status.chunk_capacity);
    const extended = await this.extendedConditionalsSupported();
    if (!extended) {
      // Refuse rather than write a table the firmware would store without its
      // predicates. Dropping them silently is the exact failure this path
      // exists to prevent, and the rule would then match unconditionally.
      const gated = cells.findIndex(
        (cell) => cell.connection !== undefined || cell.effects !== undefined,
      );
      if (gated !== -1) {
        throw new Error(
          `rule ${gated + 1} names a connection or effects condition, which this ` +
            `firmware cannot store; update the firmware or remove the condition`,
        );
      }
    }
    const transaction = extended
      ? await this.client.begin_lighting_extended_runtime_conditional_scene_replace({
          expected_revision: status.revision,
          cell_count: cells.length,
        })
      : await this.client.begin_lighting_runtime_conditional_scene_replace({
          expected_revision: status.revision,
          cell_count: cells.length,
        });
    try {
      for (let offset = 0; offset < cells.length; offset += chunkCapacity) {
        const chunk = cells.slice(offset, offset + chunkCapacity);
        if (extended) {
          await this.client.put_lighting_extended_runtime_conditional_scene_chunk({
            transaction_id: transaction.id,
            offset,
            cells: chunk,
          });
        } else {
          await this.client.put_lighting_runtime_conditional_scene_chunk({
            transaction_id: transaction.id,
            offset,
            cells: chunk.map((entry) => entry.cell),
          });
        }
      }
      return extended
        ? await this.client.commit_lighting_extended_runtime_conditional_scene_replace({
            transaction_id: transaction.id,
          })
        : await this.client.commit_lighting_runtime_conditional_scene_replace({
            transaction_id: transaction.id,
          });
    } catch (error) {
      const abort = extended
        ? this.client.abort_lighting_extended_runtime_conditional_scene_replace({
            transaction_id: transaction.id,
          })
        : this.client.abort_lighting_runtime_conditional_scene_replace({
            transaction_id: transaction.id,
          });
      await abort.catch(() => undefined);
      throw error;
    }
  }

  private async replaceSceneCells(cells: LightingSceneCell[]): Promise<LightingState> {
    const status = await this.readSceneStatus();
    const chunkCapacity = Math.max(1, status.chunk_capacity);
    const transaction = await this.client.begin_lighting_scene_replace({
      expected_revision: status.revision,
      cell_count: cells.length,
    });
    try {
      for (let offset = 0; offset < cells.length; offset += chunkCapacity) {
        await this.client.put_lighting_scene_chunk({
          transaction_id: transaction.id,
          offset,
          cells: cells.slice(offset, offset + chunkCapacity),
        });
      }
      return await this.client.commit_lighting_scene_replace({
        transaction_id: transaction.id,
      });
    } catch (error) {
      await this.client
        .abort_lighting_scene_replace({ transaction_id: transaction.id })
        .catch(() => undefined);
      throw error;
    }
  }

  private async setSceneLayerPolicy(policy: LightingLayerPolicy): Promise<LightingState> {
    // Same one-retry revision handshake as setLightingState.
    const current = await this.readSceneStatus();
    try {
      return await this.client.set_lighting_layer_policy({
        expected_revision: current.revision,
        policy,
      });
    } catch (error) {
      if (!String(error).includes("RevisionConflict")) throw error;
      const fresh = await this.client.get_lighting_scene_status();
      return this.client.set_lighting_layer_policy({ expected_revision: fresh.revision, policy });
    }
  }
}
