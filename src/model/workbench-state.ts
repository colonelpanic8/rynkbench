// The shape of an open workbench: what a connect bundle holds, the state the
// reducer keeps, and the actions that change it. Pure types (and the one table
// that maps a whole-value write onto its state field), so the document and
// transfer layers can describe a workbench without importing the screen.
//
// Interim home: these types mix domain state (layers, tables, lighting) with
// application state (mode, selection, pending writes). They are split in a
// later phase. The reducer and io that use them are in src/workbench (ADR 0017).

import type { MacroOp } from "../vendor/rynk-wasm/rynk_wasm";
import type { BehaviorLabels } from "./behavior-labels";
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
import type { KeyboardImage, PatchEntry, SyncItem } from "../sync";
import type { History } from "./history";

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
  | "usage";

/** Which lights a preview shows: the keyboard as it is now (its active layers
 *  and the overlay), or one layer's scene table. */
export type LightingTarget = "overlay" | number;

export type Selection =
  /** `more`: the other keys selected with this one, which is the last one
   *  selected and the one the key editor shows (model/key-selection.ts). */
  | { type: "key"; row: number; col: number; more?: ReadonlyArray<{ row: number; col: number }> }
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

/** Slot-table kinds sharing the optimistic-write plumbing. */
export type SlotKind = "combos" | "morse" | "forks";

export type SlotValueOf<K extends SlotKind> = K extends "combos"
  ? ComboDefinition
  : K extends "morse"
    ? Morse
    : Fork;

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
  /** What the keyboard (or the file) held at the last read, read-back or save.
   *  What you want is what the fields below show; the draft is the difference
   *  (ADR 0018, workbench/draft/want.ts). */
  base: KeyboardImage;
  /** For each drafted item the keyboard changed after you did: the value your
   *  change was based on, which Send's three-way check starts from (ADR 0012). */
  basedOn: readonly { item: SyncItem; value: unknown }[];
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
  /** The overlay as last known on the keyboard, keyed by LED id. */
  applied: Record<number, LightingOverlayCell>;
  /** Try-out lights as wanted, keyed by LED id: the overlay, never stored and
   *  outside the draft and the history; `io` sends them after a short pause.
   *  Follows `applied` while nothing waits to be sent. */
  tryOut: Record<number, LightingOverlayCell>;
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
  /** Every commit, for Undo and Redo, in Draft, Live and a file alike (ADR 0018). */
  history: History;
  /** The behaviors' names and descriptions (ADR 0020): beside what you want, never sent. */
  labels: BehaviorLabels;
  /** Draft mode (ADR 0010): edits change what you want, and Send writes the
   *  difference; in Live each edit is written at once. */
  batchMode: boolean;
  /** A batch apply is writing staged edits to the device. */
  batchBusy: boolean;
  /** Why the last send left changes in the draft; null once it left none, and
   *  after the next edit. */
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
  /** Keys join or leave the keys selected on the keymap. */
  | { type: "selectKeys"; keys: ReadonlyArray<{ row: number; col: number }>; how: "add" | "remove" }
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
  /** Undo or Redo: what you want takes the step back or again. */
  | { type: "historyTravel"; direction: "undo" | "redo" }
  /** A Paint stroke opens (pointer down) or closes: its changes are one step. */
  | { type: "historyStroke"; open: boolean }
  | { type: "batchMode"; enabled: boolean }
  /** Draft edits: what you want changes; the keyboard is not written. */
  | { type: "keyStage"; layer: number; row: number; col: number; action: KeyAction }
  | { type: "encoderStage"; layer: number; id: number; action: EncoderAction }
  | { type: "slotStage"; kind: SlotKind; index: number; value: ComboDefinition | Morse | Fork }
  /** Everything you want set back to what the keyboard holds. */
  | { type: "batchDiscard" }
  /** These items of what you want set back to what the keyboard holds. */
  | { type: "draftRevert"; items: SyncItem[] }
  /** Draft edits of any stored item: these items as you want them. */
  | { type: "wantSet"; values: Array<{ item: SyncItem; value: unknown }> }
  /** An operation's result (ADR 0019): what you want, whole, as one step; `join`
   *  puts it in the last step (Live putting back a send that failed); a layer
   *  rewrite's `layerOrder` (destination → source slot) moves the layer on show with it. */
  | { type: "commit"; image: KeyboardImage; join?: boolean; layerOrder?: number[]; labels?: BehaviorLabels }
  /** Labels kept for this keyboard or read from a file (ADR 0020), without those
   *  on empty slots: no step. */
  | { type: "labelsLoaded"; labels: BehaviorLabels }
  /** The keyboard was read (Send's read-back): the base is this image. `wrote`:
   *  the items the send wrote before it, now based on what was read. */
  | { type: "draftStored"; image: KeyboardImage; wrote?: SyncItem[] }
  /** A kept draft put back: each item based on `before`, wanted as `after`. */
  | { type: "draftRestore"; patch: PatchEntry[] }
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
  | { type: "layerOperationDone" }
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
  /** A layer's lighting draft: cells painted, LEDs erased, or back to what it stores. */
  | { type: "paint"; cells: LightingOverlayCell[]; layer: number }
  | { type: "erase"; ledIds: number[]; layer: number }
  | { type: "draftReset"; layer: number }
  | { type: "lightingBusy"; busy: boolean; error?: string | null }
  /** Try-out lights: changed here, sent (the overlay now holds `cells`), cleared, or not sent. */
  | { type: "tryOutSet"; cells: LightingOverlayCell[]; erase: number[] }
  | { type: "tryOutSent"; state: LightingState; cells: LightingOverlayCell[] }
  | { type: "tryOutCleared"; state: LightingState }
  | { type: "tryOutFailed"; error: string }
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
  /** Drop any pending record's error by its id (slot, field). */
  | { type: "pendingErrDismiss"; id: string }
  | { type: "topicLedIndicator"; indicator: LedIndicator }
  | { type: "topicModifier"; modifiers: ModifierCombination };
