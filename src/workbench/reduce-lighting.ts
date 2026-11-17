// The reducer's lighting part: the device's lighting state, the try-out
// lights (the overlay), layer drafts, scenes, rules, the extension effect.

import type { WorkbenchAction, WorkbenchState } from "../model/workbench-state";
import { sameOverlayLights } from "../model/lighting/compare";
import { wantOf, withLightingRead, withRead, withWant } from "./draft/want";
import { cellsToRecord, layerSceneCells, lightingDraftFor, withLayerDraft } from "./lighting-drafts";

const LIGHTING_ACTION_TYPES = [
  "lightingRefresh",
  "paint",
  "erase",
  "draftReset",
  "lightingBusy",
  "tryOutSet",
  "tryOutSent",
  "tryOutCleared",
  "tryOutFailed",
  "scenesApplied",
  "conditionalDraft",
  "conditionalDraftReset",
  "conditionalApplied",
  "scenePolicySet",
  "wakeLayersSet",
  "extensionStateSet",
  "extensionParamsLoaded",
  "hoverLeds",
  "lightingStateSet",
  "realtimeStored",
] as const;

export type LightingAction = Extract<WorkbenchAction, { type: (typeof LIGHTING_ACTION_TYPES)[number] }>;

const LIGHTING_ACTIONS = new Set<WorkbenchAction["type"]>(LIGHTING_ACTION_TYPES);

export function isLightingAction(act: WorkbenchAction): act is LightingAction {
  return LIGHTING_ACTIONS.has(act.type);
}

export function reduceLighting(state: WorkbenchState, act: LightingAction): WorkbenchState {
  switch (act.type) {
    case "lightingRefresh": {
      const applied = cellsToRecord(act.overlay);
      const nothingWaits = sameOverlayLights(state.tryOut, state.applied);
      // The counters and names are the keyboard's; what it stores is read, and
      // drafts you had not changed follow it, changed ones stay (ADR 0018).
      const counted = {
        ...state,
        lightingOutputMode: act.outputMode ? { ...act.outputMode, wake_layers: state.lightingOutputMode?.wake_layers ?? state.base.wakeLayers } : state.lightingOutputMode,
        lightingExtension: act.extension ? { ...act.extension, state: state.lightingExtension?.state ?? act.extension.state } : state.lightingExtension,
        lightingExtensionLayers: act.extensionLayers ? { ...act.extensionLayers, overlay: state.lightingExtensionLayers?.overlay } : state.lightingExtensionLayers,
      };
      const stored = withRead(counted, {
        ...(act.scenes ? { scenes: act.scenes } : {}),
        ...(act.runtimeConditional ? { runtimeConditionalScenes: act.runtimeConditional } : {}),
        ...(act.outputMode ? { wakeLayers: act.outputMode.wake_layers } : {}),
        ...(act.extension ? { extension: act.extension.state } : {}),
        ...(act.extensionLayers ? { extensionOverlay: act.extensionLayers.overlay ?? null } : {}),
      });
      return {
        ...withLightingRead(stored, act.state),
        applied,
        tryOut: nothingWaits ? { ...applied } : state.tryOut,
      };
    }
    case "paint": {
      const draft = { ...lightingDraftFor(state, act.layer) };
      for (const cell of act.cells) draft[cell.led_id] = cell;
      return { ...state, ...withLayerDraft(state, act.layer, draft), lightingError: null };
    }
    case "erase": {
      const draft = { ...lightingDraftFor(state, act.layer) };
      for (const id of act.ledIds) delete draft[id];
      return { ...state, ...withLayerDraft(state, act.layer, draft) };
    }
    case "draftReset":
      return { ...state, ...withLayerDraft(state, act.layer, layerSceneCells(state.scenes, act.layer)), lightingError: null };
    case "lightingBusy":
      return {
        ...state,
        lightingBusy: act.busy,
        lightingError: act.error === undefined ? state.lightingError : act.error,
      };
    case "tryOutSet": {
      const tryOut = { ...state.tryOut };
      for (const led of act.erase) delete tryOut[led];
      for (const cell of act.cells) tryOut[cell.led_id] = cell;
      return { ...state, tryOut, lightingError: null };
    }
    case "tryOutSent":
      return { ...withLightingRead(state, act.state), applied: cellsToRecord(act.cells), lightingError: null };
    case "tryOutCleared":
      return { ...withLightingRead(state, act.state), applied: {}, tryOut: {}, lightingError: null };
    case "tryOutFailed":
      return { ...state, lightingError: act.error };
    case "scenesApplied":
      return {
        ...withLightingRead(withRead(state, { scenes: act.cells }), act.state),
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
        ...withLightingRead(
          withWant(withRead(state, { runtimeConditionalScenes: act.cells }), { ...wantOf(state), runtimeConditionalScenes: act.cells }),
          act.state,
        ),
        lightingBusy: false,
        lightingError: null,
      };
    case "scenePolicySet":
      return {
        ...withLightingRead(withRead({ ...state, scenePolicy: state.scenePolicy ?? act.policy }, { layerPolicy: act.policy }), act.state),
        lightingBusy: false,
        lightingError: null,
      };
    case "wakeLayersSet":
      return {
        ...withRead(
          { ...state, lightingOutputMode: { ...act.outputMode, wake_layers: state.lightingOutputMode?.wake_layers ?? state.base.wakeLayers } },
          { wakeLayers: act.outputMode.wake_layers },
        ),
        lightingBusy: false,
        lightingError: null,
      };
    case "extensionStateSet":
      return {
        ...withLightingRead(
          withRead(
            {
              ...state,
              lightingExtension: state.lightingExtension && { ...state.lightingExtension, revision: act.state.revision },
              lightingExtensionLayers: act.extensionLayers && { ...act.extensionLayers, overlay: state.lightingExtensionLayers?.overlay },
            },
            { extension: act.extension, ...(act.extensionLayers ? { extensionOverlay: act.extensionLayers.overlay ?? null } : {}) },
          ),
          act.state,
        ),
        lightingBusy: false,
        lightingError: null,
      };
    case "extensionParamsLoaded": {
      const values = act.items.map((param) => param.value);
      const known = state.extensionParams[act.effect];
      // An effect read for the first time is what the keyboard holds; one read
      // again is a read like any other: drafted values stay.
      if (!known || known.length !== values.length) {
        return {
          ...state,
          base: { ...state.base, effectParams: { ...state.base.effectParams, [act.effect]: values } },
          extensionParams: { ...state.extensionParams, [act.effect]: act.items },
        };
      }
      const next = withRead(state, { effectParams: { ...state.base.effectParams, [act.effect]: values } });
      const wanted = next.extensionParams[act.effect];
      return {
        ...next,
        extensionParams: { ...next.extensionParams, [act.effect]: act.items.map((item, index) => ({ ...item, value: wanted[index].value })) },
      };
    }
    case "hoverLeds":
      return { ...state, hoverLeds: act.leds };
    case "lightingStateSet":
      return { ...withLightingRead(state, act.state), lightingBusy: false, lightingError: null };
    case "realtimeStored": {
      const parts = act.parts.effectParams ? { ...act.parts, effectParams: { ...state.base.effectParams, ...act.parts.effectParams } } : act.parts;
      const read = withRead(state, parts);
      return { ...(act.lighting ? withLightingRead(read, act.lighting) : read), lightingError: null };
    }
  }
}
