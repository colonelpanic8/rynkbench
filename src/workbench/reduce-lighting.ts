// The reducer's lighting part: the device's lighting state, the overlay and
// layer drafts, scenes, rules, the extension effect. Its cases are the
// reducer's own, moved here unchanged (ADR 0017).

import type { WorkbenchAction, WorkbenchState } from "../model/workbench-state";
import { overlaysEqual } from "../model/lighting/compare";
import { wantOf, withLightingRead, withRead, withWant, withWritten } from "./draft/want";
import { cellsToRecord, layerSceneCells, lightingDraftFor, setTargetDraft } from "./lighting-drafts";

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
        draft: draftWasClean ? { ...applied } : state.draft,
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
        ...withLightingRead(state, act.state),
        applied,
        draft: { ...applied },
        lightingBusy: false,
        lightingError: null,
      };
    }
    case "scenesApplied":
      return {
        ...withLightingRead(withWritten(state, { scenes: act.cells }), act.state),
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
          withWant(withWritten(state, { runtimeConditionalScenes: act.cells }), { ...wantOf(state), runtimeConditionalScenes: act.cells }),
          act.state,
        ),
        lightingBusy: false,
        lightingError: null,
      };
    case "scenePolicySet":
      return {
        ...withLightingRead(withWritten({ ...state, scenePolicy: state.scenePolicy ?? act.policy }, { layerPolicy: act.policy }), act.state),
        lightingBusy: false,
        lightingError: null,
      };
    case "wakeLayersSet":
      return {
        ...withWritten(
          { ...state, lightingOutputMode: { ...act.outputMode, wake_layers: state.lightingOutputMode?.wake_layers ?? state.base.wakeLayers } },
          { wakeLayers: act.outputMode.wake_layers },
        ),
        lightingBusy: false,
        lightingError: null,
      };
    case "extensionStateSet":
      return {
        ...withLightingRead(
          withWritten(
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
      return { ...withLightingRead(state, act.state, true), lightingBusy: false, lightingError: null };
  }
}
