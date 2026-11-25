// Test workbenches: one place that builds the context screens read, so a test
// names only what it is about. Overrides are typed (a misspelled or mistyped
// field fails to compile) but partial: a test gives the slice of a bundle or
// state it needs, and the rest is neutral (no keys, no lighting, no pointing).
// For a whole, realistic board, pass a real bundle (openBundle on the offline
// Glove80) instead.

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ConnectedBundle, WorkbenchState } from "../model/workbench-state";
import { WorkbenchContext, type WorkbenchContextValue } from "../ui/state";
import { initialWorkbenchState } from "../workbench/initial-state";
import { storedImage } from "../workbench/draft/want";
import type { KeyboardImage } from "../sync";
import { DocumentTransferContext, type DocumentTransfer } from "../ui/transfer-actions";

/** Every field optional, all the way down; field names and types still checked. */
export type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepPartial<U>>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

export interface TestWorkbenchParts {
  bundle?: DeepPartial<ConnectedBundle>;
  state?: DeepPartial<WorkbenchState>;
  io?: DeepPartial<WorkbenchContextValue["io"]>;
  dispatch?: WorkbenchContextValue["dispatch"];
  history?: DeepPartial<WorkbenchContextValue["history"]>;
}

/** A board with nothing on it: the defaults every override starts from. */
function neutralBundle(): Record<string, unknown> {
  return {
    session: { kind: "offline" },
    model: {
      name: "Test board",
      variantIndex: 0,
      bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      keys: [],
      encoders: [],
      pointingDevices: [],
      zones: [],
      topologyRevision: 0,
    },
    topology: { leds: [], zones: [], zoneMemberships: [], revision: 0 },
    caps: {
      num_layers: 1,
      num_rows: 1,
      num_cols: 1,
      num_encoders: 0,
      max_combos: 0,
      max_morses: 0,
      max_patterns_per_key: 0,
      max_forks: 0,
      macro_space_size: 0,
      num_split_peripherals: 0,
      num_ble_profiles: 0,
      is_split: false,
    },
    build: null,
    lightingCaps: null,
    overlayReadSupported: false,
    layers: [[]],
    layerMetadata: null,
    pointingConfig: null,
    pointingCapabilities: null,
    currentLayer: 0,
    defaultLayer: 0,
    activeLayers: [0],
    layerStateComplete: true,
    battery: "Unavailable",
    peripheralBattery: "Unavailable",
    connection: null,
    maintenanceMode: null,
    splitTransport: null,
    lightingState: null,
    lightingOutputMode: null,
    overlay: [],
    sceneStatus: null,
    scenes: [],
    compiledSceneStatus: null,
    compiledScenes: [],
    conditionalScenes: [],
    lightingControls: { wake_layers: 0 },
    runtimeConditionalStatus: null,
    runtimeConditionalScenes: [],
    lightingExtension: null,
    lightingExtensionLayers: null,
    combos: [],
    morse: [],
    forks: [],
    macroOps: [],
    behavior: null,
    behaviorOptions: null,
    morseProfileCapacity: 0,
    morseProfiles: [],
    morseHoldTriggerPositionCapacity: 0,
    morseHoldTriggerPositions: [],
    autoMouseLayerCapacity: 0,
    autoMouseLayers: [],
    ledIndicator: null,
    modifierState: null,
  };
}

/** The workbench context for a test. Nested objects in the overrides replace
 *  the defaults' values one level down (caps and model merge their fields). */
export function testWorkbench(parts: TestWorkbenchParts = {}): WorkbenchContextValue {
  const base = neutralBundle();
  const given = (parts.bundle ?? {}) as Record<string, unknown>;
  const bundle = {
    ...base,
    ...given,
    caps: { ...(base.caps as object), ...(given.caps as object | undefined) },
    model: { ...(base.model as object), ...(given.model as object | undefined) },
  } as unknown as ConnectedBundle; // the one cast: neutral defaults stand in for a board
  const opened = { ...initialWorkbenchState(bundle), ...(parts.state as Partial<WorkbenchState>) };
  // What the keyboard holds is the test's state, with the parts of `base` it
  // gives on top: a test drafts a change by giving the base the old value.
  const state: WorkbenchState = { ...opened, base: { ...storedImage(opened), ...(parts.state?.base as Partial<KeyboardImage>) } };
  return {
    bundle,
    state,
    dispatch: parts.dispatch ?? (() => {}),
    io: (parts.io ?? {}) as WorkbenchContextValue["io"],
    history: {
      canUndo: false,
      canRedo: false,
      phase: "idle",
      error: null,
      undoLabel: null,
      redoLabel: null,
      undo: async () => {},
      redo: async () => {},
      ...(parts.history as object | undefined),
    } as WorkbenchContextValue["history"],
  };
}

/** Renders a screen inside a test workbench (and, when given, a document transfer). */
export function renderInWorkbench(
  node: ReactNode,
  parts: TestWorkbenchParts = {},
  transfer?: DeepPartial<DocumentTransfer>,
): string {
  const inner = transfer ? (
    <DocumentTransferContext value={transfer as DocumentTransfer}>{node}</DocumentTransferContext>
  ) : (
    node
  );
  return renderToStaticMarkup(<WorkbenchContext value={testWorkbench(parts)}>{inner}</WorkbenchContext>);
}
