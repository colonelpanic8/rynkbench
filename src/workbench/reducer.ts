// The workbench reducer: every change to the open workbench is an action, and
// topic events from the keyboard and optimistic writes both arrive here. This
// file has keys, key history, Draft, encoders, layers and topics; lighting and
// settings have their own parts (reduce-lighting.ts, reduce-settings.ts).

import type { EncoderAction, KeyAction } from "../vendor/rynk-wasm/rynk_wasm";
import type { WorkbenchAction, WorkbenchState } from "../model/workbench-state";
import { reduceKeyEditHistory } from "../model/history";
import { normalizePointingConfig } from "../model/pointing";
import { draftEditCount } from "./draft/selectors";
import { applyPatch, withValues, type KeyboardImage } from "../sync";
import { atBase, storedImage, wantOf, withBase, withItemsAtBase, withRead, withStored, withWant } from "./draft/want";
import { encoderPendingId, keyPendingId } from "./pending";
import { isLightingAction, reduceLighting } from "./reduce-lighting";
import { isSettingsAction, reduceSettings } from "./reduce-settings";

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

/** Where the layer on show went in a rewrite (`order`: destination → source slot). */
function movedLayer(layer: number, order: readonly number[]): number {
  const moved = order.findIndex((source) => source === layer);
  return moved >= 0 ? moved : Math.min(layer, order.length - 1);
}

function withEncoder(image: KeyboardImage, layer: number, id: number, action: EncoderAction | undefined): KeyboardImage {
  const encoders = image.encoders.map((row) => [...row]);
  if (encoders[layer]) encoders[layer][id] = action as EncoderAction;
  return { ...image, encoders };
}

/** Live writes and their answers: the keyboard holds what they show, so these
 *  parts of the base are set with what you want (ADR 0018). Optimistic writes
 *  set it at the start and put it back on an error, like a key. */
const LIVE_WRITES: Partial<Record<WorkbenchAction["type"], (keyof KeyboardImage)[]>> = {
  fieldWriteStart: ["behavior", "behaviorOptions", "macroOps", "holdTriggerPositions", "autoMouseLayers"],
  fieldWriteErr: ["behavior", "behaviorOptions", "macroOps", "holdTriggerPositions", "autoMouseLayers"],
  morseProfileWriteStart: ["morseProfiles"],
  morseProfileWriteErr: ["morseProfiles"],
  morseProfileDeleteStart: ["morseProfiles", "holdTriggerPositions"],
  morseProfileDeleteErr: ["morseProfiles", "holdTriggerPositions"],
  defaultLayer: ["defaultLayer"],
  layerMetadataSet: ["metadata"],
  pointingWriteOk: ["pointing"],
  pointingReloaded: ["pointing"],
};

function withLiveBase(state: WorkbenchState, parts: readonly (keyof KeyboardImage)[]): WorkbenchState {
  const want = wantOf(state);
  const base = { ...state.base };
  for (const part of parts) if (base[part] !== undefined) (base as Record<string, unknown>)[part] = want[part];
  return { ...state, base };
}

export function makeWorkbenchReducer(cols: number) {
  const reduce = (state: WorkbenchState, act: WorkbenchAction): WorkbenchState => {
    if (isLightingAction(act)) return reduceLighting(state, act);
    if (isSettingsAction(act)) return reduceSettings(state, act);
    return reduceRest(state, act);
  };
  return function reducer(state: WorkbenchState, act: WorkbenchAction): WorkbenchState {
    const next = reduce(state, act);
    const live = LIVE_WRITES[act.type];
    return live && next !== state ? withLiveBase(next, live) : next;
  };

  function reduceRest(state: WorkbenchState, act: WorkbenchAction): WorkbenchState {
    switch (act.type) {
      case "mode":
        return { ...state, mode: act.mode, selection: null, hoverLeds: null };
      case "uiLayer":
        return { ...state, uiLayer: act.layer };
      case "select":
        return { ...state, selection: act.selection };
      case "keyWriteStart": {
        // Live: the keyboard is written at once, so it holds the key as soon as it says yes.
        const id = keyPendingId(act.layer, act.row, act.col);
        return {
          ...state,
          base: { ...state.base, layers: setLayerKey(state.base.layers, cols, act.layer, act.row, act.col, act.action) },
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
          base: { ...state.base, layers: setLayerKey(state.base.layers, cols, act.layer, act.row, act.col, act.prev) },
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
        // Leaving Draft needs the drafted keys, encoders and slots sent or
        // discarded, never silently written or dropped.
        if (!act.enabled && draftEditCount(state) > 0) return state;
        return { ...state, batchMode: act.enabled, batchError: null };
      }
      case "keyStage":
        return { ...state, layers: setLayerKey(state.layers, cols, act.layer, act.row, act.col, act.action) };
      case "encoderStage":
        return { ...state, encoders: { ...state.encoders, [`${act.layer}:${act.id}`]: act.action } };
      case "slotStage": {
        const table = [...state[act.kind]] as unknown[];
        table[act.index] = act.value;
        return { ...state, [act.kind]: table };
      }
      case "batchDiscard":
        return { ...atBase(state), batchError: null };
      case "draftRevert":
        return withItemsAtBase(state, act.items);
      case "wantSet":
        return withWant(state, withValues(wantOf(state), act.values));
      case "wantImage":
        return withWant(state, act.image);
      case "draftStored":
        return withBase(state, act.image);
      case "draftRestore": {
        const base = applyPatch(state.base, act.patch, "before");
        const restored = { ...state, base, scenes: base.scenes, runtimeConditionalScenes: base.runtimeConditionalScenes };
        return withWant(restored, applyPatch(wantOf(restored), act.patch, "after"));
      }
      case "batchApplyStart":
        return { ...state, batchBusy: true, batchError: null };
      case "batchApplyDone":
        return { ...state, batchBusy: false, batchError: act.error };
      case "encoderLoaded":
        return withStored(state, [{ item: { kind: "encoder", layer: act.layer, id: act.id }, value: act.action }]);
      case "encoderWriteStart": {
        const id = encoderPendingId(act.layer, act.id);
        return {
          ...state,
          base: withEncoder(state.base, act.layer, act.id, act.action),
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
          base: withEncoder(state.base, act.layer, act.id, act.prev),
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
      case "layerRewriteDrafted":
        return {
          ...withWant(state, act.image),
          uiLayer: movedLayer(state.uiLayer, act.order),
          selection: null,
          layerBusy: false,
          layerError: null,
        };
      case "layerOperationApplied": {
        const rewrite = act.rewrite;
        const pointing = rewrite.pointing ? normalizePointingConfig(rewrite.pointing) : null;
        const uiLayer = movedLayer(state.uiLayer, rewrite.order);
        const next: WorkbenchState = {
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
          layerBusy: false,
          layerError: null,
        };
        // The keyboard holds the rewrite, and so does what you want.
        return { ...next, base: storedImage(next) };
      }
      case "topicLayers":
        return {
          ...withRead(state, { defaultLayer: act.defaultLayer }),
          activeLayers: act.activeLayers,
          layerStateComplete: act.complete,
          currentLayer: Math.max(act.defaultLayer, ...act.activeLayers),
        };
      case "topicBattery":
        return { ...state, battery: act.battery };
      case "topicConnection":
        return { ...state, connection: act.connection };
      case "topicLedIndicator":
        return { ...state, ledIndicator: act.indicator };
      case "topicModifier":
        return { ...state, modifierState: act.modifiers };
      default:
        return state;
    }
  }
}
