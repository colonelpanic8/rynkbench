// Workbench state: one reducer, one context. Topic events and optimistic
// writes both funnel through dispatch; components read via useWorkbench().

import { createContext, useContext } from "react";
import type { Dispatch } from "react";
import type {
  BatteryStatus,
  BehaviorConfig,
  Combo,
  ConnectionStatus,
  DeviceCapabilities,
  DeviceInfo,
  EncoderAction,
  Fork,
  KeyAction,
  LedIndicator,
  LightingCapabilities,
  LightingLayerPolicy,
  LightingMutableState,
  LightingOverlayCell,
  LightingSceneCell,
  LightingSceneStatus,
  LightingState,
  Morse,
  ProtocolVersion,
} from "../vendor/rynk-wasm/rynk_wasm";
import type { RynkSession } from "../session/types";
import type { KeyboardModel } from "../model/keyboard";

export type Mode = "keymap" | "lighting" | "advanced" | "device";

export type Selection =
  | { type: "key"; row: number; col: number }
  | { type: "encoder"; id: number };

/** Everything loaded during the connect flow, before the workbench mounts. */
export interface ConnectedBundle {
  session: RynkSession;
  model: KeyboardModel;
  info: DeviceInfo;
  caps: DeviceCapabilities;
  protocol: ProtocolVersion;
  lightingCaps: LightingCapabilities | null;
  overlayReadSupported: boolean;
  layers: KeyAction[][];
  currentLayer: number;
  defaultLayer: number;
  battery: BatteryStatus;
  connection: ConnectionStatus | null;
  lightingState: LightingState | null;
  overlay: LightingOverlayCell[];
  /** null when the firmware has no layer-scene support (local-preset mode). */
  sceneStatus: LightingSceneStatus | null;
  /** On-device scene table; always empty when sceneStatus is null. */
  scenes: LightingSceneCell[];
  /** Advanced tables; empty arrays when the device reports zero capacity. */
  combos: Combo[];
  morse: Morse[];
  forks: Fork[];
  macroBytes: Uint8Array;
  /** null when the device rejected the read (feature-gated out). */
  behavior: BehaviorConfig | null;
  ledIndicator: LedIndicator | null;
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
  ? Combo
  : K extends "morse"
    ? Morse
    : Fork;

export function slotPendingId(kind: SlotKind, index: number): string {
  return `${kind}:${index}`;
}

export interface WorkbenchState {
  mode: Mode;
  uiLayer: number;
  currentLayer: number;
  defaultLayer: number;
  layers: KeyAction[][];
  /** `${layer}:${encoderId}` → loaded encoder action. */
  encoders: Record<string, EncoderAction>;
  battery: BatteryStatus;
  connection: ConnectionStatus | null;
  lightingState: LightingState | null;
  /** Overlay as last known on-device, keyed by LED id. */
  applied: Record<number, LightingOverlayCell>;
  /** Overlay as the user wants it (staged), keyed by LED id. */
  draft: Record<number, LightingOverlayCell>;
  /** On-device scene table as last known (empty without firmware support). */
  scenes: LightingSceneCell[];
  /** Layer-composition policy; null when scenes are unsupported. */
  scenePolicy: LightingLayerPolicy | null;
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
  combos: Combo[];
  morse: Morse[];
  forks: Fork[];
  macroBytes: Uint8Array;
  behavior: BehaviorConfig | null;
  ledIndicator: LedIndicator | null;
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

export function initialWorkbenchState(bundle: ConnectedBundle): WorkbenchState {
  const applied = cellsToRecord(bundle.overlay);
  return {
    mode: "keymap",
    uiLayer: bundle.currentLayer,
    currentLayer: bundle.currentLayer,
    defaultLayer: bundle.defaultLayer,
    layers: bundle.layers,
    encoders: {},
    battery: bundle.battery,
    connection: bundle.connection,
    lightingState: bundle.lightingState,
    applied,
    draft: { ...applied },
    scenes: bundle.scenes,
    scenePolicy: bundle.sceneStatus?.policy ?? null,
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
    ledIndicator: bundle.ledIndicator,
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
  | { type: "topicLayer"; layer: number }
  | { type: "topicBattery"; battery: BatteryStatus }
  | { type: "topicConnection"; connection: ConnectionStatus }
  | {
      type: "lightingRefresh";
      state: LightingState;
      overlay: LightingOverlayCell[];
      /** Present only when the device supports on-device scenes. */
      scenes?: LightingSceneCell[];
    }
  | { type: "paint"; cells: LightingOverlayCell[] }
  | { type: "erase"; ledIds: number[] }
  | { type: "draftReset" }
  | { type: "draftSet"; cells: LightingOverlayCell[] }
  | { type: "lightingBusy"; busy: boolean; error?: string | null }
  | { type: "overlayApplied"; state: LightingState; cells: LightingOverlayCell[] }
  | { type: "scenesApplied"; state: LightingState; cells: LightingSceneCell[] }
  | { type: "scenePolicySet"; state: LightingState; policy: LightingLayerPolicy }
  | { type: "hoverLeds"; leds: number[] | null }
  | { type: "lightingSelect"; leds: number[] }
  | { type: "lightingStateSet"; state: LightingState }
  | { type: "slotWriteStart"; kind: SlotKind; index: number; value: Combo | Morse | Fork }
  | { type: "slotWriteOk"; kind: SlotKind; index: number }
  | {
      type: "slotWriteErr";
      kind: SlotKind;
      index: number;
      prev: Combo | Morse | Fork;
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
  | { type: "topicLedIndicator"; indicator: LedIndicator };

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
      case "topicLayer":
        return { ...state, currentLayer: act.layer };
      case "topicBattery":
        return { ...state, battery: act.battery };
      case "topicConnection":
        return { ...state, connection: act.connection };
      case "lightingRefresh": {
        const applied = cellsToRecord(act.overlay);
        const draftWasClean = overlaysEqual(state.draft, state.applied);
        return {
          ...state,
          lightingState: act.state,
          applied,
          draft: draftWasClean ? { ...applied } : state.draft,
          scenes: act.scenes ?? state.scenes,
        };
      }
      case "paint": {
        const draft = { ...state.draft };
        const paintTick = { ...state.paintTick };
        for (const cell of act.cells) {
          draft[cell.led_id] = cell;
          paintTick[cell.led_id] = (paintTick[cell.led_id] ?? 0) + 1;
        }
        return { ...state, draft, paintTick, lightingError: null };
      }
      case "erase": {
        const draft = { ...state.draft };
        const paintTick = { ...state.paintTick };
        for (const id of act.ledIds) {
          delete draft[id];
          paintTick[id] = (paintTick[id] ?? 0) + 1;
        }
        return { ...state, draft, paintTick };
      }
      case "draftReset":
        return { ...state, draft: { ...state.applied }, lightingError: null };
      case "draftSet":
        return { ...state, draft: cellsToRecord(act.cells), lightingError: null };
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
      case "hoverLeds":
        return { ...state, hoverLeds: act.leds };
      case "lightingSelect":
        return { ...state, lightingSelection: act.leds };
      case "lightingStateSet":
        return { ...state, lightingState: act.state, lightingBusy: false, lightingError: null };
      case "slotWriteStart": {
        const id = slotPendingId(act.kind, act.index);
        const table = state[act.kind].slice() as Array<Combo | Morse | Fork>;
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
        const table = state[act.kind].slice() as Array<Combo | Morse | Fork>;
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
      case "topicLedIndicator":
        return { ...state, ledIndicator: act.indicator };
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

/** LED ids whose draft differs from the applied overlay. */
export function stagedLedIds(state: WorkbenchState): Set<number> {
  const out = new Set<number>();
  for (const k of Object.keys(state.draft)) {
    const id = Number(k);
    const a = state.applied[id];
    if (!a || JSON.stringify(a) !== JSON.stringify(state.draft[id])) out.add(id);
  }
  for (const k of Object.keys(state.applied)) {
    const id = Number(k);
    if (!(id in state.draft)) out.add(id);
  }
  return out;
}

export interface WorkbenchContextValue {
  bundle: ConnectedBundle;
  state: WorkbenchState;
  dispatch: Dispatch<WorkbenchAction>;
  /** Bound async operations (optimistic writes, lighting transactions). */
  io: WorkbenchIo;
}

export interface WorkbenchIo {
  setKey(layer: number, row: number, col: number, action: KeyAction): void;
  loadEncoder(layer: number, id: number): void;
  setEncoder(layer: number, id: number, action: EncoderAction): void;
  setDefaultLayer(layer: number): void;
  applyOverlay(cells: LightingOverlayCell[]): void;
  clearOverlay(): void;
  refreshLighting(): void;
  setLightingState(state: LightingMutableState): void;
  /** Replace the on-device scene table (only when scenes are supported). */
  applyScenes(cells: LightingSceneCell[]): void;
  setScenePolicy(policy: LightingLayerPolicy): void;
  setSlot<K extends SlotKind>(kind: K, index: number, value: SlotValueOf<K>): void;
  writeMacros(bytes: Uint8Array): void;
  setBehavior(config: BehaviorConfig): void;
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
): WorkbenchIo {
  return {
    setKey(layer, row, col, action) {
      const prev = getState().layers[layer][row * cols + col];
      dispatch({ type: "keyWriteStart", layer, row, col, action });
      session.keymap.setKey(layer, row, col, action).then(
        () => dispatch({ type: "keyWriteOk", layer, row, col }),
        (err) =>
          dispatch({
            type: "keyWriteErr",
            layer,
            row,
            col,
            prev,
            attempted: action,
            message: errorMessage(err),
          }),
      );
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
        session.lighting.readOverlay().catch(() => Object.values(getState().applied)),
        scenesSupported
          ? session.lighting.scenes.readScenes().catch(() => getState().scenes)
          : Promise.resolve(undefined),
      ]).then(
        ([lightingState, overlay, scenes]) =>
          dispatch({ type: "lightingRefresh", state: lightingState, overlay, scenes }),
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
    setScenePolicy(policy) {
      dispatch({ type: "lightingBusy", busy: true, error: null });
      session.lighting.scenes.setLayerPolicy(policy).then(
        (lightingState) => dispatch({ type: "scenePolicySet", state: lightingState, policy }),
        (err) => dispatch({ type: "lightingBusy", busy: false, error: errorMessage(err) }),
      );
    },
    setSlot(kind, index, value) {
      const prev = getState()[kind][index];
      dispatch({ type: "slotWriteStart", kind, index, value });
      const write =
        kind === "combos"
          ? session.combos.set(index, value as Combo)
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
    disconnect() {
      onDisconnect();
    },
    rebootToBootloader() {
      return session.device.rebootToBootloader();
    },
  };
}
