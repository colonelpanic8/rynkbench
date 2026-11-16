// The reducer's lighting part: the device's lighting state, the overlay and
// layer drafts, scenes, rules, the extension effect. Its cases are the
// reducer's own, moved here unchanged (ADR 0017).

import type { WorkbenchAction, WorkbenchState } from "../model/workbench-state";
import { conditionalTablesEqual, overlaysEqual } from "../model/lighting/compare";
import { cellsToRecord, layerSceneCells, lightingDraftFor, reseedLayerDrafts, setTargetDraft } from "./lighting-drafts";

const LIGHTING_ACTION_TYPES = [
  "lightingRefresh",
  "lightingTarget",
  "paint",
  "erase",
  "draftReset",
  "lightingBusy",
  "overlayApplied",
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
        lightingControls:
          act.outputMode === undefined || act.outputMode === null
            ? state.lightingControls
            : { ...state.lightingControls, wake_layers: act.outputMode.wake_layers },
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
      const target = act.target ?? state.lightingTarget;
      const draft = { ...lightingDraftFor(state, target) };
      for (const cell of act.cells) draft[cell.led_id] = cell;
      return { ...state, ...setTargetDraft(state, target, draft), lightingError: null };
    }
    case "erase": {
      const target = act.target ?? state.lightingTarget;
      const draft = { ...lightingDraftFor(state, target) };
      for (const id of act.ledIds) delete draft[id];
      return { ...state, ...setTargetDraft(state, target, draft) };
    }
    case "draftReset": {
      const target = act.target ?? state.lightingTarget;
      const reset =
        target === "overlay"
          ? { ...state.applied }
          : layerSceneCells(state.scenes, target);
      return {
        ...state,
        ...setTargetDraft(state, target, reset),
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
    case "wakeLayersSet":
      return {
        ...state,
        lightingOutputMode: act.outputMode,
        lightingControls: {
          ...state.lightingControls,
          wake_layers: act.outputMode.wake_layers,
        },
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
    case "lightingStateSet":
      return { ...state, lightingState: act.state, lightingBusy: false, lightingError: null };
  }
}
