// The io facade: how the workbench reaches the keyboard. Every method writes
// through the session and narrates through `dispatch`; screens call it, never
// the session. Its parts are by job (io-keys, io-layers, io-lighting,
// io-settings); this file is the contract and puts them together.

import type {
  BehaviorConfig,
  EncoderAction,
  KeyAction,
  LightingOverlayCell,
  LightingExtensionState,
  LightingLayerPolicy,
  LightingMutableState,
  LightingSceneCell,
  MorseHoldTriggerPosition,
} from "../vendor/rynk-wasm/rynk_wasm";
import type { RuntimeLightingRule, RynkSession } from "../session/types";
import type { SyncItem } from "../sync";
import type { BootloaderTarget } from "../model/boards";
import type {
  ConnectedBundle,
  ExtensionParamWrite,
  SlotKind,
  SlotValueOf,
  WorkbenchAction,
  WorkbenchState,
} from "../model/workbench-state";
import { firmwareFactsOf, resolveCapabilities } from "../capabilities";
import type { SendOptions } from "./draft/send";
import type { InputOf, OperationName } from "../operations";
import { applyOperation, passEverything, type Judge } from "./apply";
import type { LayoutImport } from "../config/transfer";
import type { BehaviorLabels } from "../model/behavior-labels";
import { importLayout, type LayoutImported } from "./io-import";
import { keyIo } from "./io-keys";
import { layerIo } from "./io-layers";
import { lightingIo } from "./io-lighting";
import { tryOutIo } from "./io-try-out";
import { settingsIo } from "./io-settings";

/** How the workbench narrates a change: React's dispatch has this type, and so
 *  can anything else that keeps a workbench. */
export type WorkbenchDispatch = (action: WorkbenchAction) => void;

export type IoWriteResult = { ok: true } | { ok: false; message: string; guarded?: true }; // guarded: Guard said no (ADR 0011)
export type KeyWrite = { layer: number; row: number; col: number; action: KeyAction };

export interface WorkbenchIo {
  /** An operation (ADR 0019) on what you want: judged by Guard, one commit and
   *  one Undo step; in Draft it waits for Send, in Live it is sent at once, all or nothing. */
  apply<Name extends OperationName>(name: Name, input: InputOf<Name>): Promise<IoWriteResult>;
  /** A layout file over what you want, committed as an operation's result is;
   *  `labels`: the file's names for its behaviors (ADR 0020). */
  importLayout(file: LayoutImport, labels?: BehaviorLabels): Promise<LayoutImported>;
  setKey(layer: number, row: number, col: number, action: KeyAction): Promise<IoWriteResult>;
  /** Several keys as one change (a swap, a paste): the `set_keys` operation. */
  writeKeys(edits: readonly KeyWrite[]): Promise<IoWriteResult>;
  /** Undo or Redo: the step back or again, as an edit; in Live the keyboard follows (ADR 0018). */
  travel(direction: "undo" | "redo"): Promise<IoWriteResult>;
  /** Send the draft: only what differs from a fresh read, checked for changes made
   *  on the keyboard since (ADR 0012). What fails stays in the draft. */
  applyBatch(options?: SendOptions): Promise<IoWriteResult>;
  loadEncoder(layer: number, id: number): void;
  setEncoder(layer: number, id: number, action: EncoderAction): void;
  setDefaultLayer(layer: number): void;
  renameLayer(layer: number, name: string): Promise<IoWriteResult>;
  duplicateLayer(layer: number): Promise<IoWriteResult>;
  moveLayer(layer: number, to: number): Promise<IoWriteResult>;
  deleteLayer(layer: number): Promise<IoWriteResult>;
  refreshLayerState(): void;
  refreshLighting(): void;
  setLightingState(state: LightingMutableState): void;
  /** Replace the on-device scene table (only when scenes are supported). */
  applyScenes(cells: LightingSceneCell[]): Promise<IoWriteResult>;
  setScenePolicy(policy: LightingLayerPolicy): void;
  setWakeLayers(layers: number): Promise<IoWriteResult>;
  /** Atomically replace the mutable conditional table with this exact order
   *  (only when the firmware has such a table). */
  applyConditionalScenes(
    cells: RuntimeLightingRule[],
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
  /** Try-out lights (the overlay): never stored, outside the draft and Undo.
   *  Changes reach the keyboard after a short pause, so a Paint stroke is one write. */
  tryOut(cells: LightingOverlayCell[], erase: number[]): void;
  /** Takes every try-out light off the keyboard. */
  clearTryOut(): Promise<IoWriteResult>;
  /** Stores the try-out lights on `layer` as one change and one Undo step, then clears them. */
  keepTryOut(layer: number): Promise<IoWriteResult>;
  /** Optimistic single-value writes. Each resolves once the device has
   *  answered; the reducer already reflects the outcome by then. */
  setSlot<K extends SlotKind>(kind: K, index: number, value: SlotValueOf<K>): Promise<IoWriteResult>;
  setBehavior(config: BehaviorConfig): Promise<IoWriteResult>;
  setMorseHoldTriggerPositions(positions: MorseHoldTriggerPosition[]): Promise<IoWriteResult>;
  reloadPointingConfig(): Promise<IoWriteResult>;
  disconnect(): void;
  rebootToBootloader(target?: BootloaderTarget): Promise<void>;
  resetStorage(): Promise<void>;
}

/** A dispatch for the io when the workbench's state is kept elsewhere (React's
 *  useReducer): the io reads the state right after it dispatches (a commit, then
 *  its send in Live; Undo, then its send), before that state is updated, so
 *  `current` runs the same pure reducer at once. */
export function keepingCurrent(
  current: { current: WorkbenchState },
  reduce: (state: WorkbenchState, action: WorkbenchAction) => WorkbenchState,
  dispatch: WorkbenchDispatch,
): WorkbenchDispatch {
  return (action) => {
    current.current = reduce(current.current, action);
    dispatch(action);
  };
}

/** What the connected firmware exposes, as far as the io facade needs to
 *  know: which optional surfaces exist and how much room they have. */
export interface IoFeatures {
  sceneCapacity: number | null;
  conditionalSceneCapacity: number | null;
  scenesSupported: boolean;
  conditionalScenesSupported: boolean;
  extensionSupported: boolean;
  pointingSupported: boolean;
  lightingOutputSupported: boolean;
  /** Macro slots and the bytes they share; null without macros. */
  macroSpace: { slots: number; bytes: number } | null;
}

export const NO_IO_FEATURES: IoFeatures = {
  sceneCapacity: null,
  conditionalSceneCapacity: null,
  scenesSupported: false,
  conditionalScenesSupported: false,
  extensionSupported: false,
  pointingSupported: false,
  lightingOutputSupported: false,
  macroSpace: null,
};

/** The io facade's view of the firmware, read from the capability set so the
 *  gating lives in one place (src/capabilities). */
export function ioFeaturesFor(bundle: ConnectedBundle): IoFeatures {
  const capabilities = resolveCapabilities(firmwareFactsOf(bundle));
  return {
    sceneCapacity: capabilities.get("lighting.scenes")?.slots ?? null,
    conditionalSceneCapacity: capabilities.get("lighting.rules")?.slots ?? null,
    scenesSupported: capabilities.has("lighting.scenes"),
    conditionalScenesSupported: capabilities.has("lighting.rules"),
    extensionSupported: capabilities.has("lighting.extension"),
    pointingSupported: capabilities.has("pointing"),
    lightingOutputSupported: capabilities.has("lighting.output"),
    macroSpace: macroSpaceOf(capabilities.get("behaviors.macros")),
  };
}

function macroSpaceOf(macros: { slots: number; bytes?: number } | undefined): IoFeatures["macroSpace"] {
  return macros ? { slots: macros.slots, bytes: macros.bytes ?? 0 } : null;
}

export interface IoOptions {
  cols: number;
  onDisconnect: () => void;
  features?: IoFeatures;
  /** Guard's say on an operation's result (ADR 0019); without one, everything goes ahead. */
  judge?: Judge;
  /** Which half of a split board each LED is on. */
  ledNodes?: Readonly<Record<number, number>>;
}

/** What every io part works with. */
export interface IoContext {
  session: RynkSession;
  getState: () => WorkbenchState;
  dispatch: WorkbenchDispatch;
  cols: number;
  features: IoFeatures;
  judge: Judge;
  ledNodes: Readonly<Record<number, number>>;
  /** In Draft, puts these items in what you want and answers; in Live, answers null and the caller writes. */
  draft(values: Array<{ item: SyncItem; value: unknown }>): IoWriteResult | null;
}

/** Build the io facade. `session` writes; `dispatch` narrates. */
export function makeIo(
  session: RynkSession,
  getState: () => WorkbenchState,
  dispatch: WorkbenchDispatch,
  { cols, onDisconnect, features = NO_IO_FEATURES, judge = passEverything, ledNodes = {} }: IoOptions,
): WorkbenchIo {
  const draft: IoContext["draft"] = (values) => {
    const state = getState();
    if (!state.batchMode) return null;
    if (state.batchBusy) return { ok: false, message: "the draft is being sent" };
    dispatch({ type: "wantSet", values });
    return { ok: true };
  };
  const context: IoContext = { session, getState, dispatch, cols, features, judge, ledNodes, draft };
  return {
    apply: (name, input) => applyOperation(context, name, input),
    importLayout: (file, labels) => importLayout(context, file, labels),
    ...keyIo(context),
    ...layerIo(context),
    ...lightingIo(context),
    ...tryOutIo(context),
    ...settingsIo(context),
    disconnect() {
      onDisconnect();
    },
    rebootToBootloader(target) {
      return session.device.rebootToBootloader(target);
    },
    resetStorage() {
      return session.device.resetStorage();
    },
  };
}
