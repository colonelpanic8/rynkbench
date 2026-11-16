// The io facade: how the workbench reaches the keyboard. Every method writes
// through the session and narrates through `dispatch`; screens call it, never
// the session. Its parts are by job (io-keys, io-layers, io-lighting,
// io-settings); this file is the contract and puts them together.

import type {
  BehaviorConfig,
  EncoderAction,
  KeyAction,
  LightingExtensionState,
  LightingLayerPolicy,
  LightingMutableState,
  LightingSceneCell,
  MacroOp,
  MorseHoldTriggerPosition,
  MorseProfileEntry,
} from "../vendor/rynk-wasm/rynk_wasm";
import type { RuntimeLightingRule, RynkSession } from "../session/types";
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
import { keyIo } from "./io-keys";
import { layerIo } from "./io-layers";
import { lightingIo } from "./io-lighting";
import { settingsIo } from "./io-settings";

/** How the workbench narrates a change: React's dispatch has this type, and so
 *  can anything else that keeps a workbench. */
export type WorkbenchDispatch = (action: WorkbenchAction) => void;

export type IoWriteResult = { ok: true } | { ok: false; message: string; guarded?: true }; // guarded: Guard said no (ADR 0011)
export type KeyWrite = { layer: number; row: number; col: number; action: KeyAction };

export interface WorkbenchIo {
  setKey(
    layer: number,
    row: number,
    col: number,
    action: KeyAction,
    options?: { history?: "record" | "invalidate" },
  ): Promise<IoWriteResult>;
  /** Several keys as one change (a swap, a transform), so Guard judges them together. All are tried; the first failure is returned. */
  writeKeys(edits: readonly KeyWrite[], options?: { history?: "record" | "invalidate"; onWritten?: (ok: boolean) => void }): Promise<IoWriteResult>;
  undoKeyEdit(): Promise<IoWriteResult>;
  redoKeyEdit(): Promise<IoWriteResult>;
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
  /** Optimistic single-value writes. Each resolves once the device has
   *  answered; the reducer already reflects the outcome by then. */
  setSlot<K extends SlotKind>(kind: K, index: number, value: SlotValueOf<K>): Promise<IoWriteResult>;
  writeMacros(ops: MacroOp[][]): Promise<IoWriteResult>;
  setBehavior(config: BehaviorConfig): Promise<IoWriteResult>;
  setMorseProfile(entry: MorseProfileEntry): Promise<IoWriteResult>;
  deleteMorseProfile(index: number): Promise<IoWriteResult>;
  setMorseHoldTriggerPositions(positions: MorseHoldTriggerPosition[]): Promise<IoWriteResult>;
  applyPointingConfig(): Promise<IoWriteResult>;
  reloadPointingConfig(): Promise<IoWriteResult>;
  disconnect(): void;
  rebootToBootloader(target?: BootloaderTarget): Promise<void>;
  resetStorage(): Promise<void>;
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
}

export const NO_IO_FEATURES: IoFeatures = {
  sceneCapacity: null,
  conditionalSceneCapacity: null,
  scenesSupported: false,
  conditionalScenesSupported: false,
  extensionSupported: false,
  pointingSupported: false,
  lightingOutputSupported: false,
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
  };
}

export interface IoOptions {
  cols: number;
  onDisconnect: () => void;
  features?: IoFeatures;
}

/** What every io part works with. */
export interface IoContext {
  session: RynkSession;
  getState: () => WorkbenchState;
  dispatch: WorkbenchDispatch;
  cols: number;
  features: IoFeatures;
}

/** Build the io facade. `session` writes; `dispatch` narrates. */
export function makeIo(
  session: RynkSession,
  getState: () => WorkbenchState,
  dispatch: WorkbenchDispatch,
  { cols, onDisconnect, features = NO_IO_FEATURES }: IoOptions,
): WorkbenchIo {
  const context: IoContext = { session, getState, dispatch, cols, features };
  return {
    ...keyIo(context),
    ...layerIo(context),
    ...lightingIo(context),
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
