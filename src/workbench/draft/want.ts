// The draft as a wanted image beside its base (ADR 0018). `state.base` is what
// the keyboard (or the file) held at the last read, read-back or save; what you
// want is what the screens show. The draft is the difference, item by item;
// nothing is staged. `state.basedOn` holds what a drafted item was based on
// where the keyboard has changed it since.
//
// The wanted parts still live in the fields the screens read (`layers`,
// `encoders`, the slot tables, the layer lighting drafts, the rule draft, the
// pointing draft, the layer names, macros, settings and lighting controls);
// `wantOf` reads them as one image and `withWant` writes one back, so every
// rule here works on images. Parts the draft does not hold yet are the base's.
// Pure.

import type { WorkbenchState } from "../../model/workbench-state";
import type { EncoderAction } from "../../model/action-types";
import type { LightingOverlayCell } from "../../model/lighting-types";
import { sceneTableWithLayer } from "../../model/lighting/preview";
import {
  applyPatch,
  differences,
  itemKey,
  mutableLighting,
  patchBetween,
  profileSlots,
  rebase,
  valueAt,
  withValues,
  type KeyboardImage,
  type PatchEntry,
  type SyncItem,
} from "../../sync";
import type { MorseProfileEntry } from "../../model/action-types";
import type { LightingState } from "../../vendor/rynk-wasm/rynk_wasm";
import { sameValue } from "../../model/deep-equal";
import { layerSceneCells } from "../lighting-drafts";

/** The image a workbench shows with nothing drafted: its fields as read. */
export function storedImage(state: Omit<WorkbenchState, "base">): KeyboardImage {
  return {
    ...settingsOf(state),
    layers: state.layers,
    encoders: encoderRows(state.layers.length, [], state.encoders),
    combos: state.combos,
    morse: state.morse,
    forks: state.forks,
    scenes: state.scenes,
    runtimeConditionalScenes: state.runtimeConditionalScenes,
    pointing: state.pointingConfig,
  };
}

/** The keyboard-wide parts as the fields show them; an optional part only
 *  where the keyboard has it. */
function settingsOf(state: Omit<WorkbenchState, "base">) {
  const optional: Partial<KeyboardImage> = {};
  if (state.behavior) optional.behavior = state.behavior;
  if (state.morseProfileCapacity > 0) optional.morseProfiles = profileSlots(state.morseProfileCapacity, state.morseProfiles);
  if (state.morseHoldTriggerPositionCapacity !== null) optional.holdTriggerPositions = state.morseHoldTriggerPositions;
  if (state.scenePolicy) optional.layerPolicy = state.scenePolicy;
  if (state.lightingState) optional.lightingState = mutableLighting(state.lightingState);
  if (state.lightingExtension) optional.extension = state.lightingExtension.state;
  if (state.lightingExtensionLayers) optional.extensionOverlay = state.lightingExtensionLayers.overlay ?? null;
  const params = Object.entries(state.extensionParams);
  if (params.length > 0) optional.effectParams = Object.fromEntries(params.map(([effect, items]) => [effect, items.map((item) => item.value)]));
  return {
    metadata: state.layerMetadata ?? [],
    defaultLayer: state.defaultLayer,
    macroOps: state.macroOps,
    behaviorOptions: state.behaviorOptions,
    autoMouseLayers: state.autoMouseLayers,
    wakeLayers: state.lightingOutputMode?.wake_layers ?? 0,
    ...optional,
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
    ...pick(settingsOf(state), base),
    layers: state.layers,
    encoders: encoderRows(state.layers.length, base.encoders, state.encoders),
    combos: state.combos,
    morse: state.morse,
    forks: state.forks,
    scenes,
    runtimeConditionalScenes: state.runtimeConditionalDraft,
    pointing: state.pointingDraft,
  };
}

/** The parts of `parts` the base holds too: a part the keyboard lacks stays out of what you want. */
function pick(parts: Partial<KeyboardImage>, base: KeyboardImage): Partial<KeyboardImage> {
  return Object.fromEntries(Object.entries(parts).filter(([part]) => base[part as keyof KeyboardImage] !== undefined));
}

/** The workbench showing `want`. */
export function withWant(state: WorkbenchState, want: KeyboardImage): WorkbenchState {
  const encoders: Record<string, EncoderAction> = {};
  want.encoders.forEach((row, layer) => row.forEach((action, id) => (encoders[`${layer}:${id}`] = action)));
  const lit = new Set(Object.keys(state.layerDrafts).map(Number));
  for (const { item } of patchBetween(state.base, want)) if (item.kind === "lighting") lit.add(item.layer);
  const layerDrafts: Record<number, Record<number, LightingOverlayCell>> = {};
  for (const layer of lit) layerDrafts[layer] = layerSceneCells(want.scenes, layer);
  return withSettings(
    {
      ...state,
      layers: want.layers,
      encoders,
      combos: want.combos,
      morse: want.morse,
      forks: want.forks,
      layerDrafts,
      runtimeConditionalDraft: want.runtimeConditionalScenes,
      pointingDraft: want.pointing,
    },
    want,
  );
}

/** The keyboard-wide fields showing `want`'s parts. */
function withSettings(state: WorkbenchState, want: KeyboardImage): WorkbenchState {
  const next: WorkbenchState = {
    ...state,
    layerMetadata: state.layerMetadata === null ? null : want.metadata,
    defaultLayer: want.defaultLayer,
    macroOps: want.macroOps ?? state.macroOps,
    behaviorOptions: want.behaviorOptions,
    autoMouseLayers: want.autoMouseLayers,
    lightingOutputMode: state.lightingOutputMode && { ...state.lightingOutputMode, wake_layers: want.wakeLayers },
    lightingControls: state.lightingOutputMode ? { ...state.lightingControls, wake_layers: want.wakeLayers } : state.lightingControls,
  };
  if (want.behavior) next.behavior = want.behavior;
  if (want.morseProfiles) next.morseProfiles = want.morseProfiles.filter((entry): entry is MorseProfileEntry => entry !== null);
  if (want.holdTriggerPositions) next.morseHoldTriggerPositions = want.holdTriggerPositions;
  if (want.layerPolicy) next.scenePolicy = want.layerPolicy;
  if (want.lightingState && state.lightingState) next.lightingState = { ...state.lightingState, ...want.lightingState };
  if (want.extension && state.lightingExtension) next.lightingExtension = { ...state.lightingExtension, state: want.extension };
  if (want.extensionOverlay !== undefined && state.lightingExtensionLayers) {
    next.lightingExtensionLayers = { ...state.lightingExtensionLayers, overlay: want.extensionOverlay ?? undefined };
  }
  if (want.effectParams) {
    next.extensionParams = Object.fromEntries(
      Object.entries(state.extensionParams).map(([effect, items]) => {
        const values = want.effectParams![Number(effect)];
        return [effect, values ? items.map((item, index) => ({ ...item, value: values[index] ?? item.value })) : items];
      }),
    );
  }
  return next;
}

/** The workbench with `base` as its base: each item you had not changed
 *  follows it. The scene and rule fields the screens read as "on the keyboard"
 *  are the base's. */
function following(state: WorkbenchState, base: KeyboardImage): WorkbenchState {
  const want = rebase(state.base, base, wantOf(state));
  return withWant(
    { ...state, base, scenes: base.scenes, runtimeConditionalScenes: base.runtimeConditionalScenes, pointingConfig: base.pointing },
    want,
  );
}

/** The workbench after a read: the base is what the keyboard holds now, and
 *  each item you had not changed follows it. A drafted item the read finds
 *  changed keeps, in `basedOn`, the value it was based on, so Send's three-way
 *  check still sees the change made on the keyboard (ADR 0012). An item in
 *  `wrote` was written by the send this read follows: it is based on the read. */
export function withBase(state: WorkbenchState, read: KeyboardImage, wrote: readonly SyncItem[] = []): WorkbenchState {
  const drafted = draftOf(state).keys;
  const sent = new Set(wrote.map(itemKey));
  const kept = state.basedOn.filter(({ item }) => !sent.has(itemKey(item)));
  const settled = new Set([...sent, ...kept.map(({ item }) => itemKey(item))]);
  const moved = differences(state.base, read).filter(
    ({ item, from }) => from !== undefined && drafted.has(itemKey(item)) && !settled.has(itemKey(item)),
  );
  const basedOn = [...kept, ...moved.map(({ item, from }) => ({ item, value: from }))];
  return following({ ...state, basedOn }, read);
}

/** `basedOn` without what no longer applies: an item that left the draft, or
 *  one the keyboard holds again as it was based on. */
export function withBasisInUse(state: WorkbenchState): WorkbenchState {
  if (state.basedOn.length === 0) return state;
  const drafted = draftOf(state).keys;
  const basedOn = state.basedOn.filter(
    ({ item, value }) => drafted.has(itemKey(item)) && !sameValue(value, valueAt(state.base, item)),
  );
  return basedOn.length === state.basedOn.length ? state : { ...state, basedOn };
}

/** The draft with each item's `before` as what it was based on: what Send
 *  checks against and the kept draft keeps. */
export function draftWithBasis(state: WorkbenchState): PatchEntry[] {
  const basis = new Map(state.basedOn.map(({ item, value }) => [itemKey(item), value]));
  return draftOf(state).changes.map((change) => {
    const key = itemKey(change.item);
    return basis.has(key) ? { ...change, before: basis.get(key) } : change;
  });
}

/** The workbench after some items were read: `withBase` for those items. */
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

const WANT_FIELDS = [
  "base", "layers", "encoders", "combos", "morse", "forks", "layerDrafts", "runtimeConditionalDraft", "pointingDraft",
  "layerMetadata", "defaultLayer", "macroOps", "behaviorOptions", "autoMouseLayers", "lightingOutputMode", "behavior",
  "morseProfiles", "morseHoldTriggerPositions", "scenePolicy", "lightingState", "lightingExtension",
  "lightingExtensionLayers", "extensionParams",
] as const;
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


/** The workbench after parts were read from the keyboard (a lighting refresh,
 *  a topic, a write's answer): `withBase` for those parts. A part the keyboard
 *  was not known to have is set. */
export function withRead(state: WorkbenchState, parts: Partial<KeyboardImage>): WorkbenchState {
  return withBase(state, { ...state.base, ...parts });
}

/** The workbench after the lighting state was read: its counters are the
 *  keyboard's, its controls (on, brightness, background) as you want them. */
export function withLightingRead(state: WorkbenchState, read: LightingState): WorkbenchState {
  if (!state.lightingState) return { ...state, lightingState: read };
  const next = withRead(state, { lightingState: mutableLighting(read) });
  return { ...next, lightingState: { ...read, ...mutableLighting(next.lightingState!) } };
}

/** The workbench as Undo or Redo would leave it; null when there is no step. */
export function travelled(state: WorkbenchState, direction: "undo" | "redo"): WorkbenchState | null {
  const step = (direction === "undo" ? state.history.past : state.history.future).at(-1);
  if (!step) return null;
  return withWant(state, applyPatch(wantOf(state), step.changes, direction === "undo" ? "before" : "after"));
}
