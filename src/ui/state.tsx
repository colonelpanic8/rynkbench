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
} from "../vendor/rynk-wasm/rynk_wasm";
import type { RynkSession } from "../session/types";
import type { KeyboardModel } from "../model/keyboard";

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
  | { type: "encoder"; id: number };

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
  | { type: "paint"; cells: LightingOverlayCell[] }
  | { type: "erase"; ledIds: number[] }
  | { type: "draftReset" }
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
        const draft = { ...targetDraft(state, state.lightingTarget) };
        const paintTick = { ...state.paintTick };
        for (const cell of act.cells) {
          draft[cell.led_id] = cell;
          paintTick[cell.led_id] = (paintTick[cell.led_id] ?? 0) + 1;
        }
        return {
          ...state,
          ...setTargetDraft(state, state.lightingTarget, draft),
          paintTick,
          lightingError: null,
        };
      }
      case "erase": {
        const draft = { ...targetDraft(state, state.lightingTarget) };
        const paintTick = { ...state.paintTick };
        for (const id of act.ledIds) {
          delete draft[id];
          paintTick[id] = (paintTick[id] ?? 0) + 1;
        }
        return { ...state, ...setTargetDraft(state, state.lightingTarget, draft), paintTick };
      }
      case "draftReset": {
        const reset =
          state.lightingTarget === "overlay"
            ? { ...state.applied }
            : layerSceneCells(state.scenes, state.lightingTarget);
        return {
          ...state,
          ...setTargetDraft(state, state.lightingTarget, reset),
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

/** The draft the active target edits (overlay draft, or the selected layer's). */
export function activeLightingDraft(state: WorkbenchState): Record<number, LightingOverlayCell> {
  return targetDraft(state, state.lightingTarget);
}

/** The baseline the active target stages against: the on-device overlay, or
 *  the selected layer's stored scene cells. */
export function activeLightingBase(state: WorkbenchState): Record<number, LightingOverlayCell> {
  return state.lightingTarget === "overlay"
    ? state.applied
    : layerSceneCells(state.scenes, state.lightingTarget);
}

export interface WorkbenchContextValue {
  bundle: ConnectedBundle;
  state: WorkbenchState;
  dispatch: Dispatch<WorkbenchAction>;
  /** Bound async operations (optimistic writes, lighting transactions). */
  io: WorkbenchIo;
}

export type IoWriteResult = { ok: true } | { ok: false; message: string };

export interface WorkbenchIo {
  setKey(layer: number, row: number, col: number, action: KeyAction): Promise<IoWriteResult>;
  moveKey(
    layer: number,
    source: { row: number; col: number },
    destination: { row: number; col: number },
  ): Promise<IoWriteResult>;
  loadEncoder(layer: number, id: number): void;
  setEncoder(layer: number, id: number, action: EncoderAction): void;
  setDefaultLayer(layer: number): void;
  refreshLayerState(): void;
  applyOverlay(cells: LightingOverlayCell[]): void;
  clearOverlay(): void;
  refreshLighting(): void;
  setLightingState(state: LightingMutableState): void;
  /** Replace the on-device scene table (only when scenes are supported). */
  applyScenes(cells: LightingSceneCell[]): void;
  setScenePolicy(policy: LightingLayerPolicy): void;
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
  disconnect(): void;
  rebootToBootloader(): Promise<void>;
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
): WorkbenchIo {
  // Feature detection lives here: firmware predating per-effect parameters
  // rejects the request outright, which is recorded as "no parameters" and
  // renders as no extra controls rather than an error.
  const loadParams = (effect: number) => {
    session.lighting.extensionParams(effect).then(
      (items) => dispatch({ type: "extensionParamsLoaded", effect, items }),
      () => dispatch({ type: "extensionParamsLoaded", effect, items: [] }),
    );
  };

  const writeKey = (
    layer: number,
    row: number,
    col: number,
    action: KeyAction,
  ): Promise<IoWriteResult> => {
    const prev = getState().layers[layer][row * cols + col];
    dispatch({ type: "keyWriteStart", layer, row, col, action });
    return session.keymap.setKey(layer, row, col, action).then(
      () => {
        dispatch({ type: "keyWriteOk", layer, row, col });
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
    );
  };

  return {
    setKey: writeKey,
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
      const destinationResult = await writeKey(
        layer,
        destination.row,
        destination.col,
        action,
      );
      if (!destinationResult.ok) return destinationResult;

      const sourceResult = await writeKey(layer, source.row, source.col, "No");
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
      const prev = getState().encoders[`${layer}:${id}`];
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
    disconnect() {
      onDisconnect();
    },
    rebootToBootloader() {
      return session.device.rebootToBootloader();
    },
  };
}
