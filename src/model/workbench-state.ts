// The shape of an open workbench: what a connect bundle holds, the state the
// reducer keeps, and the actions that change it. Pure types (and the one table
// that maps a whole-value write onto its state field), so the document and
// transfer layers can describe a workbench without importing the screen.
//
// Interim home: these types mix domain state (layers, tables, lighting) with
// application state (mode, selection, pending writes). They are split in a
// later phase. The reducer and io that use them are in src/workbench (ADR 0017).

import type { MacroOp } from "../vendor/rynk-wasm/rynk_wasm";
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
  LightingControls,
  LightingExtension,
  LightingExtensionLayers,
  LightingExtensionParam,
  LightingExtensionState,
  LightingLayerPolicy,
  LightingOverlayCell,
  LightingOutputModeState,
  LightingRuntimeConditionalSceneStatus,
  LightingSceneCell,
  LightingSceneStatus,
  LightingState,
  ModifierCombination,
  MaintenanceMode,
  Morse,
  MorseHoldTriggerPosition,
  MorseProfileEntry,
  BuildInfo,
  ProtocolVersion,
  PointingConfig,
  PointingCapabilities,
  SplitTransportState,
} from "../vendor/rynk-wasm/rynk_wasm";
import type {
  LayerMetadata,
  LightingTopology,
  RuntimeLightingRule,
  RynkSession,
} from "../session/types";
import type { BoardProfile } from "./boards";
import type { KeyboardModel } from "./keyboard";
import type { KeyEditHistory, KeyEditHistoryEntry } from "./history";
import type { LayerRewrite } from "../layers/management";

/** The screen on show: one section of one area (src/ui/areas.ts). */
export type Mode =
  | "keymap"
  | "combos"
  | "morse"
  | "macros"
  | "forks"
  | "profiles"
  | "transforms"
  | "device"
  | "usage"
  | "live";

/** Which lighting surface the canvas edits: the transient overlay, or one
 *  layer's durable scene table. Only ever a number when scenes are supported. */
export type LightingTarget = "overlay" | number;

export type Selection =
  | { type: "key"; row: number; col: number }
  | { type: "encoder"; id: number }
  | { type: "pointing"; id: number }
  /** A combo open in Focus Mode: key clicks add or remove its keys. */
  | { type: "combo"; index: number };

/** Everything loaded during the connect flow, before the workbench mounts. */
export interface ConnectedBundle {
  /** Optional board-specific tools, resolved once from identity and geometry. */
  boardProfile?: BoardProfile;
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
  /** The advertised emitter topology, kept alongside the derived model: it is
   *  what lets a document's `key`, zone and `all` lighting targets resolve. */
  topology: LightingTopology;
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
  maintenanceMode: MaintenanceMode | null;
  splitTransport: SplitTransportState | null;
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
  runtimeConditionalScenes: RuntimeLightingRule[];
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
  macroOps: MacroOp[][];
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

/** A combo, morse or fork slot changed in the draft, with what it was based on. */
export interface StagedSlotEdit {
  kind: SlotKind;
  index: number;
  before: ComboDefinition | Morse | Fork;
  value: ComboDefinition | Morse | Fork;
}

/** Whole-value configuration surfaces written optimistically as one unit.
 *  The key is the pending id; the value names the state field it replaces. */
export const FIELD_STATE_KEY = {
  behavior: "behavior",
  behaviorOptions: "behaviorOptions",
  macros: "macroOps",
  morseHoldTriggerPositions: "morseHoldTriggerPositions",
  autoMouseLayers: "autoMouseLayers",
} as const satisfies Record<string, keyof WorkbenchState>;

export type WritableField = keyof typeof FIELD_STATE_KEY;

export type FieldValue<F extends WritableField> = WorkbenchState[(typeof FIELD_STATE_KEY)[F]];

export type FieldWriteAction = {
  [F in WritableField]:
    | { type: "fieldWriteStart"; field: F; value: FieldValue<F> }
    | { type: "fieldWriteErr"; field: F; prev: FieldValue<F>; message: string };
}[WritableField];

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
  maintenanceMode: MaintenanceMode | null;
  splitTransport: SplitTransportState | null;
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
  runtimeConditionalScenes: RuntimeLightingRule[];
  /** The same table as the user wants it (staged). Order carries meaning, so
   *  this is a list, and a reorder is a real, applicable difference. Follows
   *  device pushes while it matches `runtimeConditionalScenes`. */
  runtimeConditionalDraft: RuntimeLightingRule[];
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
  /** slotPendingId → staged combo, morse or fork. */
  stagedSlots: Record<string, StagedSlotEdit>;
  /** A batch apply is writing staged edits to the device. */
  batchBusy: boolean;
  batchError: string | null;
  layerBusy: boolean;
  layerError: string | null;
  lightingBusy: boolean;
  lightingError: string | null;
  /** LED ids to highlight (zone hover). */
  hoverLeds: number[] | null;
  /** Advanced tables, kept full-length (empty slots included). */
  combos: ComboDefinition[];
  morse: Morse[];
  forks: Fork[];
  macroOps: MacroOp[][];
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
  /** `before`: what the edit was based on, when a kept draft is restored (else what the keyboard has). */
  | { type: "keyStage"; layer: number; row: number; col: number; action: KeyAction; before?: KeyAction }
  | { type: "keyStageApplied"; layer: number; row: number; col: number }
  | { type: "encoderStage"; layer: number; id: number; action: EncoderAction }
  | { type: "encoderStageApplied"; layer: number; id: number }
  | { type: "slotStage"; kind: SlotKind; index: number; value: ComboDefinition | Morse | Fork; before?: ComboDefinition | Morse | Fork }
  | { type: "slotStageApplied"; kind: SlotKind; index: number }
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
      runtimeConditional?: RuntimeLightingRule[];
    }
  | { type: "lightingTarget"; target: LightingTarget }
  /** `target` edits a specific layer's draft; omitted, the current target's. */
  | { type: "paint"; cells: LightingOverlayCell[]; target?: LightingTarget }
  | { type: "erase"; ledIds: number[]; target?: LightingTarget }
  | { type: "draftReset"; target?: LightingTarget }
  | { type: "lightingBusy"; busy: boolean; error?: string | null }
  | { type: "overlayApplied"; state: LightingState; cells: LightingOverlayCell[] }
  | { type: "scenesApplied"; state: LightingState; cells: LightingSceneCell[] }
  | { type: "conditionalDraft"; cells: RuntimeLightingRule[] }
  | { type: "conditionalDraftReset" }
  | {
      type: "conditionalApplied";
      state: LightingState;
      cells: RuntimeLightingRule[];
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
  | FieldWriteAction
  | { type: "fieldWriteOk"; field: WritableField }
  /** Drop any pending record's error by its id (slot, field, morse profile). */
  | { type: "pendingErrDismiss"; id: string }
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
  | { type: "topicLedIndicator"; indicator: LedIndicator }
  | { type: "topicModifier"; modifiers: ModifierCombination };
