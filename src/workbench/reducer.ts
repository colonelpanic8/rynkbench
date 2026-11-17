// The workbench reducer: every change to the open workbench is an action, and
// topic events from the keyboard and optimistic writes both arrive here. This
// file has keys, key history, Draft, encoders, layers and topics; lighting and
// settings have their own parts (reduce-lighting.ts, reduce-settings.ts).

import type { EncoderAction, KeyAction } from "../vendor/rynk-wasm/rynk_wasm";
import type { WorkbenchAction, WorkbenchState, WritableField } from "../model/workbench-state";
import { selectionWith } from "../model/key-selection";
import { draftEditCount } from "./draft/selectors";
import { sameValue } from "../model/deep-equal";
import { applyPatch, itemKey, patchBetween, valueAt, withValues, type KeyboardImage, type SyncItem } from "../sync";
import { recordStep, travel } from "./draft/history";
import { atBase, wantOf, withBase, withBasisInUse, withItemsAtBase, withRead, withStored, withWant } from "./draft/want";
import { encoderPendingId, keyPendingId } from "./pending";
import { labelsFor } from "./labels";
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

const FIELD_ITEM: Record<WritableField, SyncItem> = {
  behavior: { kind: "behavior" },
  behaviorOptions: { kind: "behaviorOptions" },
  macros: { kind: "macros" },
  morseHoldTriggerPositions: { kind: "holdTriggerPositions" },
  autoMouseLayers: { kind: "autoMouseLayers" },
};

type LiveWrites = {
  [Type in WorkbenchAction["type"]]?: (act: Extract<WorkbenchAction, { type: Type }>, before: WorkbenchState) => SyncItem[];
};

/** Live writes and their answers: the keyboard holds the items they name, so
 *  the base takes those from what you want (ADR 0018); anything else drafted
 *  stays in the draft. Optimistic writes set them at the start and put them
 *  back on an error, like a key. */
const LIVE_WRITES: LiveWrites = {
  fieldWriteStart: (act) => [FIELD_ITEM[act.field]],
  fieldWriteErr: (act) => [FIELD_ITEM[act.field]],
  defaultLayer: () => [{ kind: "defaultLayer" }],
  layerMetadataSet: (act) => [{ kind: "layerMetadata", layer: act.layer }],
  pointingReloaded: () => [{ kind: "pointing" }],
};

function withLiveBase(state: WorkbenchState, items: readonly SyncItem[]): WorkbenchState {
  const want = wantOf(state);
  const held = items.filter((item) => valueAt(state.base, item) !== undefined);
  return { ...state, base: withValues(state.base, held.map((item) => ({ item, value: valueAt(want, item) }))) };
}

/** Edits: each changes what you want and is one step of the history (ADR 0018).
 *  Reads change it too, by following the keyboard, and are no step. */
const COMMITS = new Set<WorkbenchAction["type"]>([
  "keyStage", "encoderStage", "slotStage", "wantSet", "commit", "paint", "erase", "draftReset",
  "conditionalDraft", "conditionalDraftReset", "pointingDraftSet", "pointingDraftReset", "draftRevert", "batchDiscard",
  "keyWriteStart", "encoderWriteStart", "slotWriteStart", "fieldWriteStart", "defaultLayer", "layerMetadataSet", "lightingStateSet",
  "scenePolicySet", "wakeLayersSet", "extensionStateSet",
]);
/** A Live write that failed puts back what it changed: that joins its step. */
const FAILED_WRITES = new Set<WorkbenchAction["type"]>([
  "keyWriteErr", "encoderWriteErr", "slotWriteErr", "fieldWriteErr",
]);

function withStep(before: WorkbenchState, after: WorkbenchState, join: boolean): WorkbenchState {
  const changes = patchBetween(wantOf(before), wantOf(after));
  const labels = sameValue(before.labels, after.labels) ? undefined : { before: before.labels, after: after.labels };
  const history = recordStep(after.history, changes, join, labels);
  // An edit: what the last send left behind may be tried again.
  const batchError = changes.length > 0 ? null : after.batchError;
  return history === after.history && batchError === after.batchError ? after : { ...after, history, batchError };
}

export function makeWorkbenchReducer(cols: number) {
  const reduce = (state: WorkbenchState, act: WorkbenchAction): WorkbenchState => {
    if (isLightingAction(act)) return reduceLighting(state, act);
    if (isSettingsAction(act)) return reduceSettings(state, act);
    return reduceRest(state, act);
  };
  return function reducer(state: WorkbenchState, act: WorkbenchAction): WorkbenchState {
    let next = reduce(state, act);
    if (next === state) return state;
    const live = LIVE_WRITES[act.type] as ((act: WorkbenchAction, before: WorkbenchState) => SyncItem[]) | undefined;
    if (live) next = withLiveBase(next, live(act, state));
    const join = FAILED_WRITES.has(act.type) || (act.type === "commit" && act.join === true);
    if (COMMITS.has(act.type) || join) next = withStep(state, next, join);
    return withBasisInUse(next);
  };

  function reduceRest(state: WorkbenchState, act: WorkbenchAction): WorkbenchState {
    switch (act.type) {
      case "mode":
        return { ...state, mode: act.mode, selection: null, hoverLeds: null };
      case "uiLayer":
        return { ...state, uiLayer: act.layer };
      case "select":
        return { ...state, selection: act.selection };
      case "selectKeys":
        return { ...state, selection: selectionWith(state.selection, act.keys, act.how) };
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
      case "historyTravel": {
        const moved = travel(state.history, act.direction);
        if (!moved) return state;
        const labels = moved.step.labels?.[act.direction === "undo" ? "before" : "after"] ?? state.labels;
        return { ...withWant(state, applyPatch(wantOf(state), moved.patch)), history: moved.history, labels };
      }
      case "historyStroke":
        return { ...state, history: { ...state.history, stroke: act.open ? "open" : "none" } };
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
      case "labelsLoaded":
        return { ...state, labels: labelsFor(act.labels, wantOf(state)) };
      case "commit": {
        const next = { ...withWant(state, act.image), labels: act.labels ?? state.labels };
        return act.layerOrder ? { ...next, uiLayer: movedLayer(state.uiLayer, act.layerOrder), selection: null } : next;
      }
      case "draftStored":
        return withBase(state, act.image, act.wrote);
      case "draftRestore": {
        const restored = new Set(act.patch.map(({ item }) => itemKey(item)));
        const basedOn = [
          ...state.basedOn.filter(({ item }) => !restored.has(itemKey(item))),
          ...act.patch.filter(({ before }) => before !== undefined).map(({ item, before }) => ({ item, value: before })),
        ];
        return withWant({ ...state, basedOn }, applyPatch(wantOf(state), act.patch, "after"));
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
      case "layerOperationDone":
        return { ...state, layerBusy: false, layerError: null };
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
