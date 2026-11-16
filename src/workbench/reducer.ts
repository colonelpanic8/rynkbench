// The workbench reducer: every change to the open workbench is an action, and
// topic events from the keyboard and optimistic writes both arrive here. This
// file has keys, key history, Draft, encoders, layers and topics; lighting and
// settings have their own parts (reduce-lighting.ts, reduce-settings.ts).

import type { KeyAction } from "../vendor/rynk-wasm/rynk_wasm";
import type { WorkbenchAction, WorkbenchState } from "../model/workbench-state";
import { same } from "../model/deep-equal";
import { reduceKeyEditHistory } from "../model/history";
import { normalizePointingConfig } from "../model/pointing";
import { stagedEditCount } from "./draft/selectors";
import { discardStagedSlots, reduceStagedSlot } from "./draft/slot-stage";
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

export function makeWorkbenchReducer(cols: number) {
  return function reducer(state: WorkbenchState, act: WorkbenchAction): WorkbenchState {
    if (act.type === "slotStage" || act.type === "slotStageApplied") return reduceStagedSlot(state, act);
    if (isLightingAction(act)) return reduceLighting(state, act);
    if (isSettingsAction(act)) return reduceSettings(state, act);
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
          state.stagedKeys[id]?.before ?? act.before ?? state.layers[act.layer][act.row * cols + act.col];
        const layers = setLayerKey(state.layers, cols, act.layer, act.row, act.col, act.action);
        if (same(before, act.action)) {
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
        if (same(before, act.action)) {
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
          ...discardStagedSlots(state),
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
      case "topicLedIndicator":
        return { ...state, ledIndicator: act.indicator };
      case "topicModifier":
        return { ...state, modifierState: act.modifiers };
    }
  };
}
