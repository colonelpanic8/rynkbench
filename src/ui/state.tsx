// Workbench state: one reducer, one context. Topic events and optimistic
// writes both funnel through dispatch; components read via useWorkbench().

import { createContext, useContext } from "react";
import type { Dispatch } from "react";
import type {
  AutoMouseLayerConfig,
  BatteryStatus,
  BehaviorConfig,
  BehaviorOptions,
  ComboDefinition,
  ConnectionStatus,
  DeviceCapabilities,
  DeviceInfo,
  EncoderAction,
  Fork,
  KeyAction,
  LedIndicator,
  LightingCapabilities,
  LightingCompiledSceneStatus,
  LightingConditionalSceneCell,
  LightingExtendedConditionalSceneCell,
  LightingControls,
  LightingExtension,
  LightingExtensionLayers,
  LightingExtensionParam,
  LightingExtensionState,
  LightingLayerPolicy,
  LightingMutableState,
  LightingOverlayCell,
  LightingOutputModeState,
  LightingRuntimeConditionalSceneStatus,
  LightingSceneCell,
  LightingSceneStatus,
  LightingState,
  ModifierCombination,
  Morse,
  MorseHoldTriggerPosition,
  MorseProfileEntry,
  BuildInfo,
  ProtocolVersion,
  PointingConfig,
  PointingCapabilities,
} from "../vendor/rynk-wasm/rynk_wasm";
import type { LayerMetadata, RynkSession } from "../session/types";
import type { KeyboardModel } from "../model/keyboard";
import {
  initialKeyEditHistory,
  reduceKeyEditHistory,
  type KeyEditHistory,
  type KeyEditHistoryEntry,
} from "./history";
import {
  planLayerDuplicate,
  planLayerRewrite,
  type LayerRewrite,
  type LayerRewriteSnapshot,
  type LayerStructureOperation,
} from "../layers/management";
import { normalizePointingConfig, pointingConfigsEqual } from "./pointing";

export type Mode =
  | "keymap"
  | "lighting"
  | "effects"
  | "live"
  | "profiles"
  | "advanced"
  | "device";

/** Which lighting surface the canvas edits: the transient overlay, or one
 *  layer's durable scene table. Only ever a number when scenes are supported. */
export type LightingTarget = "overlay" | number;

export type Selection =
  | { type: "key"; row: number; col: number }
  | { type: "encoder"; id: number }
  | { type: "pointing"; id: number };

/** Everything loaded during the connect flow, before the workbench mounts. */
export interface ConnectedBundle {
  session: RynkSession;
  /** Configuration-bearing reads that failed while opening this snapshot.
   *  Export must refuse to turn their fallback values into a lossy file. */
  incompleteReads?: string[];
  /** Present only for a local file workspace, never for a connected keyboard. */
  workspace?: {
    name: string;
    sourceText: string | null;
    format: "toml" | "moergo-json";
  };
  model: KeyboardModel;
  info: DeviceInfo;
  caps: DeviceCapabilities;
  protocol: ProtocolVersion;
  /** Application-defined build identity. null on firmware that has no
   *  `GetBuildInfo`, which is not a fault — it just cannot be compared. */
  build: BuildInfo | null;
  lightingCaps: LightingCapabilities | null;
  overlayReadSupported: boolean;
  layers: KeyAction[][];
  /** null when firmware predates persistent logical layer metadata. */
  layerMetadata: LayerMetadata[] | null;
  /** null when a complete runtime pointing-reference read was unavailable. */
  pointingConfig: PointingConfig | null;
  /** Why the pointing read failed, when it failed for a reason other than the
   *  firmware answering that it does not know the command. null means the read
   *  succeeded, or the firmware genuinely has no runtime pointing support. */
  pointingReadError?: string | null;
  /** Optional pointing modes understood by this firmware revision. */
  pointingCapabilities: PointingCapabilities | null;
  currentLayer: number;
  defaultLayer: number;
  activeLayers: number[];
  layerStateComplete: boolean;
  battery: BatteryStatus;
  peripheralBattery: BatteryStatus;
  connection: ConnectionStatus | null;
  lightingState: LightingState | null;
  lightingOutputMode: LightingOutputModeState | null;
  overlay: LightingOverlayCell[];
  /** null when the firmware has no layer-scene support (local-preset mode). */
  sceneStatus: LightingSceneStatus | null;
  /** On-device scene table; always empty when sceneStatus is null. */
  scenes: LightingSceneCell[];
  /** Immutable layer scenes compiled into this firmware build. */
  compiledSceneStatus: LightingCompiledSceneStatus | null;
  compiledScenes: LightingSceneCell[];
  conditionalScenes: LightingConditionalSceneCell[];
  lightingControls: LightingControls;
  /** Mutable ordered conditional table. null when the firmware has no such
   *  table at all — distinct from a supported-but-empty table ([] cells). */
  runtimeConditionalStatus: LightingRuntimeConditionalSceneStatus | null;
  runtimeConditionalScenes: LightingExtendedConditionalSceneCell[];
  /** null when the firmware has no extension-effects support. */
  lightingExtension: LightingExtension | null;
  lightingExtensionLayers: LightingExtensionLayers | null;
  /** Static extension name lists; empty when lightingExtension is null. */
  extensionEffectNames: string[];
  extensionPaletteNames: string[];
  /** Advanced tables; empty arrays when the device reports zero capacity. */
  combos: ComboDefinition[];
  morse: Morse[];
  forks: Fork[];
  macroBytes: Uint8Array;
  /** null when the device rejected the read (feature-gated out). */
  behavior: BehaviorConfig | null;
  behaviorOptions: BehaviorOptions | null;
  morseProfileCapacity: number;
  morseProfiles: MorseProfileEntry[];
  /** null when firmware predates runtime positional hold triggers. */
  morseHoldTriggerPositionCapacity: number | null;
  morseHoldTriggerPositions: MorseHoldTriggerPosition[];
  autoMouseLayerCapacity: number;
  autoMouseLayers: AutoMouseLayerConfig[];
  ledIndicator: LedIndicator | null;
  /** null only when legacy firmware lacks GetModifierState. */
  modifierState: ModifierCombination | null;
}

export interface PendingInfo {
  status: "pending" | "error";
  message?: string;
  /** The action we tried to write — kept for retry. */
  attempted?: KeyAction;
}

/** One batch-mode key edit held locally: `before` is the on-device action
 *  from when the key was first staged, so a discard can restore it. */
export interface StagedKeyEdit {
  layer: number;
  row: number;
  col: number;
  before: KeyAction;
  action: KeyAction;
}

/** One batch-mode encoder edit. `before` is undefined when the encoder had
 *  not been read before staging; a discard then just forgets the local value. */
export interface StagedEncoderEdit {
  layer: number;
  id: number;
  before: EncoderAction | undefined;
  action: EncoderAction;
}

/** Slot-table kinds sharing the optimistic-write plumbing. */
export type SlotKind = "combos" | "morse" | "forks";

export type SlotValueOf<K extends SlotKind> = K extends "combos"
  ? ComboDefinition
  : K extends "morse"
    ? Morse
    : Fork;

export function slotPendingId(kind: SlotKind, index: number): string {
  return `${kind}:${index}`;
}

export interface WorkbenchState {
  mode: Mode;
  uiLayer: number;
  /** Highest-precedence active layer, derived from `activeLayers`. */
  currentLayer: number;
  defaultLayer: number;
  activeLayers: number[];
  layerStateComplete: boolean;
  layers: KeyAction[][];
  layerMetadata: LayerMetadata[] | null;
  pointingConfig: PointingConfig | null;
  pointingDraft: PointingConfig | null;
  pointingBusy: boolean;
  pointingError: string | null;
  /** `${layer}:${encoderId}` → loaded encoder action. */
  encoders: Record<string, EncoderAction>;
  battery: BatteryStatus;
  peripheralBattery: BatteryStatus;
  connection: ConnectionStatus | null;
  lightingState: LightingState | null;
  lightingOutputMode: LightingOutputModeState | null;
  /** Overlay as last known on-device, keyed by LED id. */
  applied: Record<number, LightingOverlayCell>;
  /** Overlay as the user wants it (staged), keyed by LED id. */
  draft: Record<number, LightingOverlayCell>;
  /** Which surface the canvas edits: "overlay" or a layer index. */
  lightingTarget: LightingTarget;
  /** Per-layer staged scene edits: layer → (led id → cell). A layer's full
   *  desired table, seeded from `scenes` on first edit; staged = its diff. */
  layerDrafts: Record<number, Record<number, LightingOverlayCell>>;
  /** On-device scene table as last known (empty without firmware support). */
  scenes: LightingSceneCell[];
  /** Immutable firmware defaults, kept separate from editable runtime cells. */
  compiledScenes: LightingSceneCell[];
  /** Conditional firmware rules compiled from keyboard.toml. */
  conditionalScenes: LightingConditionalSceneCell[];
  lightingControls: LightingControls;
  /** The mutable ordered conditional table as last known on-device. Always
   *  empty when the firmware has no such table. */
  runtimeConditionalScenes: LightingExtendedConditionalSceneCell[];
  /** The same table as the user wants it (staged). Order carries meaning, so
   *  this is a list, and a reorder is a real, applicable difference. Follows
   *  device pushes while it matches `runtimeConditionalScenes`. */
  runtimeConditionalDraft: LightingExtendedConditionalSceneCell[];
  /** Extension-effects discovery + live selection; null when unsupported. */
  lightingExtension: LightingExtension | null;
  lightingExtensionLayers: LightingExtensionLayers | null;
  /** Generic parameter lists by effect index. An effect is absent until its
   *  first read; an empty list means "this effect has no parameters", which is
   *  also how firmware without the parameter surface at all is recorded (the
   *  read simply failed). Several effects are held at once because the pack can
   *  render a base and an overlay effect, each with its own parameters. */
  extensionParams: ExtensionParamSet;
  /** Layer-composition policy; null when scenes are unsupported. */
  scenePolicy: LightingLayerPolicy | null;
  compiledScenePolicy: LightingLayerPolicy | null;
  selection: Selection | null;
  /** `${layer}:${row}:${col}` or `e:${layer}:${id}` → write status. */
  pending: Record<string, PendingInfo>;
  /** Successful direct matrix-key edits only. Compound presets, imports,
   *  encoders, lighting, and advanced tables deliberately do not enter it. */
  keyEditHistory: KeyEditHistory;
  /** Bulk configuration transactions suspend history traversal. */
  keyEditHistorySuspended: boolean;
  /** Batch mode: key and encoder writes are staged locally and written to the
   *  keyboard together on apply, instead of one write per edit. */
  batchMode: boolean;
  /** keyPendingId → staged key edit. */
  stagedKeys: Record<string, StagedKeyEdit>;
  /** encoderPendingId → staged encoder edit. */
  stagedEncoders: Record<string, StagedEncoderEdit>;
  /** A batch apply is writing staged edits to the device. */
  batchBusy: boolean;
  batchError: string | null;
  layerBusy: boolean;
  layerError: string | null;
  lightingBusy: boolean;
  lightingError: string | null;
  /** LED ids to highlight (zone hover). */
  hoverLeds: number[] | null;
  /** LED ids selected for bulk paint (from zones). */
  lightingSelection: number[];
  /** ledId → nonce, bumped on paint for the pop animation. */
  paintTick: Record<number, number>;
  /** Advanced tables, kept full-length (empty slots included). */
  combos: ComboDefinition[];
  morse: Morse[];
  forks: Fork[];
  macroBytes: Uint8Array;
  behavior: BehaviorConfig | null;
  behaviorOptions: BehaviorOptions | null;
  morseProfileCapacity: number;
  morseProfiles: MorseProfileEntry[];
  morseHoldTriggerPositionCapacity: number | null;
  morseHoldTriggerPositions: MorseHoldTriggerPosition[];
  autoMouseLayerCapacity: number;
  autoMouseLayers: AutoMouseLayerConfig[];
  ledIndicator: LedIndicator | null;
  /** Authoritative resolved HID modifiers; null enables the legacy matrix fallback. */
  modifierState: ModifierCombination | null;
}

/** Parameter lists as last read from the device, keyed by effect index. */
export type ExtensionParamSet = Record<number, LightingExtensionParam[]>;

/** One staged parameter write: an ordinal within one effect's list. */
export interface ExtensionParamWrite {
  effect: number;
  index: number;
  value: number;
}

/** The effects whose parameters are in play, base first and deduplicated —
 *  both slots may point at the same effect, which has one parameter set. */
export function paramEffects(base: number, overlay: number | undefined): number[] {
  return overlay === undefined || overlay === base ? [base] : [base, overlay];
}

export function keyPendingId(layer: number, row: number, col: number): string {
  return `${layer}:${row}:${col}`;
}

export function encoderPendingId(layer: number, id: number): string {
  return `e:${layer}:${id}`;
}

function cellsToRecord(cells: LightingOverlayCell[]): Record<number, LightingOverlayCell> {
  const out: Record<number, LightingOverlayCell> = {};
  for (const cell of cells) out[cell.led_id] = cell;
  return out;
}

/** One layer's stored scene cells, as an overlay-shaped draft (scenes have no
 *  TTL, so the ttl_ms slot is always empty). This is a layer draft's baseline. */
function layerSceneCells(
  scenes: LightingSceneCell[],
  layer: number,
): Record<number, LightingOverlayCell> {
  const out: Record<number, LightingOverlayCell> = {};
  for (const cell of scenes) {
    if (cell.layer === layer)
      out[cell.led_id] = { led_id: cell.led_id, effect: cell.effect, ttl_ms: undefined };
  }
  return out;
}

/** The draft the given target edits, seeding a layer draft from `scenes` when
 *  the target has not been touched yet. */
function targetDraft(
  state: WorkbenchState,
  target: LightingTarget,
): Record<number, LightingOverlayCell> {
  if (target === "overlay") return state.draft;
  return state.layerDrafts[target] ?? layerSceneCells(state.scenes, target);
}

/** Write a target's draft back, into `draft` or the right `layerDrafts` slot. */
function setTargetDraft(
  state: WorkbenchState,
  target: LightingTarget,
  draft: Record<number, LightingOverlayCell>,
): Partial<WorkbenchState> {
  return target === "overlay"
    ? { draft }
    : { layerDrafts: { ...state.layerDrafts, [target]: draft } };
}

/** After the scene table changes, re-sync every layer draft that was clean
 *  against the old table (mirrors the overlay's follow-when-clean rule);
 *  drafts with staged edits are left untouched. */
function reseedLayerDrafts(
  layerDrafts: Record<number, Record<number, LightingOverlayCell>>,
  oldScenes: LightingSceneCell[],
  newScenes: LightingSceneCell[],
): Record<number, Record<number, LightingOverlayCell>> {
  const next = { ...layerDrafts };
  for (const key of Object.keys(layerDrafts)) {
    const layer = Number(key);
    if (overlaysEqual(layerDrafts[layer], layerSceneCells(oldScenes, layer)))
      next[layer] = layerSceneCells(newScenes, layer);
  }
  return next;
}

export function initialWorkbenchState(bundle: ConnectedBundle): WorkbenchState {
  const applied = cellsToRecord(bundle.overlay);
  return {
    mode: "keymap",
    uiLayer: bundle.currentLayer,
    currentLayer: bundle.currentLayer,
    defaultLayer: bundle.defaultLayer,
    activeLayers: bundle.activeLayers,
    layerStateComplete: bundle.layerStateComplete,
    layers: bundle.layers,
    layerMetadata: bundle.layerMetadata,
    pointingConfig: bundle.pointingConfig
      ? normalizePointingConfig(bundle.pointingConfig)
      : null,
    pointingDraft: bundle.pointingConfig
      ? normalizePointingConfig(bundle.pointingConfig)
      : null,
    pointingBusy: false,
    pointingError: bundle.pointingReadError ?? null,
    encoders: {},
    battery: bundle.battery,
    peripheralBattery: bundle.peripheralBattery,
    connection: bundle.connection,
    lightingState: bundle.lightingState,
    lightingOutputMode: bundle.lightingOutputMode,
    applied,
    draft: { ...applied },
    lightingTarget: "overlay",
    layerDrafts: {},
    scenes: bundle.scenes,
    compiledScenes: bundle.compiledScenes,
    conditionalScenes: bundle.conditionalScenes,
    lightingControls: bundle.lightingControls,
    runtimeConditionalScenes: bundle.runtimeConditionalScenes,
    runtimeConditionalDraft: bundle.runtimeConditionalScenes,
    lightingExtension: bundle.lightingExtension,
    lightingExtensionLayers: bundle.lightingExtensionLayers,
    extensionParams: {},
    scenePolicy: bundle.sceneStatus?.policy ?? null,
    compiledScenePolicy: bundle.compiledSceneStatus?.policy ?? null,
    selection: null,
    pending: {},
    keyEditHistory: initialKeyEditHistory(),
    keyEditHistorySuspended: false,
    batchMode: false,
    stagedKeys: {},
    stagedEncoders: {},
    batchBusy: false,
    batchError: null,
    layerBusy: false,
    layerError: null,
    lightingBusy: false,
    lightingError: null,
    hoverLeds: null,
    lightingSelection: [],
    paintTick: {},
    combos: bundle.combos,
    morse: bundle.morse,
    forks: bundle.forks,
    macroBytes: bundle.macroBytes,
    behavior: bundle.behavior,
    behaviorOptions: bundle.behaviorOptions,
    morseProfileCapacity: bundle.morseProfileCapacity,
    morseProfiles: bundle.morseProfiles,
    morseHoldTriggerPositionCapacity: bundle.morseHoldTriggerPositionCapacity,
    morseHoldTriggerPositions: bundle.morseHoldTriggerPositions,
    autoMouseLayerCapacity: bundle.autoMouseLayerCapacity,
    autoMouseLayers: bundle.autoMouseLayers,
    ledIndicator: bundle.ledIndicator,
    modifierState: bundle.modifierState,
  };
}

export type WorkbenchAction =
  | { type: "mode"; mode: Mode }
  | { type: "uiLayer"; layer: number }
  | { type: "select"; selection: Selection | null }
  | { type: "keyWriteStart"; layer: number; row: number; col: number; action: KeyAction }
  | { type: "keyWriteOk"; layer: number; row: number; col: number }
  | {
      type: "keyWriteErr";
      layer: number;
      row: number;
      col: number;
      prev: KeyAction;
      attempted: KeyAction;
      message: string;
    }
  | { type: "keyErrDismiss"; layer: number; row: number; col: number }
  | { type: "keyHistoryRecord"; entry: KeyEditHistoryEntry }
  | {
      type: "keyHistoryStart";
      direction: "undo" | "redo";
      entry: KeyEditHistoryEntry;
    }
  | {
      type: "keyHistoryFinish";
      direction: "undo" | "redo";
      entry: KeyEditHistoryEntry;
    }
  | { type: "keyHistoryFail"; direction: "undo" | "redo"; message: string }
  | { type: "keyHistoryClear" }
  | { type: "keyHistorySuspend"; suspended: boolean }
  | { type: "keyHistoryErrorDismiss" }
  | { type: "batchMode"; enabled: boolean }
  | { type: "keyStage"; layer: number; row: number; col: number; action: KeyAction }
  | { type: "keyStageApplied"; layer: number; row: number; col: number }
  | { type: "encoderStage"; layer: number; id: number; action: EncoderAction }
  | { type: "encoderStageApplied"; layer: number; id: number }
  | { type: "batchDiscard" }
  | { type: "batchApplyStart" }
  | { type: "batchApplyDone"; error: string | null }
  | { type: "encoderLoaded"; layer: number; id: number; action: EncoderAction }
  | { type: "encoderWriteStart"; layer: number; id: number; action: EncoderAction }
  | { type: "encoderWriteOk"; layer: number; id: number }
  | {
      type: "encoderWriteErr";
      layer: number;
      id: number;
      prev: EncoderAction | undefined;
      message: string;
    }
  | { type: "defaultLayer"; layer: number }
  | { type: "layerOperationStart" }
  | { type: "layerOperationApplied"; rewrite: LayerRewrite }
  | { type: "layerOperationError"; message: string }
  | { type: "layerMetadataSet"; layer: number; metadata: LayerMetadata }
  | {
      type: "topicLayers";
      defaultLayer: number;
      activeLayers: number[];
      complete: boolean;
    }
  | { type: "topicBattery"; battery: BatteryStatus }
  | { type: "topicConnection"; connection: ConnectionStatus }
  | {
      type: "lightingRefresh";
      state: LightingState;
      outputMode?: LightingOutputModeState | null;
      overlay: LightingOverlayCell[];
      /** Present only when the device supports on-device scenes. */
      scenes?: LightingSceneCell[];
      /** Present only when the device exposes a lighting extension. */
      extension?: LightingExtension | null;
      extensionLayers?: LightingExtensionLayers | null;
      /** Present only when the device has a mutable conditional table. */
      runtimeConditional?: LightingExtendedConditionalSceneCell[];
    }
  | { type: "lightingTarget"; target: LightingTarget }
  /** `target` edits a specific draft without moving Lighting mode's selected
   *  target; omitted, it edits whatever that target currently is. */
  | { type: "paint"; cells: LightingOverlayCell[]; target?: LightingTarget }
  | { type: "erase"; ledIds: number[]; target?: LightingTarget }
  | { type: "draftReset"; target?: LightingTarget }
  | { type: "lightingBusy"; busy: boolean; error?: string | null }
  | { type: "overlayApplied"; state: LightingState; cells: LightingOverlayCell[] }
  | { type: "scenesApplied"; state: LightingState; cells: LightingSceneCell[] }
  | { type: "conditionalDraft"; cells: LightingExtendedConditionalSceneCell[] }
  | { type: "conditionalDraftReset" }
  | {
      type: "conditionalApplied";
      state: LightingState;
      cells: LightingExtendedConditionalSceneCell[];
    }
  | { type: "scenePolicySet"; state: LightingState; policy: LightingLayerPolicy }
  | {
      type: "extensionStateSet";
      state: LightingState;
      extension: LightingExtensionState;
      extensionLayers: LightingExtensionLayers | null;
    }
  | { type: "extensionParamsLoaded"; effect: number; items: LightingExtensionParam[] }
  | { type: "hoverLeds"; leds: number[] | null }
  | { type: "lightingSelect"; leds: number[]; mode?: "replace" | "add" | "remove" }
  | { type: "lightingStateSet"; state: LightingState }
  | { type: "wakeLayersSet"; outputMode: LightingOutputModeState }
  | { type: "pointingDraftSet"; config: PointingConfig }
  | { type: "pointingDraftReset" }
  | { type: "pointingWriteStart" }
  | { type: "pointingWriteOk"; config: PointingConfig }
  | { type: "pointingWriteErr"; message: string }
  | { type: "pointingReloaded"; config: PointingConfig }
  | { type: "slotWriteStart"; kind: SlotKind; index: number; value: ComboDefinition | Morse | Fork }
  | { type: "slotWriteOk"; kind: SlotKind; index: number }
  | {
      type: "slotWriteErr";
      kind: SlotKind;
      index: number;
      prev: ComboDefinition | Morse | Fork;
      message: string;
    }
  | { type: "slotErrDismiss"; kind: SlotKind; index: number }
  | { type: "macrosWriteStart"; bytes: Uint8Array }
  | { type: "macrosWriteOk" }
  | { type: "macrosWriteErr"; prev: Uint8Array; message: string }
  | { type: "macrosErrDismiss" }
  | { type: "behaviorWriteStart"; config: BehaviorConfig }
  | { type: "behaviorWriteOk" }
  | { type: "behaviorWriteErr"; prev: BehaviorConfig | null; message: string }
  | { type: "behaviorErrDismiss" }
  | { type: "behaviorOptionsWriteStart"; options: BehaviorOptions }
  | { type: "behaviorOptionsWriteOk" }
  | { type: "behaviorOptionsWriteErr"; prev: BehaviorOptions | null; message: string }
  | { type: "morseProfileWriteStart"; entry: MorseProfileEntry }
  | { type: "morseProfileWriteOk"; index: number }
  | { type: "morseProfileWriteErr"; index: number; prev: MorseProfileEntry | null; message: string }
  | { type: "morseProfileDeleteStart"; index: number }
  | { type: "morseProfileDeleteOk"; index: number }
  | {
      type: "morseProfileDeleteErr";
      entry: MorseProfileEntry;
      positions: MorseHoldTriggerPosition[];
      message: string;
    }
  | { type: "holdTriggerPositionsWriteStart"; positions: MorseHoldTriggerPosition[] }
  | { type: "holdTriggerPositionsWriteOk" }
  | {
      type: "holdTriggerPositionsWriteErr";
      prev: MorseHoldTriggerPosition[];
      message: string;
    }
  | { type: "autoMouseWriteStart"; configs: AutoMouseLayerConfig[] }
  | { type: "autoMouseWriteOk" }
  | { type: "autoMouseWriteErr"; prev: AutoMouseLayerConfig[]; message: string }
  | { type: "topicLedIndicator"; indicator: LedIndicator }
  | { type: "topicModifier"; modifiers: ModifierCombination };

function setLayerKey(
  layers: KeyAction[][],
  cols: number,
  layer: number,
  row: number,
  col: number,
  action: KeyAction,
): KeyAction[][] {
  const next = layers.slice();
  const arr = next[layer].slice();
  arr[row * cols + col] = action;
  next[layer] = arr;
  return next;
}

export function makeWorkbenchReducer(cols: number) {
  return function reducer(state: WorkbenchState, act: WorkbenchAction): WorkbenchState {
    switch (act.type) {
      case "mode":
        return { ...state, mode: act.mode, selection: null, hoverLeds: null };
      case "uiLayer":
        return { ...state, uiLayer: act.layer };
      case "select":
        return { ...state, selection: act.selection };
      case "keyWriteStart": {
        const id = keyPendingId(act.layer, act.row, act.col);
        return {
          ...state,
          layers: setLayerKey(state.layers, cols, act.layer, act.row, act.col, act.action),
          pending: { ...state.pending, [id]: { status: "pending" } },
        };
      }
      case "keyWriteOk": {
        const id = keyPendingId(act.layer, act.row, act.col);
        const { [id]: _done, ...pending } = state.pending;
        return { ...state, pending };
      }
      case "keyWriteErr": {
        const id = keyPendingId(act.layer, act.row, act.col);
        return {
          ...state,
          layers: setLayerKey(state.layers, cols, act.layer, act.row, act.col, act.prev),
          pending: {
            ...state.pending,
            [id]: { status: "error", message: act.message, attempted: act.attempted },
          },
        };
      }
      case "keyErrDismiss": {
        const id = keyPendingId(act.layer, act.row, act.col);
        const { [id]: _gone, ...pending } = state.pending;
        return { ...state, pending };
      }
      case "keyHistoryRecord":
        return {
          ...state,
          keyEditHistory: reduceKeyEditHistory(state.keyEditHistory, {
            type: "record",
            entry: act.entry,
          }),
        };
      case "keyHistoryStart":
        return {
          ...state,
          keyEditHistory: reduceKeyEditHistory(state.keyEditHistory, {
            type: "start",
            direction: act.direction,
            entry: act.entry,
          }),
        };
      case "keyHistoryFinish":
        return {
          ...state,
          keyEditHistory: reduceKeyEditHistory(state.keyEditHistory, {
            type: "finish",
            direction: act.direction,
            entry: act.entry,
          }),
        };
      case "keyHistoryFail":
        return {
          ...state,
          keyEditHistory: reduceKeyEditHistory(state.keyEditHistory, {
            type: "fail",
            direction: act.direction,
            message: act.message,
          }),
        };
      case "keyHistoryClear":
        return {
          ...state,
          keyEditHistory: reduceKeyEditHistory(state.keyEditHistory, { type: "clear" }),
        };
      case "keyHistorySuspend":
        return { ...state, keyEditHistorySuspended: act.suspended };
      case "keyHistoryErrorDismiss":
        return {
          ...state,
          keyEditHistory: reduceKeyEditHistory(state.keyEditHistory, {
            type: "dismissError",
          }),
        };
      case "batchMode": {
        // Leaving batch mode requires the staged set to be empty; edits must
        // be applied or discarded, never silently promoted or dropped.
        if (!act.enabled && stagedEditCount(state) > 0) return state;
        return { ...state, batchMode: act.enabled, batchError: null };
      }
      case "keyStage": {
        const id = keyPendingId(act.layer, act.row, act.col);
        const before =
          state.stagedKeys[id]?.before ?? state.layers[act.layer][act.row * cols + act.col];
        const layers = setLayerKey(state.layers, cols, act.layer, act.row, act.col, act.action);
        if (JSON.stringify(before) === JSON.stringify(act.action)) {
          // Edited back to what the device holds: nothing left to apply.
          const { [id]: _gone, ...stagedKeys } = state.stagedKeys;
          return { ...state, layers, stagedKeys };
        }
        return {
          ...state,
          layers,
          stagedKeys: {
            ...state.stagedKeys,
            [id]: { layer: act.layer, row: act.row, col: act.col, before, action: act.action },
          },
        };
      }
      case "keyStageApplied": {
        const id = keyPendingId(act.layer, act.row, act.col);
        const { [id]: _done, ...stagedKeys } = state.stagedKeys;
        return { ...state, stagedKeys };
      }
      case "encoderStage": {
        const id = encoderPendingId(act.layer, act.id);
        const key = `${act.layer}:${act.id}`;
        const before = id in state.stagedEncoders ? state.stagedEncoders[id].before : state.encoders[key];
        const encoders = { ...state.encoders, [key]: act.action };
        if (JSON.stringify(before) === JSON.stringify(act.action)) {
          const { [id]: _gone, ...stagedEncoders } = state.stagedEncoders;
          return { ...state, encoders, stagedEncoders };
        }
        return {
          ...state,
          encoders,
          stagedEncoders: {
            ...state.stagedEncoders,
            [id]: { layer: act.layer, id: act.id, before, action: act.action },
          },
        };
      }
      case "encoderStageApplied": {
        const id = encoderPendingId(act.layer, act.id);
        const { [id]: _done, ...stagedEncoders } = state.stagedEncoders;
        return { ...state, stagedEncoders };
      }
      case "batchDiscard": {
        let layers = state.layers;
        for (const edit of Object.values(state.stagedKeys)) {
          layers = setLayerKey(layers, cols, edit.layer, edit.row, edit.col, edit.before);
        }
        const encoders = { ...state.encoders };
        for (const edit of Object.values(state.stagedEncoders)) {
          const key = `${edit.layer}:${edit.id}`;
          if (edit.before === undefined) delete encoders[key];
          else encoders[key] = edit.before;
        }
        return {
          ...state,
          layers,
          encoders,
          stagedKeys: {},
          stagedEncoders: {},
          batchError: null,
        };
      }
      case "batchApplyStart":
        return { ...state, batchBusy: true, batchError: null };
      case "batchApplyDone":
        return { ...state, batchBusy: false, batchError: act.error };
      case "encoderLoaded":
        return {
          ...state,
          encoders: { ...state.encoders, [`${act.layer}:${act.id}`]: act.action },
        };
      case "encoderWriteStart": {
        const id = encoderPendingId(act.layer, act.id);
        return {
          ...state,
          encoders: { ...state.encoders, [`${act.layer}:${act.id}`]: act.action },
          pending: { ...state.pending, [id]: { status: "pending" } },
        };
      }
      case "encoderWriteOk": {
        const id = encoderPendingId(act.layer, act.id);
        const { [id]: _done, ...pending } = state.pending;
        return { ...state, pending };
      }
      case "encoderWriteErr": {
        const id = encoderPendingId(act.layer, act.id);
        const encoders = { ...state.encoders };
        if (act.prev) encoders[`${act.layer}:${act.id}`] = act.prev;
        return {
          ...state,
          encoders,
          pending: { ...state.pending, [id]: { status: "error", message: act.message } },
        };
      }
      case "defaultLayer":
        return { ...state, defaultLayer: act.layer };
      case "layerOperationStart":
        return { ...state, layerBusy: true, layerError: null, selection: null };
      case "layerOperationError":
        return { ...state, layerBusy: false, layerError: act.message };
      case "layerMetadataSet": {
        if (!state.layerMetadata) return state;
        const layerMetadata = state.layerMetadata.slice();
        layerMetadata[act.layer] = act.metadata;
        return { ...state, layerMetadata, layerBusy: false, layerError: null };
      }
      case "layerOperationApplied": {
        const rewrite = act.rewrite;
        const pointing = rewrite.pointing ? normalizePointingConfig(rewrite.pointing) : null;
        const movedUiLayer = rewrite.order.findIndex((source) => source === state.uiLayer);
        const uiLayer =
          movedUiLayer >= 0
            ? movedUiLayer
            : Math.min(state.uiLayer, rewrite.order.length - 1);
        return {
          ...state,
          layers: rewrite.layers,
          layerMetadata: rewrite.metadata,
          pointingConfig: pointing,
          pointingDraft: pointing ? structuredClone(pointing) : null,
          pointingBusy: false,
          pointingError: null,
          defaultLayer: rewrite.defaultLayer,
          activeLayers: rewrite.activeLayers,
          currentLayer: Math.max(rewrite.defaultLayer, ...rewrite.activeLayers),
          uiLayer,
          combos: rewrite.combos,
          morse: rewrite.morse,
          forks: rewrite.forks,
          behaviorOptions: rewrite.behaviorOptions,
          autoMouseLayers: rewrite.autoMouseLayers,
          scenes: rewrite.scenes,
          runtimeConditionalScenes: rewrite.runtimeConditionalScenes,
          runtimeConditionalDraft: rewrite.runtimeConditionalScenes,
          lightingOutputMode: state.lightingOutputMode
            ? { ...state.lightingOutputMode, wake_layers: rewrite.wakeLayers }
            : null,
          encoders: {},
          layerDrafts: {},
          pending: {},
          stagedKeys: {},
          stagedEncoders: {},
          layerBusy: false,
          layerError: null,
        };
      }
      case "topicLayers":
        return {
          ...state,
          defaultLayer: act.defaultLayer,
          activeLayers: act.activeLayers,
          layerStateComplete: act.complete,
          currentLayer: Math.max(act.defaultLayer, ...act.activeLayers),
        };
      case "topicBattery":
        return { ...state, battery: act.battery };
      case "topicConnection":
        return { ...state, connection: act.connection };
      case "lightingRefresh": {
        const applied = cellsToRecord(act.overlay);
        const draftWasClean = overlaysEqual(state.draft, state.applied);
        // Same follow-when-clean rule as the overlay: a device push replaces
        // an untouched rule draft, but never discards staged edits.
        const conditionalWasClean = conditionalTablesEqual(
          state.runtimeConditionalDraft,
          state.runtimeConditionalScenes,
        );
        return {
          ...state,
          lightingState: act.state,
          lightingOutputMode: act.outputMode ?? state.lightingOutputMode,
          lightingControls:
            act.outputMode === undefined || act.outputMode === null
              ? state.lightingControls
              : { ...state.lightingControls, wake_layers: act.outputMode.wake_layers },
          lightingExtension: act.extension ?? state.lightingExtension,
          lightingExtensionLayers: act.extensionLayers ?? state.lightingExtensionLayers,
          applied,
          draft: draftWasClean ? { ...applied } : state.draft,
          scenes: act.scenes ?? state.scenes,
          layerDrafts: act.scenes
            ? reseedLayerDrafts(state.layerDrafts, state.scenes, act.scenes)
            : state.layerDrafts,
          runtimeConditionalScenes: act.runtimeConditional ?? state.runtimeConditionalScenes,
          runtimeConditionalDraft:
            act.runtimeConditional !== undefined && conditionalWasClean
              ? act.runtimeConditional
              : state.runtimeConditionalDraft,
        };
      }
      case "lightingTarget":
        return {
          ...state,
          lightingTarget: act.target,
          ...(act.target !== "overlay" && state.layerDrafts[act.target] === undefined
            ? {
                layerDrafts: {
                  ...state.layerDrafts,
                  [act.target]: layerSceneCells(state.scenes, act.target),
                },
              }
            : {}),
        };
      case "paint": {
        const target = act.target ?? state.lightingTarget;
        const draft = { ...targetDraft(state, target) };
        const paintTick = { ...state.paintTick };
        for (const cell of act.cells) {
          draft[cell.led_id] = cell;
          paintTick[cell.led_id] = (paintTick[cell.led_id] ?? 0) + 1;
        }
        return {
          ...state,
          ...setTargetDraft(state, target, draft),
          paintTick,
          lightingError: null,
        };
      }
      case "erase": {
        const target = act.target ?? state.lightingTarget;
        const draft = { ...targetDraft(state, target) };
        const paintTick = { ...state.paintTick };
        for (const id of act.ledIds) {
          delete draft[id];
          paintTick[id] = (paintTick[id] ?? 0) + 1;
        }
        return { ...state, ...setTargetDraft(state, target, draft), paintTick };
      }
      case "draftReset": {
        const target = act.target ?? state.lightingTarget;
        const reset =
          target === "overlay"
            ? { ...state.applied }
            : layerSceneCells(state.scenes, target);
        return {
          ...state,
          ...setTargetDraft(state, target, reset),
          lightingError: null,
        };
      }
      case "lightingBusy":
        return {
          ...state,
          lightingBusy: act.busy,
          lightingError: act.error === undefined ? state.lightingError : act.error,
        };
      case "overlayApplied": {
        const applied = cellsToRecord(act.cells);
        return {
          ...state,
          lightingState: act.state,
          applied,
          draft: { ...applied },
          lightingBusy: false,
          lightingError: null,
          // A bulk selection is a staging aid; once applied it has served
          // its purpose and lingering outlines would read as pending work.
          lightingSelection: [],
        };
      }
      case "scenesApplied":
        return {
          ...state,
          lightingState: act.state,
          scenes: act.cells,
          layerDrafts: reseedLayerDrafts(state.layerDrafts, state.scenes, act.cells),
          lightingBusy: false,
          lightingError: null,
        };
      case "conditionalDraft":
        return { ...state, runtimeConditionalDraft: act.cells, lightingError: null };
      case "conditionalDraftReset":
        return {
          ...state,
          runtimeConditionalDraft: state.runtimeConditionalScenes,
          lightingError: null,
        };
      case "conditionalApplied":
        return {
          ...state,
          lightingState: act.state,
          runtimeConditionalScenes: act.cells,
          runtimeConditionalDraft: act.cells,
          lightingBusy: false,
          lightingError: null,
        };
      case "scenePolicySet":
        return {
          ...state,
          lightingState: act.state,
          scenePolicy: act.policy,
          lightingBusy: false,
          lightingError: null,
        };
      case "wakeLayersSet":
        return {
          ...state,
          lightingOutputMode: act.outputMode,
          lightingControls: {
            ...state.lightingControls,
            wake_layers: act.outputMode.wake_layers,
          },
          lightingBusy: false,
          lightingError: null,
        };
      case "pointingDraftSet":
        return {
          ...state,
          pointingDraft: normalizePointingConfig(act.config),
          pointingError: null,
        };
      case "pointingDraftReset":
        return {
          ...state,
          pointingDraft: state.pointingConfig ? structuredClone(state.pointingConfig) : null,
          pointingError: null,
        };
      case "pointingWriteStart":
        return { ...state, pointingBusy: true, pointingError: null };
      case "pointingWriteOk": {
        const config = normalizePointingConfig(act.config);
        return {
          ...state,
          pointingConfig: config,
          pointingDraft: structuredClone(config),
          pointingBusy: false,
          pointingError: null,
        };
      }
      case "pointingWriteErr":
        return { ...state, pointingBusy: false, pointingError: act.message };
      case "pointingReloaded": {
        const config = normalizePointingConfig(act.config);
        return {
          ...state,
          pointingConfig: config,
          pointingDraft: structuredClone(config),
          pointingBusy: false,
          pointingError: null,
        };
      }
      case "extensionStateSet":
        return {
          ...state,
          lightingState: act.state,
          lightingExtension: state.lightingExtension
            ? { ...state.lightingExtension, revision: act.state.revision, state: act.extension }
            : state.lightingExtension,
          lightingExtensionLayers: act.extensionLayers,
          lightingBusy: false,
          lightingError: null,
        };
      case "extensionParamsLoaded":
        return {
          ...state,
          extensionParams: { ...state.extensionParams, [act.effect]: act.items },
        };
      case "hoverLeds":
        return { ...state, hoverLeds: act.leds };
      case "lightingSelect": {
        if (act.mode === undefined || act.mode === "replace")
          return { ...state, lightingSelection: act.leds };
        const next = new Set(state.lightingSelection);
        for (const led of act.leds) {
          if (act.mode === "add") next.add(led);
          else next.delete(led);
        }
        // Preserve selection order so the count and paint order stay stable.
        const selection = [...state.lightingSelection.filter((led) => next.has(led))];
        if (act.mode === "add") {
          const seen = new Set(selection);
          for (const led of act.leds) {
            if (seen.has(led)) continue;
            seen.add(led);
            selection.push(led);
          }
        }
        return { ...state, lightingSelection: selection };
      }
      case "lightingStateSet":
        return { ...state, lightingState: act.state, lightingBusy: false, lightingError: null };
      case "slotWriteStart": {
        const id = slotPendingId(act.kind, act.index);
        const table = state[act.kind].slice() as Array<ComboDefinition | Morse | Fork>;
        table[act.index] = act.value;
        return {
          ...state,
          [act.kind]: table,
          pending: { ...state.pending, [id]: { status: "pending" } },
        };
      }
      case "slotWriteOk": {
        const id = slotPendingId(act.kind, act.index);
        const { [id]: _done, ...pending } = state.pending;
        return { ...state, pending };
      }
      case "slotWriteErr": {
        const id = slotPendingId(act.kind, act.index);
        const table = state[act.kind].slice() as Array<ComboDefinition | Morse | Fork>;
        table[act.index] = act.prev;
        return {
          ...state,
          [act.kind]: table,
          pending: { ...state.pending, [id]: { status: "error", message: act.message } },
        };
      }
      case "slotErrDismiss": {
        const id = slotPendingId(act.kind, act.index);
        const { [id]: _gone, ...pending } = state.pending;
        return { ...state, pending };
      }
      case "macrosWriteStart":
        return {
          ...state,
          macroBytes: act.bytes,
          pending: { ...state.pending, macros: { status: "pending" } },
        };
      case "macrosWriteOk": {
        const { macros: _done, ...pending } = state.pending;
        return { ...state, pending };
      }
      case "macrosWriteErr":
        return {
          ...state,
          macroBytes: act.prev,
          pending: { ...state.pending, macros: { status: "error", message: act.message } },
        };
      case "macrosErrDismiss": {
        const { macros: _gone, ...pending } = state.pending;
        return { ...state, pending };
      }
      case "behaviorWriteStart":
        return {
          ...state,
          behavior: act.config,
          pending: { ...state.pending, behavior: { status: "pending" } },
        };
      case "behaviorWriteOk": {
        const { behavior: _done, ...pending } = state.pending;
        return { ...state, pending };
      }
      case "behaviorWriteErr":
        return {
          ...state,
          behavior: act.prev,
          pending: { ...state.pending, behavior: { status: "error", message: act.message } },
        };
      case "behaviorErrDismiss": {
        const { behavior: _gone, ...pending } = state.pending;
        return { ...state, pending };
      }
      case "behaviorOptionsWriteStart":
        return {
          ...state,
          behaviorOptions: act.options,
          pending: { ...state.pending, behaviorOptions: { status: "pending" } },
        };
      case "behaviorOptionsWriteOk": {
        const { behaviorOptions: _done, ...pending } = state.pending;
        return { ...state, pending };
      }
      case "behaviorOptionsWriteErr":
        return {
          ...state,
          behaviorOptions: act.prev,
          pending: {
            ...state.pending,
            behaviorOptions: { status: "error", message: act.message },
          },
        };
      case "morseProfileWriteStart": {
        const morseProfiles = state.morseProfiles
          .filter((entry) => entry.index !== act.entry.index)
          .concat(act.entry)
          .sort((a, b) => a.index - b.index);
        return {
          ...state,
          morseProfiles,
          pending: {
            ...state.pending,
            [`morseProfile:${act.entry.index}`]: { status: "pending" },
          },
        };
      }
      case "morseProfileWriteOk": {
        const { [`morseProfile:${act.index}`]: _done, ...pending } = state.pending;
        return { ...state, pending };
      }
      case "morseProfileWriteErr": {
        const morseProfiles = state.morseProfiles
          .filter((entry) => entry.index !== act.index)
          .concat(act.prev ? [act.prev] : [])
          .sort((a, b) => a.index - b.index);
        return {
          ...state,
          morseProfiles,
          pending: {
            ...state.pending,
            [`morseProfile:${act.index}`]: { status: "error", message: act.message },
          },
        };
      }
      case "morseProfileDeleteStart":
        return {
          ...state,
          morseProfiles: state.morseProfiles.filter((entry) => entry.index !== act.index),
          morseHoldTriggerPositions: state.morseHoldTriggerPositions.filter(
            (position) => position.profile !== act.index,
          ),
          pending: {
            ...state.pending,
            [`morseProfile:${act.index}`]: { status: "pending" },
          },
        };
      case "morseProfileDeleteOk": {
        const { [`morseProfile:${act.index}`]: _done, ...pending } = state.pending;
        return { ...state, pending };
      }
      case "morseProfileDeleteErr":
        return {
          ...state,
          morseProfiles: state.morseProfiles.concat(act.entry).sort((a, b) => a.index - b.index),
          morseHoldTriggerPositions: act.positions,
          pending: {
            ...state.pending,
            [`morseProfile:${act.entry.index}`]: { status: "error", message: act.message },
          },
        };
      case "holdTriggerPositionsWriteStart":
        return {
          ...state,
          morseHoldTriggerPositions: act.positions,
          pending: { ...state.pending, morseHoldTriggerPositions: { status: "pending" } },
        };
      case "holdTriggerPositionsWriteOk": {
        const { morseHoldTriggerPositions: _done, ...pending } = state.pending;
        return { ...state, pending };
      }
      case "holdTriggerPositionsWriteErr":
        return {
          ...state,
          morseHoldTriggerPositions: act.prev,
          pending: {
            ...state.pending,
            morseHoldTriggerPositions: { status: "error", message: act.message },
          },
        };
      case "autoMouseWriteStart":
        return {
          ...state,
          autoMouseLayers: act.configs,
          pending: { ...state.pending, autoMouseLayers: { status: "pending" } },
        };
      case "autoMouseWriteOk": {
        const { autoMouseLayers: _done, ...pending } = state.pending;
        return { ...state, pending };
      }
      case "autoMouseWriteErr":
        return {
          ...state,
          autoMouseLayers: act.prev,
          pending: {
            ...state.pending,
            autoMouseLayers: { status: "error", message: act.message },
          },
        };
      case "topicLedIndicator":
        return { ...state, ledIndicator: act.indicator };
      case "topicModifier":
        return { ...state, modifierState: act.modifiers };
    }
  };
}

export function overlaysEqual(
  a: Record<number, LightingOverlayCell>,
  b: Record<number, LightingOverlayCell>,
): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  for (const k of ak) {
    const ka = Number(k);
    if (!(ka in b)) return false;
    if (JSON.stringify(a[ka]) !== JSON.stringify(b[ka])) return false;
  }
  return true;
}

/** Whether two conditional tables are the same *table*. Order-sensitive by
 *  design: these rules compose in table order and a later rule wins a shared
 *  slot, so permuting them is a real change the device must be told about. */
export function conditionalTablesEqual(
  a: LightingExtendedConditionalSceneCell[],
  b: LightingExtendedConditionalSceneCell[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((cell, index) => JSON.stringify(cell) === JSON.stringify(b[index]));
}

/** LED ids where `draft` diverges from its `base` (staged, unapplied edits). */
export function stagedBetween(
  draft: Record<number, LightingOverlayCell>,
  base: Record<number, LightingOverlayCell>,
): Set<number> {
  const out = new Set<number>();
  for (const k of Object.keys(draft)) {
    const id = Number(k);
    const b = base[id];
    if (!b || JSON.stringify(b) !== JSON.stringify(draft[id])) out.add(id);
  }
  for (const k of Object.keys(base)) {
    const id = Number(k);
    if (!(id in draft)) out.add(id);
  }
  return out;
}

/** The draft a given target edits (overlay draft, or that layer's). */
export function lightingDraftFor(
  state: WorkbenchState,
  target: LightingTarget,
): Record<number, LightingOverlayCell> {
  return targetDraft(state, target);
}

/** The baseline a given target stages against: the on-device overlay, or that
 *  layer's stored scene cells. */
export function lightingBaseFor(
  state: WorkbenchState,
  target: LightingTarget,
): Record<number, LightingOverlayCell> {
  return target === "overlay" ? state.applied : layerSceneCells(state.scenes, target);
}

/** The draft the active target edits (overlay draft, or the selected layer's). */
export function activeLightingDraft(state: WorkbenchState): Record<number, LightingOverlayCell> {
  return lightingDraftFor(state, state.lightingTarget);
}

/** The baseline the active target stages against: the on-device overlay, or
 *  the selected layer's stored scene cells. */
export function activeLightingBase(state: WorkbenchState): Record<number, LightingOverlayCell> {
  return lightingBaseFor(state, state.lightingTarget);
}

/** How many key and encoder edits batch mode is holding, unapplied. */
export function stagedEditCount(state: WorkbenchState): number {
  return Object.keys(state.stagedKeys).length + Object.keys(state.stagedEncoders).length;
}

export function pointingDraftDirty(state: WorkbenchState): boolean {
  return !pointingConfigsEqual(state.pointingConfig, state.pointingDraft);
}

export function hasPendingConfigurationWrite(state: WorkbenchState): boolean {
  return (
    state.keyEditHistorySuspended ||
    state.lightingBusy ||
    state.pointingBusy ||
    state.batchBusy ||
    Object.values(state.pending).some((item) => item.status === "pending")
  );
}

export function canTravelKeyEditHistory(
  state: WorkbenchState,
  direction: "undo" | "redo",
): boolean {
  if (state.keyEditHistory.operation || hasPendingConfigurationWrite(state)) return false;
  // Staged batch edits sit between the history's device state and the boards':
  // traveling would write under them and stale their restore points.
  if (stagedEditCount(state) > 0) return false;
  return direction === "undo"
    ? state.keyEditHistory.past.length > 0
    : state.keyEditHistory.future.length > 0;
}

export interface WorkbenchContextValue {
  bundle: ConnectedBundle;
  state: WorkbenchState;
  dispatch: Dispatch<WorkbenchAction>;
  /** Bound async operations (optimistic writes, lighting transactions). */
  io: WorkbenchIo;
  history: {
    canUndo: boolean;
    canRedo: boolean;
    phase: "idle" | "writing" | "undoing" | "redoing";
    error: string | null;
    undoLabel: string | null;
    redoLabel: string | null;
    undo(): Promise<void>;
    redo(): Promise<void>;
    clear(): void;
  };
}

export type IoWriteResult = { ok: true } | { ok: false; message: string };

export interface WorkbenchIo {
  setKey(
    layer: number,
    row: number,
    col: number,
    action: KeyAction,
    options?: { history?: "record" | "invalidate" },
  ): Promise<IoWriteResult>;
  undoKeyEdit(): Promise<IoWriteResult>;
  redoKeyEdit(): Promise<IoWriteResult>;
  /** Write every staged batch edit to the keyboard in one pass. Writes that
   *  fail stay staged, so apply can simply be retried. */
  applyBatch(): Promise<IoWriteResult>;
  moveKey(
    layer: number,
    source: { row: number; col: number },
    destination: { row: number; col: number },
  ): Promise<IoWriteResult>;
  loadEncoder(layer: number, id: number): void;
  setEncoder(layer: number, id: number, action: EncoderAction): void;
  setDefaultLayer(layer: number): void;
  renameLayer(layer: number, name: string): Promise<IoWriteResult>;
  duplicateLayer(layer: number): Promise<IoWriteResult>;
  moveLayer(layer: number, to: number): Promise<IoWriteResult>;
  deleteLayer(layer: number): Promise<IoWriteResult>;
  refreshLayerState(): void;
  applyOverlay(cells: LightingOverlayCell[]): void;
  clearOverlay(): void;
  refreshLighting(): void;
  setLightingState(state: LightingMutableState): void;
  /** Replace the on-device scene table (only when scenes are supported). */
  applyScenes(cells: LightingSceneCell[]): void;
  setScenePolicy(policy: LightingLayerPolicy): void;
  setWakeLayers(layers: number): void;
  /** Atomically replace the mutable conditional table with this exact order
   *  (only when the firmware has such a table). */
  applyConditionalScenes(
    cells: LightingExtendedConditionalSceneCell[],
  ): Promise<IoWriteResult>;
  /** Select an extension effect/palette, then write any staged parameter
   *  values for the selected effect (only when the firmware supports it). */
  setExtensionState(
    state: LightingExtensionState,
    params?: ExtensionParamWrite[],
    overlay?: number,
  ): void;
  /** Read one effect's generic parameter list. Firmware without the parameter
   *  surface records an empty list, which renders as no parameter controls. */
  loadExtensionParams(effect: number): void;
  setSlot<K extends SlotKind>(kind: K, index: number, value: SlotValueOf<K>): void;
  writeMacros(bytes: Uint8Array): void;
  setBehavior(config: BehaviorConfig): void;
  setBehaviorOptions(options: BehaviorOptions): void;
  setMorseProfile(entry: MorseProfileEntry): void;
  deleteMorseProfile(index: number): void;
  setMorseHoldTriggerPositions(positions: MorseHoldTriggerPosition[]): void;
  setAutoMouseLayers(configs: AutoMouseLayerConfig[]): void;
  applyPointingConfig(): Promise<IoWriteResult>;
  reloadPointingConfig(): Promise<IoWriteResult>;
  disconnect(): void;
  rebootToBootloader(): Promise<void>;
}

export interface LayerManagementConfig {
  sceneCapacity: number | null;
  conditionalSceneCapacity: number | null;
  scenesSupported: boolean;
  conditionalScenesSupported: boolean;
  pointingSupported: boolean;
  lightingOutputSupported: boolean;
}

export const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export function useWorkbench(): WorkbenchContextValue {
  const ctx = useContext(WorkbenchContext);
  if (!ctx) throw new Error("useWorkbench outside WorkbenchContext");
  return ctx;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function readLayerRewriteSnapshot(
  session: RynkSession,
  state: WorkbenchState,
  config: LayerManagementConfig,
): Promise<LayerRewriteSnapshot> {
  if (state.layerMetadata === null) {
    throw new Error("this firmware does not support persistent layer metadata");
  }
  if (state.behaviorOptions === null) {
    throw new Error("behavior options could not be read, so layer references cannot be rewritten safely");
  }
  if (!config.pointingSupported) {
    throw new Error("pointing configuration could not be read, so layer references cannot be rewritten safely");
  }
  if (state.lightingState !== null && !config.lightingOutputSupported) {
    throw new Error("lighting wake layers could not be read, so layer references cannot be rewritten safely");
  }

  const caps = await session.device.capabilities();
  const [metadata, layerKeymaps, layerState, combos, morse, forks, behaviorOptions, autoMouse, pointing] =
    await Promise.all([
      Promise.all(
        Array.from({ length: caps.num_layers }, (_, layer) =>
          session.keymap.getLayerMetadata(layer),
        ),
      ),
      session.keymap.readAll(),
      session.keymap.layerState(),
      caps.max_combos > 0 ? session.combos.readAll() : Promise.resolve([]),
      caps.max_morse > 0 ? session.morse.readAll() : Promise.resolve([]),
      caps.max_forks > 0 ? session.forks.readAll() : Promise.resolve([]),
      session.behavior.options(),
      session.behavior.autoMouseLayers(),
      session.pointing.get(),
    ]);
  if (!layerState.complete) {
    throw new Error("complete active-layer state is required before editing layer structure");
  }
  const encoders = await Promise.all(
    Array.from({ length: caps.num_layers }, (_, layer) =>
      Promise.all(
        Array.from({ length: caps.num_encoders }, (_, encoder) =>
          session.keymap.getEncoder(encoder, layer),
        ),
      ),
    ),
  );
  const [scenes, runtimeConditionalScenes, outputMode] = await Promise.all([
    config.scenesSupported ? session.lighting.scenes.readScenes() : Promise.resolve([]),
    config.conditionalScenesSupported
      ? session.lighting.conditionalScenes.read()
      : Promise.resolve([]),
    config.lightingOutputSupported ? session.lighting.outputMode() : Promise.resolve(null),
  ]);
  const layers = Array.from({ length: caps.num_layers }, (_, layer) => {
    const found = layerKeymaps.find((candidate) => candidate.layer === layer);
    if (!found) throw new Error(`keymap read omitted layer ${layer}`);
    return found.actions;
  });

  return {
    metadata,
    layers,
    encoders,
    defaultLayer: layerState.defaultLayer,
    activeLayers: layerState.activeLayers,
    combos,
    morse,
    forks,
    behaviorOptions,
    autoMouseLayers: autoMouse.configs,
    scenes,
    runtimeConditionalScenes,
    compiledScenes: state.compiledScenes,
    compiledConditionalScenes: state.conditionalScenes,
    wakeLayers: outputMode?.wake_layers ?? 0,
    pointing,
  };
}

async function writeLayerRewriteSnapshot(
  session: RynkSession,
  snapshot: LayerRewriteSnapshot,
  config: LayerManagementConfig,
): Promise<void> {
  await session.keymap.replaceAll(
    snapshot.layers.map((actions, layer) => ({ layer, actions })),
  );
  for (let layer = 0; layer < snapshot.encoders.length; layer += 1) {
    for (let encoder = 0; encoder < snapshot.encoders[layer].length; encoder += 1) {
      await session.keymap.setEncoder(encoder, layer, snapshot.encoders[layer][encoder]);
    }
  }
  for (let index = 0; index < snapshot.combos.length; index += 1) {
    await session.combos.set(index, snapshot.combos[index]);
  }
  for (let index = 0; index < snapshot.morse.length; index += 1) {
    await session.morse.set(index, snapshot.morse[index]);
  }
  for (let index = 0; index < snapshot.forks.length; index += 1) {
    await session.forks.set(index, snapshot.forks[index]);
  }
  if (snapshot.behaviorOptions) await session.behavior.setOptions(snapshot.behaviorOptions);
  await session.behavior.setAutoMouseLayers(snapshot.autoMouseLayers);
  if (config.scenesSupported) await session.lighting.scenes.replaceScenes(snapshot.scenes);
  if (config.conditionalScenesSupported) {
    await session.lighting.conditionalScenes.replace(snapshot.runtimeConditionalScenes);
  }
  if (snapshot.pointing) {
    const current = await session.pointing.get();
    await session.pointing.set({ ...snapshot.pointing, revision: current.revision });
  }
  if (config.lightingOutputSupported) await session.lighting.setWakeLayers(snapshot.wakeLayers);
  await session.keymap.setDefaultLayer(snapshot.defaultLayer);
  for (let layer = 0; layer < snapshot.metadata.length; layer += 1) {
    await session.keymap.setLayerMetadata(layer, snapshot.metadata[layer]);
  }
}

function assertLayerRewriteReadback(expected: LayerRewriteSnapshot, actual: LayerRewriteSnapshot): void {
  const comparable = (snapshot: LayerRewriteSnapshot) => ({
    ...snapshot,
    compiledScenes: [],
    compiledConditionalScenes: [],
    pointing: snapshot.pointing
      ? { ...snapshot.pointing, revision: 0 }
      : null,
  });
  if (JSON.stringify(comparable(expected)) !== JSON.stringify(comparable(actual))) {
    throw new Error("layer transaction read-back did not match the requested rewrite");
  }
}

/** Build the io facade. `session` writes; `dispatch` narrates. */
export function makeIo(
  session: RynkSession,
  getState: () => WorkbenchState,
  dispatch: Dispatch<WorkbenchAction>,
  cols: number,
  onDisconnect: () => void,
  scenesSupported = false,
  extensionSupported = false,
  conditionalScenesSupported = false,
  layerConfig: LayerManagementConfig = {
    sceneCapacity: null,
    conditionalSceneCapacity: null,
    scenesSupported: false,
    conditionalScenesSupported: false,
    pointingSupported: false,
    lightingOutputSupported: false,
  },
): WorkbenchIo {
  let keyEditSequence = 0;
  let directKeyWritesPending = 0;
  let keyHistoryWritePending = false;

  // Feature detection lives here: firmware predating per-effect parameters
  // rejects the request outright, which is recorded as "no parameters" and
  // renders as no extra controls rather than an error.
  const loadParams = (effect: number) => {
    session.lighting.extensionParams(effect).then(
      (items) => dispatch({ type: "extensionParamsLoaded", effect, items }),
      () => dispatch({ type: "extensionParamsLoaded", effect, items: [] }),
    );
  };

  const rejectLayerOperation = (message: string): IoWriteResult => {
    dispatch({ type: "layerOperationError", message });
    return { ok: false, message };
  };

  const runLayerStructure = async (
    operation: LayerStructureOperation | { type: "duplicate"; layer: number },
  ): Promise<IoWriteResult> => {
    const before = getState();
    if (before.layerBusy) return { ok: false, message: "another layer operation is running" };
    if (
      before.lightingBusy ||
      Object.values(before.pending).some((item) => item.status === "pending")
    ) {
      return rejectLayerOperation("wait for pending device writes before editing layers");
    }
    if (stagedEditCount(before) > 0) {
      return rejectLayerOperation("apply or discard staged batch edits before editing layers");
    }
    if (pointingDraftDirty(before)) {
      return rejectLayerOperation("apply or discard staged pointing edits before editing layers");
    }
    if (Object.keys(before.layerDrafts).length > 0) {
      return rejectLayerOperation("apply or discard staged layer lighting before editing layers");
    }
    if (!conditionalTablesEqual(before.runtimeConditionalDraft, before.runtimeConditionalScenes)) {
      return rejectLayerOperation("apply or discard staged conditional lighting before editing layers");
    }
    dispatch({ type: "layerOperationStart" });
    let original: LayerRewriteSnapshot | null = null;
    try {
      original = await readLayerRewriteSnapshot(session, getState(), layerConfig);
      let plan: LayerRewrite;
      if (operation.type === "duplicate") {
        const baseName = original.metadata[operation.layer]?.name;
        if (!baseName) throw new Error(`layer ${operation.layer} is not occupied`);
        const existing = new Set(
          original.metadata.filter((slot) => slot.occupied).map((slot) => slot.name),
        );
        let name = `${baseName} copy`;
        for (let suffix = 2; existing.has(name); suffix += 1) name = `${baseName} copy ${suffix}`;
        plan = planLayerDuplicate(
          original,
          operation.layer,
          name,
          layerConfig.sceneCapacity,
          layerConfig.conditionalSceneCapacity,
        );
      } else {
        plan = planLayerRewrite(original, operation);
      }
      await writeLayerRewriteSnapshot(session, plan, layerConfig);
      const readback = await readLayerRewriteSnapshot(session, getState(), layerConfig);
      assertLayerRewriteReadback(plan, readback);
      dispatch({ type: "keyHistoryClear" });
      dispatch({ type: "layerOperationApplied", rewrite: { ...readback, order: plan.order } });
      return { ok: true };
    } catch (error) {
      let message = errorMessage(error);
      if (original) {
        try {
          await writeLayerRewriteSnapshot(session, original, layerConfig);
        } catch (rollbackError) {
          message += `; rollback also failed: ${errorMessage(rollbackError)}`;
        }
      }
      dispatch({ type: "layerOperationError", message });
      return { ok: false, message };
    }
  };

  const setKey = (
    layer: number,
    row: number,
    col: number,
    action: KeyAction,
    options?: { history?: "record" | "invalidate" },
  ): Promise<IoWriteResult> => {
    if (keyHistoryWritePending) {
      return Promise.resolve({ ok: false, message: "Undo or redo is in progress" });
    }
    const staging = getState();
    if (staging.batchMode) {
      if (staging.batchBusy) {
        return Promise.resolve({ ok: false, message: "Batch apply is in progress" });
      }
      dispatch({ type: "keyStage", layer, row, col, action });
      if (options?.history === "invalidate") dispatch({ type: "keyHistoryClear" });
      return Promise.resolve({ ok: true });
    }
    const prev = getState().layers[layer][row * cols + col];
    const sequence = ++keyEditSequence;
    directKeyWritesPending += 1;
    dispatch({ type: "keyWriteStart", layer, row, col, action });
    return session.keymap
      .setKey(layer, row, col, action)
      .then(
        () => {
          dispatch({ type: "keyWriteOk", layer, row, col });
          if (options?.history === "invalidate") {
            dispatch({ type: "keyHistoryClear" });
          } else {
            dispatch({
              type: "keyHistoryRecord",
              entry: { sequence, layer, row, col, before: prev, after: action },
            });
          }
          return { ok: true } as const;
        },
        (err) => {
          const message = errorMessage(err);
          dispatch({
            type: "keyWriteErr",
            layer,
            row,
            col,
            prev,
            attempted: action,
            message,
          });
          return { ok: false, message } as const;
        },
      )
      .finally(() => {
        directKeyWritesPending -= 1;
      });
  };

  const travelKeyHistory = async (
    direction: "undo" | "redo",
  ): Promise<IoWriteResult> => {
    const state = getState();
    if (
      keyHistoryWritePending ||
      directKeyWritesPending > 0 ||
      !canTravelKeyEditHistory(state, direction)
    ) {
      return { ok: false, message: "Key edit history is not available while a write is pending" };
    }
    const stack = direction === "undo" ? state.keyEditHistory.past : state.keyEditHistory.future;
    const entry = stack.at(-1);
    if (!entry) return { ok: false, message: `Nothing to ${direction}` };

    const action = direction === "undo" ? entry.before : entry.after;
    const previous = state.layers[entry.layer][entry.row * cols + entry.col];
    keyHistoryWritePending = true;
    dispatch({ type: "keyHistoryStart", direction, entry });
    dispatch({
      type: "keyWriteStart",
      layer: entry.layer,
      row: entry.row,
      col: entry.col,
      action,
    });
    try {
      await session.keymap.setKey(entry.layer, entry.row, entry.col, action);
      dispatch({
        type: "keyWriteOk",
        layer: entry.layer,
        row: entry.row,
        col: entry.col,
      });
      dispatch({ type: "keyHistoryFinish", direction, entry });
      return { ok: true };
    } catch (error) {
      const message = errorMessage(error);
      dispatch({
        type: "keyWriteErr",
        layer: entry.layer,
        row: entry.row,
        col: entry.col,
        prev: previous,
        attempted: action,
        message,
      });
      dispatch({ type: "keyHistoryFail", direction, message });
      return { ok: false, message };
    } finally {
      keyHistoryWritePending = false;
    }
  };

  return {
    setKey,
    undoKeyEdit() {
      return travelKeyHistory("undo");
    },
    redoKeyEdit() {
      return travelKeyHistory("redo");
    },
    async applyBatch() {
      const start = getState();
      if (start.batchBusy) return { ok: false, message: "a batch apply is already running" };
      const keys = Object.values(start.stagedKeys);
      const encoders = Object.values(start.stagedEncoders);
      if (keys.length === 0 && encoders.length === 0) return { ok: true };
      dispatch({ type: "batchApplyStart" });
      const failures: string[] = [];
      for (const edit of keys) {
        try {
          await session.keymap.setKey(edit.layer, edit.row, edit.col, edit.action);
          dispatch({ type: "keyStageApplied", layer: edit.layer, row: edit.row, col: edit.col });
        } catch (error) {
          failures.push(
            `layer ${edit.layer} r${edit.row} c${edit.col}: ${errorMessage(error)}`,
          );
        }
      }
      for (const edit of encoders) {
        try {
          await session.keymap.setEncoder(edit.id, edit.layer, edit.action);
          dispatch({ type: "encoderStageApplied", layer: edit.layer, id: edit.id });
        } catch (error) {
          failures.push(`layer ${edit.layer} encoder ${edit.id}: ${errorMessage(error)}`);
        }
      }
      // A batch apply is a bulk write outside per-key history, like an import.
      if (keys.length > failures.length) dispatch({ type: "keyHistoryClear" });
      const message =
        failures.length > 0
          ? `${failures.length} of ${keys.length + encoders.length} staged write(s) failed ` +
            `and remain staged: ${failures.join("; ")}`
          : null;
      dispatch({ type: "batchApplyDone", error: message });
      return message ? { ok: false, message } : { ok: true };
    },
    async moveKey(layer, source, destination) {
      if (source.row === destination.row && source.col === destination.col) return { ok: true };
      const state = getState();
      const sourcePending = state.pending[keyPendingId(layer, source.row, source.col)];
      const destinationPending = state.pending[
        keyPendingId(layer, destination.row, destination.col)
      ];
      if (sourcePending?.status === "pending" || destinationPending?.status === "pending") {
        return { ok: false, message: "Wait for both key writes to finish before moving." };
      }

      const action = state.layers[layer]?.[source.row * cols + source.col];
      if (action === undefined || action === "No") {
        return { ok: false, message: "The source key has no binding to move." };
      }

      // Land the binding before clearing its source. A destination failure
      // therefore rolls back normally without ever losing the original.
      const destinationResult = await setKey(
        layer,
        destination.row,
        destination.col,
        action,
      );
      if (!destinationResult.ok) return destinationResult;

      const sourceResult = await setKey(layer, source.row, source.col, "No");
      if (!sourceResult.ok) {
        return {
          ok: false,
          message: `The binding was copied, but its source could not be cleared: ${sourceResult.message}`,
        };
      }
      return { ok: true };
    },
    loadEncoder(layer, id) {
      session.keymap.getEncoder(id, layer).then(
        (action) => dispatch({ type: "encoderLoaded", layer, id, action }),
        () => {},
      );
    },
    setEncoder(layer, id, action) {
      const state = getState();
      if (state.batchMode) {
        if (!state.batchBusy) dispatch({ type: "encoderStage", layer, id, action });
        return;
      }
      const prev = state.encoders[`${layer}:${id}`];
      dispatch({ type: "encoderWriteStart", layer, id, action });
      session.keymap.setEncoder(id, layer, action).then(
        () => dispatch({ type: "encoderWriteOk", layer, id }),
        (err) =>
          dispatch({ type: "encoderWriteErr", layer, id, prev, message: errorMessage(err) }),
      );
    },
    setDefaultLayer(layer) {
      const prev = getState().defaultLayer;
      dispatch({ type: "defaultLayer", layer });
      session.keymap.setDefaultLayer(layer).catch(() => {
        dispatch({ type: "defaultLayer", layer: prev });
      });
    },
    async renameLayer(layer, name) {
      const state = getState();
      if (state.layerBusy) {
        return { ok: false, message: "another layer operation is running" };
      }
      const trimmed = name.trim();
      if (!trimmed) return rejectLayerOperation("layer name must not be empty");
      if (new TextEncoder().encode(trimmed).length > 32) {
        return rejectLayerOperation("layer name must be at most 32 UTF-8 bytes");
      }
      if (
        state.layerMetadata?.some(
          (candidate, index) => index !== layer && candidate.occupied && candidate.name === trimmed,
        )
      ) {
        return rejectLayerOperation(`layer name '${trimmed}' is already in use`);
      }
      const metadata = state.layerMetadata?.[layer];
      if (!metadata?.occupied) {
        return rejectLayerOperation(`layer ${layer} is not an occupied device layer`);
      }
      dispatch({ type: "layerOperationStart" });
      try {
        await session.keymap.setLayerMetadata(layer, { occupied: true, name: trimmed });
        const readback = await session.keymap.getLayerMetadata(layer);
        if (!readback.occupied || readback.name !== trimmed) {
          throw new Error("layer name read-back did not match the write");
        }
        dispatch({ type: "layerMetadataSet", layer, metadata: readback });
        return { ok: true };
      } catch (error) {
        const message = errorMessage(error);
        dispatch({ type: "layerOperationError", message });
        return { ok: false, message };
      }
    },
    duplicateLayer(layer) {
      return runLayerStructure({ type: "duplicate", layer });
    },
    moveLayer(layer, to) {
      return runLayerStructure({ type: "move", layer, to });
    },
    deleteLayer(layer) {
      return runLayerStructure({ type: "delete", layer });
    },
    refreshLayerState() {
      session.keymap.layerState().then(
        (snapshot) =>
          dispatch({
            type: "topicLayers",
            defaultLayer: snapshot.defaultLayer,
            activeLayers: snapshot.activeLayers,
            complete: snapshot.complete,
          }),
        () => {},
      );
    },
    applyOverlay(cells) {
      dispatch({ type: "lightingBusy", busy: true, error: null });
      session.lighting.replaceOverlay(cells).then(
        (lightingState) =>
          dispatch({ type: "overlayApplied", state: lightingState, cells }),
        (err) => dispatch({ type: "lightingBusy", busy: false, error: errorMessage(err) }),
      );
    },
    clearOverlay() {
      dispatch({ type: "lightingBusy", busy: true, error: null });
      session.lighting.clearOverlay().then(
        (lightingState) => dispatch({ type: "overlayApplied", state: lightingState, cells: [] }),
        (err) => dispatch({ type: "lightingBusy", busy: false, error: errorMessage(err) }),
      );
    },
    refreshLighting() {
      Promise.all([
        session.lighting.state(),
        session.lighting.outputMode().catch(() => getState().lightingOutputMode),
        session.lighting.readOverlay().catch(() => Object.values(getState().applied)),
        scenesSupported
          ? session.lighting.scenes.readScenes().catch(() => getState().scenes)
          : Promise.resolve(undefined),
        extensionSupported
          ? session.lighting.extension().catch(() => getState().lightingExtension)
          : Promise.resolve(undefined),
        extensionSupported
          ? session.lighting.extensionLayers().catch(() => getState().lightingExtensionLayers)
          : Promise.resolve(undefined),
        conditionalScenesSupported
          ? session.lighting.conditionalScenes
              .read()
              .catch(() => getState().runtimeConditionalScenes)
          : Promise.resolve(undefined),
      ]).then(
        ([
          lightingState,
          outputMode,
          overlay,
          scenes,
          extension,
          extensionLayers,
          runtimeConditional,
        ]) =>
          dispatch({
            type: "lightingRefresh",
            state: lightingState,
            outputMode,
            overlay,
            scenes,
            extension,
            extensionLayers,
            runtimeConditional,
          }),
        () => {},
      );
    },
    setLightingState(mutable) {
      dispatch({ type: "lightingBusy", busy: true, error: null });
      session.lighting.setState(mutable).then(
        (lightingState) => dispatch({ type: "lightingStateSet", state: lightingState }),
        (err) => dispatch({ type: "lightingBusy", busy: false, error: errorMessage(err) }),
      );
    },
    applyScenes(cells) {
      dispatch({ type: "lightingBusy", busy: true, error: null });
      session.lighting.scenes.replaceScenes(cells).then(
        (lightingState) => dispatch({ type: "scenesApplied", state: lightingState, cells }),
        (err) => dispatch({ type: "lightingBusy", busy: false, error: errorMessage(err) }),
      );
    },
    applyConditionalScenes(cells) {
      dispatch({ type: "lightingBusy", busy: true, error: null });
      return (async () => {
        const lightingState = await session.lighting.conditionalScenes.replace(cells);
        const readback = await session.lighting.conditionalScenes.read();
        if (!conditionalTablesEqual(readback, cells)) {
          throw new Error(
            `conditional lighting read-back mismatch: wrote ${cells.length} rule(s), ` +
              `read ${readback.length}`,
          );
        }
        dispatch({ type: "conditionalApplied", state: lightingState, cells: readback });
        return { ok: true } as const;
      })().catch((err) => {
        const message = errorMessage(err);
        dispatch({ type: "lightingBusy", busy: false, error: message });
        return { ok: false, message } as const;
      });
    },
    setScenePolicy(policy) {
      dispatch({ type: "lightingBusy", busy: true, error: null });
      session.lighting.scenes.setLayerPolicy(policy).then(
        (lightingState) => dispatch({ type: "scenePolicySet", state: lightingState, policy }),
        (err) => dispatch({ type: "lightingBusy", busy: false, error: errorMessage(err) }),
      );
    },
    setWakeLayers(layers) {
      dispatch({ type: "lightingBusy", busy: true, error: null });
      session.lighting.setWakeLayers(layers).then(
        (outputMode) => dispatch({ type: "wakeLayersSet", outputMode }),
        (err) => dispatch({ type: "lightingBusy", busy: false, error: errorMessage(err) }),
      );
    },
    setExtensionState(extension, params = [], overlay) {
      dispatch({ type: "lightingBusy", busy: true, error: null });
      // Write only the parts that changed. Each extension mutation is durable,
      // so repeating the unchanged primary/layer selections needlessly queues
      // more flash work and creates extra LightingChange refreshes.
      (async () => {
        const before = getState();
        const currentExtension = before.lightingExtension?.state;
        const currentLayers = before.lightingExtensionLayers;
        if (
          currentExtension === undefined ||
          currentExtension.effect !== extension.effect ||
          currentExtension.palette !== extension.palette ||
          currentExtension.value !== extension.value ||
          currentExtension.speed !== extension.speed
        ) {
          await session.lighting.setExtensionState(extension);
        }
        if (currentLayers !== null && currentLayers.overlay !== overlay) {
          await session.lighting.setExtensionLayers(overlay);
        }
        // Parameters are stored per effect, so a write names its own effect:
        // the overlay slot's effect is edited alongside the base slot's.
        for (const write of params) {
          await session.lighting.setExtensionParam(write.effect, write.index, write.value);
        }
        const [lightingState, appliedExtension, extensionLayers] = await Promise.all([
          session.lighting.state(),
          session.lighting.extension(),
          currentLayers === null ? Promise.resolve(null) : session.lighting.extensionLayers(),
        ]);
        dispatch({
          type: "extensionStateSet",
          state: lightingState,
          extension: appliedExtension.state,
          extensionLayers,
        });
        for (const effect of paramEffects(appliedExtension.state.effect, extensionLayers?.overlay)) {
          loadParams(effect);
        }
      })().catch((err) =>
        dispatch({ type: "lightingBusy", busy: false, error: errorMessage(err) }),
      );
    },
    loadExtensionParams: loadParams,
    setSlot(kind, index, value) {
      const prev = getState()[kind][index];
      dispatch({ type: "slotWriteStart", kind, index, value });
      const write =
        kind === "combos"
          ? session.combos.set(index, value as ComboDefinition)
          : kind === "morse"
            ? session.morse.set(index, value as Morse)
            : session.forks.set(index, value as Fork);
      write.then(
        () => dispatch({ type: "slotWriteOk", kind, index }),
        (err) =>
          dispatch({ type: "slotWriteErr", kind, index, prev, message: errorMessage(err) }),
      );
    },
    writeMacros(bytes) {
      const prev = getState().macroBytes;
      dispatch({ type: "macrosWriteStart", bytes });
      session.macros.write(bytes).then(
        () => dispatch({ type: "macrosWriteOk" }),
        (err) => dispatch({ type: "macrosWriteErr", prev, message: errorMessage(err) }),
      );
    },
    setBehavior(config) {
      const prev = getState().behavior;
      dispatch({ type: "behaviorWriteStart", config });
      session.behavior.set(config).then(
        () => dispatch({ type: "behaviorWriteOk" }),
        (err) => dispatch({ type: "behaviorWriteErr", prev, message: errorMessage(err) }),
      );
    },
    setBehaviorOptions(options) {
      const prev = getState().behaviorOptions;
      dispatch({ type: "behaviorOptionsWriteStart", options });
      session.behavior.setOptions(options).then(
        () => dispatch({ type: "behaviorOptionsWriteOk" }),
        (err) =>
          dispatch({ type: "behaviorOptionsWriteErr", prev, message: errorMessage(err) }),
      );
    },
    setMorseProfile(entry) {
      const prev = getState().morseProfiles.find((item) => item.index === entry.index) ?? null;
      dispatch({ type: "morseProfileWriteStart", entry });
      session.behavior.setProfile(entry).then(
        () => dispatch({ type: "morseProfileWriteOk", index: entry.index }),
        (err) =>
          dispatch({
            type: "morseProfileWriteErr",
            index: entry.index,
            prev,
            message: errorMessage(err),
          }),
      );
    },
    deleteMorseProfile(index) {
      const state = getState();
      const entry = state.morseProfiles.find((item) => item.index === index);
      if (!entry) return;
      const positions = state.morseHoldTriggerPositions;
      dispatch({ type: "morseProfileDeleteStart", index });
      session.behavior.deleteProfile(index).then(
        () => dispatch({ type: "morseProfileDeleteOk", index }),
        (err) =>
          dispatch({
            type: "morseProfileDeleteErr",
            entry,
            positions,
            message: errorMessage(err),
          }),
      );
    },
    setMorseHoldTriggerPositions(positions) {
      const prev = getState().morseHoldTriggerPositions;
      dispatch({ type: "holdTriggerPositionsWriteStart", positions });
      session.behavior.setHoldTriggerPositions(positions).then(
        () => dispatch({ type: "holdTriggerPositionsWriteOk" }),
        (err) =>
          dispatch({
            type: "holdTriggerPositionsWriteErr",
            prev,
            message: errorMessage(err),
          }),
      );
    },
    setAutoMouseLayers(configs) {
      const prev = getState().autoMouseLayers;
      dispatch({ type: "autoMouseWriteStart", configs });
      session.behavior.setAutoMouseLayers(configs).then(
        () => dispatch({ type: "autoMouseWriteOk" }),
        (err) => dispatch({ type: "autoMouseWriteErr", prev, message: errorMessage(err) }),
      );
    },
    async applyPointingConfig() {
      const state = getState();
      if (state.pointingBusy) return { ok: false, message: "a pointing write is already running" };
      if (!state.pointingConfig || !state.pointingDraft) {
        return { ok: false, message: "this keyboard has no runtime pointing configuration" };
      }
      if (!pointingDraftDirty(state)) return { ok: true };

      dispatch({ type: "pointingWriteStart" });
      try {
        const request = normalizePointingConfig({
          ...state.pointingDraft,
          revision: state.pointingConfig.revision,
        });
        const accepted = await session.pointing.set(request);
        const readback = await session.pointing.get();
        if (accepted.revision !== readback.revision || !pointingConfigsEqual(accepted, readback)) {
          throw new Error("pointing configuration read-back did not match the accepted write");
        }
        dispatch({ type: "pointingWriteOk", config: readback });
        return { ok: true };
      } catch (error) {
        const message = errorMessage(error);
        dispatch({ type: "pointingWriteErr", message });
        return { ok: false, message };
      }
    },
    async reloadPointingConfig() {
      if (getState().pointingBusy) {
        return { ok: false, message: "a pointing write is already running" };
      }
      dispatch({ type: "pointingWriteStart" });
      try {
        const config = await session.pointing.get();
        dispatch({ type: "pointingReloaded", config });
        return { ok: true };
      } catch (error) {
        const message = errorMessage(error);
        dispatch({ type: "pointingWriteErr", message });
        return { ok: false, message };
      }
    },
    disconnect() {
      onDisconnect();
    },
    rebootToBootloader() {
      return session.device.rebootToBootloader();
    },
  };
}
