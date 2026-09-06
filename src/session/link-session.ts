// RynkSession over a live wasm RynkClient and a RynkByteLink — the shared
// core of every transport (WebHID, Web Serial, Web Bluetooth, native Tauri
// HID and BLE). Transports supply the link plus a disconnect watcher;
// everything protocol-shaped lives here.
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
  LightingOutputModeState,
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
import {
  COMPILED_CONDITIONAL_SCENES,
  COMPILED_LAYER_SCENES,
  EXTENSION_EFFECTS,
  LAYER_SCENES,
  OUTPUT_MODE,
  RUNTIME_CONDITIONAL_SCENES,
  RUNTIME_EFFECTS_CONDITIONS,
  hasLightingFeature,
} from "./lighting-features";
import { unsupported } from "./unsupported";

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

/** Polled many times a second by the matrix tester and live view; recording
 *  each success would evict everything else from the diagnostics ring within
 *  seconds. Failures and timeouts are still recorded. */
const QUIET_CALLS = new Set(["get_matrix_state"]);

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
    assertOpen,
  }: {
    timeoutMs: number;
    onTimeout: (op: string) => void;
    log?: SessionLog;
    assertOpen?: () => void;
  },
): T {
  if (timeoutMs <= 0 && !log && !assertOpen) return client;
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== "function" || UNWATCHED_CALLS.has(String(prop))) return value;
      const op = String(prop);
      return (...args: unknown[]) => {
        assertOpen?.();
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
          let finished = false;
          const timer =
            timeoutMs > 0
              ? setTimeout(() => {
                  finished = true;
                  const failure = new RequestTimeout(op, timeoutMs);
                  record("timeout", failure);
                  onTimeout(op);
                  reject(failure);
                }, timeoutMs)
              : undefined;
          result.then(
            (settled) => {
              if (finished) return;
              finished = true;
              clearTimeout(timer);
              if (!QUIET_CALLS.has(op)) record("ok");
              resolve(settled);
            },
            (error: unknown) => {
              if (finished) return;
              finished = true;
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

interface OverlayReadClient {
  get_lighting_state(): Promise<LightingState>;
  get_lighting_overlay(request: LightingOverlayPageRequest): Promise<LightingOverlayPage>;
}

/** A table whose pages are pinned to a lighting-state revision reported by a
 *  status endpoint: scenes and both runtime conditional tables share this
 *  shape and therefore one reader. */
interface PinnedTablePager<Cell> {
  status(): Promise<{ revision: number; total: number }>;
  page(request: { revision: number; offset: number }): Promise<{
    revision: number;
    total_count: number;
    items: Cell[];
  }>;
}

/** The begin/put-chunks/commit protocol every atomic table replacement
 *  follows; only the endpoint names differ. */
interface ChunkedReplace<Cell> {
  begin(expectedRevision: number, cellCount: number): Promise<{ id: number }>;
  put(transactionId: number, offset: number, cells: Cell[]): Promise<void>;
  commit(transactionId: number): Promise<LightingState>;
  abort(transactionId: number): Promise<void>;
}

const READ_ATTEMPTS = 3;

// The firmware rejects a stale-pinned request with a serialized LightingError
// naming the conflict (State- or TopologyRevisionConflict); reads that notice
// drift themselves throw the same marker so one predicate covers both.
function isRevisionConflict(error: unknown): boolean {
  return String(error).includes("RevisionConflict");
}

function isTransientReadError(error: unknown): boolean {
  const message = String(error);
  return (
    message.includes("response decode failed") ||
    message.includes("did not answer") ||
    message.includes("Transport") ||
    message.includes("transport") ||
    message.includes("link died")
  );
}

/** Compare-and-set against a revision: write under the revision `read`
 *  reports, and if the device says that revision has moved in the meantime,
 *  re-read once and try again before surfacing the conflict. */
async function withRevisionRetry<T>(
  read: () => Promise<{ revision: number }>,
  write: (expectedRevision: number) => Promise<T>,
): Promise<T> {
  const current = await read();
  try {
    return await write(current.revision);
  } catch (error) {
    if (!isRevisionConflict(error)) throw error;
    return write((await read()).revision);
  }
}

/** One atomic table replacement, staged in chunk-sized pages under a pinned
 *  revision, with a best-effort abort so a failed stage never leaves a
 *  dangling transaction on the device. */
async function replaceInChunks<Cell>(
  transaction: ChunkedReplace<Cell>,
  expectedRevision: number,
  cells: Cell[],
  chunkCapacity: number,
): Promise<LightingState> {
  const step = Math.max(1, chunkCapacity);
  const { id } = await transaction.begin(expectedRevision, cells.length);
  try {
    for (let offset = 0; offset < cells.length; offset += step) {
      await transaction.put(id, offset, cells.slice(offset, offset + step));
    }
    return await transaction.commit(id);
  } catch (error) {
    await transaction.abort(id).catch(() => undefined);
    throw error;
  }
}

/** Retry a read whose pages are pinned to a revision the device may move
 *  underneath it. `read` is restarted from scratch on drift, and on transient
 *  transport faults when `transient` is set; anything else propagates. */
async function retryOnDrift<T>(
  what: string,
  read: () => Promise<T>,
  { attempts = READ_ATTEMPTS, transient = false } = {},
): Promise<T> {
  let lastError: unknown;
  let onlyConflicts = true;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await read();
    } catch (error) {
      const conflict = isRevisionConflict(error);
      if (!conflict && !(transient && isTransientReadError(error))) throw error;
      lastError = error;
      onlyConflicts &&= conflict;
    }
  }
  throw new Error(
    onlyConflicts
      ? `${what} kept changing across ${attempts} read attempts`
      : `${what} read failed across ${attempts} attempts`,
    { cause: lastError },
  );
}

/** Read one coherent snapshot of a revision-pinned table: page under the
 *  revision the status reported, restarting from a fresh status if a mutation
 *  moves that revision mid-read. Order is preserved exactly — conditional
 *  rules compose in table order, so reordering them would change what the
 *  keyboard renders. */
async function readPinnedTable<Cell>(
  what: string,
  pager: PinnedTablePager<Cell>,
  attempts = READ_ATTEMPTS,
): Promise<Cell[]> {
  return retryOnDrift(
    `${what} table`,
    async () => {
      // Request the status even for an empty table: besides pinning the
      // revision, it probes endpoint support on firmware without the surface.
      const status = await pager.status();
      const cells: Cell[] = [];
      while (cells.length < status.total) {
        const page = await pager.page({ revision: status.revision, offset: cells.length });
        if (page.revision !== status.revision || page.total_count !== status.total) {
          throw new Error(
            `StateRevisionConflict: ${what} table changed mid-read ` +
              `(${status.revision} -> ${page.revision})`,
          );
        }
        if (page.items.length === 0) {
          throw new Error(`${what} read stalled at cell ${cells.length} of ${status.total}`);
        }
        if (cells.length + page.items.length > status.total) {
          throw new Error(`${what} page exceeded advertised total ${status.total}`);
        }
        cells.push(...page.items);
      }
      return cells;
    },
    { attempts, transient: true },
  );
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
  attempts = READ_ATTEMPTS,
): Promise<LightingOverlayCell[]> {
  return retryOnDrift(
    "lighting overlay",
    async () => {
      const state = await client.get_lighting_state();
      const cells: LightingOverlayCell[] = [];
      let offset = 0;
      let firstPage = true;
      // Request one page even for an empty overlay. Besides returning the
      // empty snapshot, this probes endpoint support on older firmware.
      while (firstPage || offset < state.overlay_len) {
        firstPage = false;
        const page = await client.get_lighting_overlay({ revision: state.revision, offset });
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
    },
    { attempts },
  );
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
  attempts = READ_ATTEMPTS,
): Promise<LightingExtensionParam[]> {
  return retryOnDrift(
    "extension parameters",
    async () => {
      const params: LightingExtensionParam[] = [];
      let revision: number | null = null;
      let total: number | null = null;
      while (total === null || params.length < total) {
        const page = await client.get_lighting_extension_params({
          effect,
          offset: params.length,
        });
        if (revision === null) {
          revision = page.revision;
          total = page.total;
        } else if (page.revision !== revision) {
          throw new Error(
            `StateRevisionConflict: extension parameters changed mid-read ` +
              `(${revision} -> ${page.revision})`,
          );
        } else if (page.total !== total) {
          throw new Error(
            `extension parameter list disagrees with itself (${page.total} vs ${total})`,
          );
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
      return params;
    },
    { attempts },
  );
}

export async function readLightingRuntimeConditionalScenes(
  client: RuntimeConditionalClient,
  attempts = READ_ATTEMPTS,
): Promise<LightingConditionalSceneCell[]> {
  return readPinnedTable(
    "runtime conditional",
    {
      status: async () => {
        const status = await client.get_lighting_runtime_conditional_scene_status();
        return { revision: status.revision, total: status.cell_len };
      },
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
  attempts = READ_ATTEMPTS,
): Promise<LightingExtendedConditionalSceneCell[]> {
  return readPinnedTable(
    "runtime conditional",
    {
      status: async () => {
        const status = await client.get_lighting_extended_runtime_conditional_scene_status();
        return { revision: status.revision, total: status.cell_len };
      },
      page: (request) => client.get_lighting_extended_runtime_conditional_scenes(request),
    },
    attempts,
  );
}

export async function readLightingRuntimeConditionalStatus(
  client: RuntimeConditionalStatusClient,
): Promise<LightingRuntimeConditionalSceneStatus> {
  const caps = await client.get_lighting_capabilities();
  if (!hasLightingFeature(caps, RUNTIME_CONDITIONAL_SCENES)) {
    throw unsupported("runtime conditional scenes");
  }
  return hasLightingFeature(caps, RUNTIME_EFFECTS_CONDITIONS)
    ? client.get_lighting_extended_runtime_conditional_scene_status()
    : client.get_lighting_runtime_conditional_scene_status();
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
  private closing: Promise<void> | null = null;
  // Both capability records are fixed for the life of the firmware build, so
  // one read serves the session. (The lighting record's topology_revision is
  // the one field that can move; readers that pin on it fetch it fresh.)
  private caps: Promise<DeviceCapabilities> | null = null;
  private lightingCaps: Promise<LightingCapabilities> | null = null;
  private topicHandler: ((event: TopicEvent) => void) | null = null;
  private disconnectHandler: (() => void) | null = null;

  constructor(client: RynkClient, link: RynkByteLink, hooks: LinkSessionHooks) {
    // Every op below closes over this binding, so the watchdog has to replace
    // it before any of them are built.
    client = watchdogClient(client, {
      timeoutMs: hooks.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
      onTimeout: () => this.failLink(),
      log: hooks.log ?? sessionLog,
      assertOpen: () => this.assertOpen(),
    });
    this.log = hooks.log ?? sessionLog;
    this.log.event(`session opened on ${hooks.kind} (${link.label})`);
    this.client = client;
    this.link = link;
    this.kind = hooks.kind;
    this.label = link.label;

    this.unwatchDisconnect = hooks.watchDisconnect(() => {
      this.log.event("device unplugged");
      this.endDisconnected();
    });
    this.pumpDone = this.pumpTopics();

    this.device = {
      info: () => this.run(() => client.get_device_info()),
      capabilities: () => this.run(() => this.capabilities()),
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
      capabilities: () => this.run(() => this.lightingCapabilities()),
      state: () => this.run(() => client.get_lighting_state()),
      outputMode: () => this.run(() => this.readOutputMode()),
      setWakeLayers: (layers) => this.run(() => this.setLightingWakeLayers(layers)),
      topology: () => this.run(() => this.readTopology()),
      replaceOverlay: (cells) => this.run(() => this.replaceOverlayCells(cells)),
      clearOverlay: () =>
        this.run(() =>
          withRevisionRetry(
            () => client.get_lighting_state(),
            (expected_revision) => client.clear_lighting_overlay({ expected_revision }),
          ),
        ),
      readOverlay: () => this.run(() => readLightingOverlay(client)),
      setState: (state) =>
        this.run(() =>
          withRevisionRetry(
            () => client.get_lighting_state(),
            (expected_revision) => client.set_lighting_state({ expected_revision, state }),
          ),
        ),
      extension: () => this.run(() => this.readExtension()),
      extensionLayers: () => this.run(() => client.get_lighting_extension_layers()),
      extensionNames: (kind) => this.run(() => this.readExtensionNames(kind)),
      setExtensionState: (state) =>
        this.run(() =>
          withRevisionRetry(
            () => this.readExtension(),
            (expected_revision) =>
              client.set_lighting_extension_state({ expected_revision, state }),
          ),
        ),
      setExtensionLayers: (overlay) =>
        this.run(() =>
          withRevisionRetry(
            () => client.get_lighting_extension_layers(),
            (expected_revision) =>
              client.set_lighting_extension_layers({ expected_revision, overlay }),
          ),
        ),
      extensionParams: (effect) => this.run(() => this.readExtensionParams(effect)),
      setExtensionParam: (effect, index, value) =>
        this.run(() =>
          withRevisionRetry(
            () => client.get_lighting_state(),
            (expected_revision) =>
              client.set_lighting_extension_param({ expected_revision, effect, index, value }),
          ),
        ),
      scenes: {
        sceneStatus: () => this.run(() => this.readSceneStatus()),
        readScenes: () => this.run(() => this.readAllScenes()),
        replaceScenes: (cells) => this.run(() => this.replaceSceneCells(cells)),
        setLayerPolicy: (policy) =>
          this.run(() =>
            withRevisionRetry(
              () => this.readSceneStatus(),
              (expected_revision) =>
                client.set_lighting_layer_policy({ expected_revision, policy }),
            ),
          ),
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
      capabilities: () => this.run(() => client.get_pointing_capabilities()),
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

  close(): Promise<void> {
    this.closing ??= this.finishClose();
    return this.closing;
  }

  private async finishClose(): Promise<void> {
    this.closed = true;
    this.log.event("session closed");
    this.unwatchDisconnect();
    // Ending the link rejects the parked next_topic and any in-flight
    // request; only free the wasm handle once both have settled.
    this.link.end();
    try {
      await this.link.close();
    } finally {
      await this.queue;
      await this.pumpDone;
      this.client.free();
    }
  }

  /** Tear down a link we can no longer trust: ending it rejects the parked
   *  topic pull and any in-flight request, and the UI is told the device is
   *  gone so it can offer a reconnect. */
  private failLink(): void {
    this.log.event("link ended after a request timed out — the device stopped answering");
    this.endDisconnected();
  }

  private endDisconnected(): void {
    if (this.closed) return;
    this.closed = true;
    this.link.end();
    this.disconnectHandler?.();
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("Session is closed");
  }

  /** Serialize ops: the protocol allows a single request in flight. */
  private run<T>(op: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error("Session is closed"));
    const next = this.queue.then(() => {
      this.assertOpen();
      return op();
    });
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

  private capabilities(): Promise<DeviceCapabilities> {
    this.caps ??= this.client.get_capabilities().catch((error: unknown) => {
      this.caps = null; // a failed read must not poison every later op
      throw error;
    });
    return this.caps;
  }

  private lightingCapabilities(): Promise<LightingCapabilities> {
    this.lightingCaps ??= this.client.get_lighting_capabilities().catch((error: unknown) => {
      this.lightingCaps = null;
      throw error;
    });
    return this.lightingCaps;
  }

  private async hasLightingFeature(flag: number): Promise<boolean> {
    return hasLightingFeature(await this.lightingCapabilities(), flag);
  }

  /** Feature-gate before touching an endpoint: firmware predating it would
   *  reject the unknown request with an opaque protocol error, whereas this
   *  rejection is one `isUnsupportedError` recognizes. */
  private async requireLightingFeature(flag: number, what: string): Promise<void> {
    if (!(await this.hasLightingFeature(flag))) throw unsupported(what);
  }

  private async readAllLayers(): Promise<LayerKeymap[]> {
    const caps = await this.capabilities();
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
    const caps = await this.capabilities();
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
    const caps = await this.capabilities();
    return this.readSlotTable(
      caps,
      caps.max_combos,
      async (start) => (await this.client.get_combo_definition_bulk(start)).definitions,
      (index) => this.client.get_combo_definition(index),
    );
  }

  private async readMorse(): Promise<Morse[]> {
    const caps = await this.capabilities();
    return this.readSlotTable(
      caps,
      caps.max_morse,
      async (start) => (await this.client.get_morse_bulk(start)).configs,
      (index) => this.client.get_morse(index),
    );
  }

  private async readForks(): Promise<Fork[]> {
    // No bulk endpoint for forks; always per-index.
    const caps = await this.capabilities();
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
    const caps = await this.capabilities();
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
    const caps = await this.capabilities();
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

  private readTopology(): Promise<LightingTopology> {
    // The pin is the capabilities record's own topology_revision, so each
    // attempt must fetch it fresh rather than from the session cache.
    return retryOnDrift("lighting topology", async () =>
      this.readTopologyAt(await this.client.get_lighting_capabilities()),
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

  /** Assemble a topology-pinned list; a page under another revision aborts
   *  the read with the same marker the firmware uses for a stale pin. */
  private async readPages<T>(
    fetch: (request: LightingPageRequest) => Promise<LightingPage<T>>,
    revision: number,
    total: number,
  ): Promise<T[]> {
    const items: T[] = [];
    while (items.length < total) {
      const page = await fetch({ topology_revision: revision, offset: items.length });
      if (page.topology_revision !== revision || page.total_count !== total) {
        throw new Error(
          `TopologyRevisionConflict: lighting topology revision changed mid-read ` +
            `(${revision} -> ${page.topology_revision})`,
        );
      }
      if (page.items.length === 0) {
        throw new Error(`lighting topology page stalled at item ${items.length} of ${total}`);
      }
      items.push(...page.items);
    }
    return items;
  }

  private async replaceOverlayCells(cells: LightingOverlayCell[]): Promise<LightingState> {
    const caps = await this.lightingCapabilities();
    const state = await this.client.get_lighting_state();
    return replaceInChunks(
      {
        begin: (expected_revision, cell_count) =>
          this.client.begin_lighting_overlay_replace({ expected_revision, cell_count }),
        put: (transaction_id, offset, chunk) =>
          this.client.put_lighting_overlay_chunk({ transaction_id, offset, cells: chunk }),
        commit: (transaction_id) => this.client.commit_lighting_overlay_replace({ transaction_id }),
        abort: (transaction_id) => this.client.abort_lighting_overlay_replace({ transaction_id }),
      },
      state.revision,
      cells,
      caps.overlay_chunk_capacity,
    );
  }

  private async readSceneStatus(): Promise<LightingSceneStatus> {
    await this.requireLightingFeature(LAYER_SCENES, "on-device layer scenes");
    return this.client.get_lighting_scene_status();
  }

  private readAllScenes(): Promise<LightingSceneCell[]> {
    return readPinnedTable("scene", {
      status: async () => {
        const status = await this.readSceneStatus();
        return { revision: status.revision, total: status.scene_len };
      },
      page: (request) => this.client.get_lighting_scenes(request),
    });
  }

  private async readCompiledSceneStatus(): Promise<LightingCompiledSceneStatus> {
    await this.requireLightingFeature(COMPILED_LAYER_SCENES, "compiled layer-scene readback");
    return this.client.get_lighting_compiled_scene_status();
  }

  private readAllCompiledScenes(): Promise<LightingSceneCell[]> {
    // The immutable table is topology-pinned. A firmware/topology change in
    // the middle of paging restarts from a fresh status snapshot.
    return retryOnDrift("compiled scene topology", async () => {
      const status = await this.readCompiledSceneStatus();
      return this.readPages(
        (request) => this.client.get_lighting_compiled_scenes(request),
        status.topology_revision,
        status.scene_len,
      );
    });
  }

  private async readConditionalSceneStatus(): Promise<LightingConditionalSceneStatus> {
    await this.requireLightingFeature(COMPILED_CONDITIONAL_SCENES, "conditional-scene readback");
    return this.client.get_lighting_conditional_scene_status();
  }

  private readAllConditionalScenes(): Promise<LightingConditionalSceneCell[]> {
    return retryOnDrift("conditional scene topology", async () => {
      const status = await this.readConditionalSceneStatus();
      return this.readPages(
        (request) => this.client.get_lighting_conditional_scenes(request),
        status.topology_revision,
        status.cell_len,
      );
    });
  }

  private async readOutputMode(): Promise<LightingOutputModeState> {
    await this.requireLightingFeature(OUTPUT_MODE, "lighting output-mode readback");
    return this.client.get_lighting_output_mode();
  }

  private async setLightingWakeLayers(layers: number): Promise<LightingOutputModeState> {
    await this.requireLightingFeature(OUTPUT_MODE, "lighting output-mode readback");
    return withRevisionRetry(
      () => this.client.get_lighting_state(),
      (expected_revision) => this.client.set_lighting_wake_layers({ expected_revision, layers }),
    );
  }

  private async readExtension(): Promise<LightingExtension> {
    await this.requireLightingFeature(EXTENSION_EFFECTS, "extension effects");
    return this.client.get_lighting_extension();
  }

  private async readExtensionNames(kind: LightingExtensionNameKind): Promise<string[]> {
    const extension = await this.readExtension();
    return readLightingExtensionNames(this.client, kind, extension);
  }

  private async readExtensionParams(effect: number): Promise<LightingExtensionParam[]> {
    // Feature-gate the effect pack itself; firmware that has the pack but
    // predates per-effect parameters rejects the request below, which callers
    // treat as "no parameter surface" rather than an error to surface.
    await this.requireLightingFeature(EXTENSION_EFFECTS, "extension effects");
    return readLightingExtensionParams(this.client, effect);
  }

  private readRuntimeConditionalStatus(): Promise<LightingRuntimeConditionalSceneStatus> {
    return readLightingRuntimeConditionalStatus({
      get_lighting_capabilities: () => this.lightingCapabilities(),
      get_lighting_runtime_conditional_scene_status: () =>
        this.client.get_lighting_runtime_conditional_scene_status(),
      get_lighting_extended_runtime_conditional_scene_status: () =>
        this.client.get_lighting_extended_runtime_conditional_scene_status(),
    });
  }

  private async readAllRuntimeConditionalScenes(): Promise<
    LightingExtendedConditionalSceneCell[]
  > {
    await this.readRuntimeConditionalStatus();
    if (await this.hasLightingFeature(RUNTIME_EFFECTS_CONDITIONS)) {
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
    const status = await this.readRuntimeConditionalStatus();
    const client = this.client;
    if (await this.hasLightingFeature(RUNTIME_EFFECTS_CONDITIONS)) {
      return replaceInChunks(
        {
          begin: (expected_revision, cell_count) =>
            client.begin_lighting_extended_runtime_conditional_scene_replace({
              expected_revision,
              cell_count,
            }),
          put: (transaction_id, offset, chunk) =>
            client.put_lighting_extended_runtime_conditional_scene_chunk({
              transaction_id,
              offset,
              cells: chunk,
            }),
          commit: (transaction_id) =>
            client.commit_lighting_extended_runtime_conditional_scene_replace({ transaction_id }),
          abort: (transaction_id) =>
            client.abort_lighting_extended_runtime_conditional_scene_replace({ transaction_id }),
        },
        status.revision,
        cells,
        status.chunk_capacity,
      );
    }
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
    return replaceInChunks(
      {
        begin: (expected_revision, cell_count) =>
          client.begin_lighting_runtime_conditional_scene_replace({
            expected_revision,
            cell_count,
          }),
        put: (transaction_id, offset, chunk) =>
          client.put_lighting_runtime_conditional_scene_chunk({
            transaction_id,
            offset,
            cells: chunk,
          }),
        commit: (transaction_id) =>
          client.commit_lighting_runtime_conditional_scene_replace({ transaction_id }),
        abort: (transaction_id) =>
          client.abort_lighting_runtime_conditional_scene_replace({ transaction_id }),
      },
      status.revision,
      cells.map((entry) => entry.cell),
      status.chunk_capacity,
    );
  }

  private async replaceSceneCells(cells: LightingSceneCell[]): Promise<LightingState> {
    const status = await this.readSceneStatus();
    return replaceInChunks(
      {
        begin: (expected_revision, cell_count) =>
          this.client.begin_lighting_scene_replace({ expected_revision, cell_count }),
        put: (transaction_id, offset, chunk) =>
          this.client.put_lighting_scene_chunk({ transaction_id, offset, cells: chunk }),
        commit: (transaction_id) => this.client.commit_lighting_scene_replace({ transaction_id }),
        abort: (transaction_id) => this.client.abort_lighting_scene_replace({ transaction_id }),
      },
      status.revision,
      cells,
      status.chunk_capacity,
    );
  }
}
