// The planner: what to write so the keyboard holds the layout you want, and
// nothing more (ADR 0012, docs/sync.md). RMK stores every row it is sent, even
// an unchanged one, so only items that differ are listed. The order keeps the
// keyboard usable if writing stops part-way: what keys will point to is
// created first, keys and settings change next, what is no longer used goes
// last.

import { sameValue } from "../model/deep-equal";

// Values come from two places: built by Rynkbench, and read back from the
// keyboard. Their key order and unset fields mean nothing, so they never
// count as a difference (a check after writing that does fails forever).
const same = sameValue;
import { comboIsEmpty } from "../model/combos";
import { forkIsEmpty, morseIsEmpty } from "../model/slots";
import type {
  AutoMouseLayerConfig,
  BehaviorConfig,
  BehaviorOptions,
  ComboDefinition,
  EncoderAction,
  Fork,
  KeyAction,
  LightingExtensionState,
  LightingLayerPolicy,
  LightingMutableState,
  LightingSceneCell,
  MacroOp,
  Morse,
  MorseHoldTriggerPosition,
  MorseProfileEntry,
  PointingConfig,
} from "../vendor/rynk-wasm/rynk_wasm";
import { keymapSegments } from "../session/flash-writes";
import type { LayerMetadata, RuntimeLightingRule } from "../session/types";
import type { KeyboardImage, SlotTable } from "./image";

export type SyncStep =
  | { kind: "slot"; table: "combos"; index: number; value: ComboDefinition }
  | { kind: "slot"; table: "morse"; index: number; value: Morse }
  | { kind: "slot"; table: "forks"; index: number; value: Fork }
  | { kind: "macros"; value: MacroOp[][] }
  | { kind: "layerMetadata"; layer: number; value: LayerMetadata }
  /** Every cell of one row of one layer: the firmware stores a row whole. */
  | { kind: "keys"; layer: number; row: number; actions: KeyAction[] }
  | { kind: "encoder"; layer: number; id: number; action: EncoderAction }
  | { kind: "defaultLayer"; layer: number }
  | { kind: "behaviorOptions"; value: BehaviorOptions }
  | { kind: "autoMouseLayers"; value: AutoMouseLayerConfig[] }
  | { kind: "pointing"; value: PointingConfig }
  | { kind: "wakeLayers"; value: number }
  | { kind: "scenes"; value: LightingSceneCell[] }
  | { kind: "rules"; value: RuntimeLightingRule[] }
  | { kind: "behavior"; value: BehaviorConfig }
  /** A profile set, or deleted (null). */
  | { kind: "morseProfile"; index: number; value: MorseProfileEntry | null }
  | { kind: "holdTriggerPositions"; value: MorseHoldTriggerPosition[] }
  | { kind: "layerPolicy"; value: LightingLayerPolicy }
  | { kind: "lightingState"; value: LightingMutableState }
  | { kind: "extension"; value: LightingExtensionState }
  | { kind: "extensionOverlay"; value: number | null }
  | { kind: "effectParam"; effect: number; index: number; value: number };

export type StepKind = SyncStep["kind"];

const SLOT_EMPTY: { [T in SlotTable]: (value: never) => boolean } = {
  combos: comboIsEmpty as (value: never) => boolean,
  morse: morseIsEmpty as (value: never) => boolean,
  forks: forkIsEmpty as (value: never) => boolean,
};

/** The rows of `to`, `cols` cells each, that hold a cell differing from `from`. */
function changedRows<T>(from: readonly T[], to: readonly T[], cols: number): { row: number; values: T[] }[] {
  const rows: { row: number; values: T[] }[] = [];
  for (let start = 0; start < to.length; start += cols) {
    const values = to.slice(start, start + cols);
    if (values.some((value, col) => !same(from[start + col], value))) rows.push({ row: start / cols, values });
  }
  return rows;
}

/** A pointing configuration compared without its revision, which the keyboard counts. */
const pointingBody = (config: PointingConfig | null) => (config ? { ...config, revision: 0 } : null);

/** What to write, in order, so that `from` (what the keyboard holds) becomes
 *  `to`, on a keyboard `cols` columns wide. */
export function planSync(from: KeyboardImage, to: KeyboardImage, cols: number): SyncStep[] {
  if (from.layers.length !== to.layers.length) {
    throw new Error(`the layouts have ${from.layers.length} and ${to.layers.length} layers; a keyboard's layer count is fixed`);
  }
  if (!(cols > 0) || to.layers.some((cells) => cells.length % cols !== 0)) {
    throw new Error(`the layout does not divide into rows of ${cols} keys`);
  }
  const create: SyncStep[] = [];
  const change: SyncStep[] = [];
  const remove: SyncStep[] = [];

  for (const table of ["combos", "morse", "forks"] as const) {
    to[table].forEach((value, index) => {
      if (same(from[table][index], value)) return;
      const step = { kind: "slot", table, index, value } as SyncStep;
      (SLOT_EMPTY[table](value as never) ? remove : create).push(step);
    });
  }
  if (to.macroOps && from.macroOps && !same(from.macroOps, to.macroOps)) {
    // One stored item: grown or reworked macros go before the keys that run them, shrunk ones after.
    (to.macroOps.length < from.macroOps.length ? remove : create).push({ kind: "macros", value: to.macroOps });
  }
  to.metadata.forEach((value, layer) => {
    if (same(from.metadata[layer], value)) return;
    (value.occupied ? create : remove).push({ kind: "layerMetadata", layer, value });
  });

  to.layers.forEach((cells, layer) => {
    for (const { row, values } of changedRows(from.layers[layer] ?? [], cells, cols)) {
      change.push({ kind: "keys", layer, row, actions: values });
    }
  });
  to.encoders.forEach((encoders, layer) =>
    encoders.forEach((action, id) => {
      if (!same(from.encoders[layer]?.[id], action)) change.push({ kind: "encoder", layer, id, action });
    }),
  );
  if (from.defaultLayer !== to.defaultLayer) change.push({ kind: "defaultLayer", layer: to.defaultLayer });
  if (to.behaviorOptions && !same(from.behaviorOptions, to.behaviorOptions)) {
    change.push({ kind: "behaviorOptions", value: to.behaviorOptions });
  }
  if (!same(from.autoMouseLayers, to.autoMouseLayers)) change.push({ kind: "autoMouseLayers", value: to.autoMouseLayers });
  if (to.pointing && !same(pointingBody(from.pointing), pointingBody(to.pointing))) {
    change.push({ kind: "pointing", value: to.pointing });
  }
  if (from.wakeLayers !== to.wakeLayers) change.push({ kind: "wakeLayers", value: to.wakeLayers });
  if (!same(sceneOrder(from.scenes), sceneOrder(to.scenes))) change.push({ kind: "scenes", value: to.scenes });
  if (!same(from.runtimeConditionalScenes, to.runtimeConditionalScenes)) {
    change.push({ kind: "rules", value: to.runtimeConditionalScenes });
  }
  planSettings(from, to, { create, change, remove });
  return [...create, ...change, ...remove];
}

/** The parts a keyboard may lack, each written only when both sides hold it.
 *  Profiles are created before what uses them and deleted last. */
function planSettings(from: KeyboardImage, to: KeyboardImage, out: Record<"create" | "change" | "remove", SyncStep[]>) {
  const both = <K extends keyof KeyboardImage>(part: K) => from[part] !== undefined && to[part] !== undefined;
  to.morseProfiles?.forEach((value, index) => {
    if (!both("morseProfiles") || same(from.morseProfiles![index] ?? null, value ?? null)) return;
    (value ? out.create : out.remove).push({ kind: "morseProfile", index, value: value ?? null });
  });
  const whole = <K extends "behavior" | "holdTriggerPositions" | "layerPolicy" | "lightingState" | "extension" | "extensionOverlay">(kind: K) => {
    if (both(kind) && !same(from[kind], to[kind])) out.change.push({ kind, value: to[kind] } as SyncStep);
  };
  whole("behavior");
  whole("holdTriggerPositions");
  whole("layerPolicy");
  whole("lightingState");
  whole("extension");
  whole("extensionOverlay");
  for (const [key, values] of Object.entries(to.effectParams ?? {})) {
    const effect = Number(key);
    const before = from.effectParams?.[effect];
    if (!before) continue;
    values.forEach((value, index) => {
      if (before[index] !== value) out.change.push({ kind: "effectParam", effect, index, value });
    });
  }
}

/** A scene table in one order. The keyboard holds one cell per layer and LED and
 *  keeps them grouped by layer in its own order, so the order means nothing:
 *  two tables are the same when they hold the same cells. (Rules are different:
 *  their order is the order they are tried in.) */
function sceneOrder(scenes: readonly LightingSceneCell[]): LightingSceneCell[] {
  return [...scenes].sort((a, b) => a.layer - b.layer || a.led_id - b.led_id);
}

/** How many flash items a plan stores: a row counts its segments, every other step one. */
export function storedItems(steps: readonly SyncStep[]): number {
  return steps.reduce(
    (sum, step) => sum + (step.kind === "keys" ? keymapSegments(0, step.actions.length, step.actions.length) : 1),
    0,
  );
}
