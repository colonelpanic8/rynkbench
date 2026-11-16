// The draft as a wanted image beside its base (ADR 0018). `state.base` is what
// the keyboard (or the file) held at the last read, read-back or save; what you
// want is what the screens show. The draft is the difference, item by item;
// nothing is staged.
//
// The wanted parts still live in the fields the screens read (`layers`,
// `encoders`, the slot tables, the layer lighting drafts, the rule draft);
// `wantOf` reads them as one image and `withWant` writes one back, so every
// rule here works on images. Parts the draft does not hold yet are the base's.
// Pure.

import type { WorkbenchState } from "../../model/workbench-state";
import type { EncoderAction } from "../../model/action-types";
import type { LightingOverlayCell } from "../../model/lighting-types";
import { sceneTableWithLayer } from "../../model/lighting/preview";
import { itemKey, patchBetween, rebase, valueAt, withValues, type KeyboardImage, type PatchEntry, type SyncItem } from "../../sync";
import { layerSceneCells } from "../lighting-drafts";

/** The image a workbench shows with nothing drafted: its fields as read. */
export function storedImage(state: Omit<WorkbenchState, "base">): KeyboardImage {
  return {
    metadata: state.layerMetadata ?? [],
    layers: state.layers,
    encoders: encoderRows(state.layers.length, [], state.encoders),
    defaultLayer: state.defaultLayer,
    combos: state.combos,
    morse: state.morse,
    forks: state.forks,
    macroOps: state.macroOps,
    behaviorOptions: state.behaviorOptions,
    autoMouseLayers: state.autoMouseLayers,
    scenes: state.scenes,
    runtimeConditionalScenes: state.runtimeConditionalScenes,
    wakeLayers: state.lightingOutputMode?.wake_layers ?? 0,
    pointing: state.pointingConfig,
  };
}

/** Encoder rows per layer: `rows` with the loaded encoders (`layer:id` → action) on top. */
function encoderRows(layers: number, rows: readonly EncoderAction[][], loaded: Record<string, EncoderAction>): EncoderAction[][] {
  const out = Array.from({ length: layers }, (_, layer) => [...(rows[layer] ?? [])]);
  for (const [key, action] of Object.entries(loaded)) {
    const [layer, id] = key.split(":").map(Number);
    if (out[layer]) out[layer][id] = action;
  }
  return out;
}

/** What you want, as one image. */
export function wantOf(state: WorkbenchState): KeyboardImage {
  const { base } = state;
  const scenes = Object.entries(state.layerDrafts).reduce(
    (table, [layer, cells]) => sceneTableWithLayer(table, Number(layer), cells),
    base.scenes,
  );
  return {
    ...base,
    layers: state.layers,
    encoders: encoderRows(state.layers.length, base.encoders, state.encoders),
    combos: state.combos,
    morse: state.morse,
    forks: state.forks,
    scenes,
    runtimeConditionalScenes: state.runtimeConditionalDraft,
  };
}

/** The workbench showing `want`. */
export function withWant(state: WorkbenchState, want: KeyboardImage): WorkbenchState {
  const encoders: Record<string, EncoderAction> = {};
  want.encoders.forEach((row, layer) => row.forEach((action, id) => (encoders[`${layer}:${id}`] = action)));
  const lit = new Set(Object.keys(state.layerDrafts).map(Number));
  for (const { item } of patchBetween(state.base, want)) if (item.kind === "lighting") lit.add(item.layer);
  const layerDrafts: Record<number, Record<number, LightingOverlayCell>> = {};
  for (const layer of lit) layerDrafts[layer] = layerSceneCells(want.scenes, layer);
  return {
    ...state,
    layers: want.layers,
    encoders,
    combos: want.combos,
    morse: want.morse,
    forks: want.forks,
    layerDrafts,
    runtimeConditionalDraft: want.runtimeConditionalScenes,
  };
}

/** The workbench after a read: the base is what the keyboard holds now, and
 *  each item you had not changed follows it. The scene and rule fields the
 *  screens read as "on the keyboard" are the base's. */
export function withBase(state: WorkbenchState, base: KeyboardImage): WorkbenchState {
  const want = rebase(state.base, base, wantOf(state));
  return withWant({ ...state, base, scenes: base.scenes, runtimeConditionalScenes: base.runtimeConditionalScenes }, want);
}

/** The workbench after some items were read or written: each set in the base, and followed where you had not changed it. */
export function withStored(state: WorkbenchState, values: Iterable<{ item: SyncItem; value: unknown }>): WorkbenchState {
  return withBase(state, withValues(state.base, values));
}

/** Items of what you want set back to the base. */
export function withItemsAtBase(state: WorkbenchState, items: readonly SyncItem[]): WorkbenchState {
  return withWant(state, withValues(wantOf(state), items.map((item) => ({ item, value: valueAt(state.base, item) }))));
}

/** The workbench with nothing drafted: what the keyboard holds. */
export const atBase = (state: WorkbenchState): WorkbenchState => withWant(state, state.base);

/* ---- the draft: computed once per change of base or want ---------------- */

export interface Draft {
  /** Each drafted item, with its value on the keyboard (`before`) and as you want it (`after`). */
  changes: readonly PatchEntry[];
  /** The drafted items' keys (`itemKey`). */
  keys: ReadonlySet<string>;
}

const WANT_FIELDS = ["base", "layers", "encoders", "combos", "morse", "forks", "layerDrafts", "runtimeConditionalDraft"] as const;
let last: { fields: unknown[]; draft: Draft } | null = null;

export function draftOf(state: WorkbenchState): Draft {
  const fields = WANT_FIELDS.map((field) => state[field]);
  if (last && last.fields.every((value, i) => value === fields[i])) return last.draft;
  const changes = patchBetween(state.base, wantOf(state));
  const draft = { changes, keys: new Set(changes.map((change) => itemKey(change.item))) };
  last = { fields, draft };
  return draft;
}

/** Whether an item differs from what the keyboard holds. */
export const isDrafted = (state: WorkbenchState, item: SyncItem): boolean => draftOf(state).keys.has(itemKey(item));

