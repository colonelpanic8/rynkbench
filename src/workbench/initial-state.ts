// The workbench as it opens: everything the connect snapshot read, with
// nothing staged, selected or in flight.

import type { ConnectedBundle, WorkbenchState } from "../model/workbench-state";
import { initialKeyEditHistory } from "../model/history";
import { normalizePointingConfig } from "../model/pointing";
import { cellsToRecord } from "./lighting-drafts";

export function initialWorkbenchState(bundle: ConnectedBundle): WorkbenchState {
  const applied = cellsToRecord(bundle.overlay);
  return {
    mode: "keymap",
    uiLayer: bundle.currentLayer,
    currentLayer: bundle.currentLayer,
    defaultLayer: bundle.defaultLayer,
    activeLayers: bundle.activeLayers,
    layerStateComplete: bundle.layerStateComplete,
    layers: bundle.layers,
    layerMetadata: bundle.layerMetadata,
    pointingConfig: bundle.pointingConfig
      ? normalizePointingConfig(bundle.pointingConfig)
      : null,
    pointingDraft: bundle.pointingConfig
      ? normalizePointingConfig(bundle.pointingConfig)
      : null,
    pointingBusy: false,
    pointingError: bundle.pointingReadError ?? null,
    encoders: {},
    battery: bundle.battery,
    peripheralBattery: bundle.peripheralBattery,
    connection: bundle.connection,
    maintenanceMode: bundle.maintenanceMode,
    splitTransport: bundle.splitTransport,
    lightingState: bundle.lightingState,
    lightingOutputMode: bundle.lightingOutputMode,
    applied,
    draft: { ...applied },
    lightingTarget: "overlay",
    layerDrafts: {},
    scenes: bundle.scenes,
    compiledScenes: bundle.compiledScenes,
    conditionalScenes: bundle.conditionalScenes,
    lightingControls: bundle.lightingControls,
    runtimeConditionalScenes: bundle.runtimeConditionalScenes,
    runtimeConditionalDraft: bundle.runtimeConditionalScenes,
    lightingExtension: bundle.lightingExtension,
    lightingExtensionLayers: bundle.lightingExtensionLayers,
    extensionParams: {},
    scenePolicy: bundle.sceneStatus?.policy ?? null,
    compiledScenePolicy: bundle.compiledSceneStatus?.policy ?? null,
    selection: null,
    pending: {},
    keyEditHistory: initialKeyEditHistory(),
    keyEditHistorySuspended: false,
    batchMode: bundle.session.kind !== "offline", // a keyboard starts in Draft (ADR 0010)
    stagedKeys: {},
    stagedEncoders: {},
    stagedSlots: {},
    batchBusy: false,
    batchError: null,
    layerBusy: false,
    layerError: null,
    lightingBusy: false,
    lightingError: null,
    hoverLeds: null,
    combos: bundle.combos,
    morse: bundle.morse,
    forks: bundle.forks,
    macroOps: bundle.macroOps,
    behavior: bundle.behavior,
    behaviorOptions: bundle.behaviorOptions,
    morseProfileCapacity: bundle.morseProfileCapacity,
    morseProfiles: bundle.morseProfiles,
    morseHoldTriggerPositionCapacity: bundle.morseHoldTriggerPositionCapacity,
    morseHoldTriggerPositions: bundle.morseHoldTriggerPositions,
    autoMouseLayerCapacity: bundle.autoMouseLayerCapacity,
    autoMouseLayers: bundle.autoMouseLayers,
    ledIndicator: bundle.ledIndicator,
    modifierState: bundle.modifierState,
  };
}
