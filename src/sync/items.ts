// The items a keyboard stores, named one by one (ADR 0018): a key, an encoder,
// a combo, morse or fork slot, a layer's name, a layer's lighting, the rule
// table, and each keyboard-wide setting. The planner writes in steps (a run of
// keys, a whole scene table); the draft, the three-way check, the history and
// the kept draft speak of items: what differs between two images, the value an
// item has in one, and an image with some items set. Pure.

import { sameValue } from "../model/deep-equal";
import type { LightingSceneCell, PointingConfig } from "../vendor/rynk-wasm/rynk_wasm";
import type { KeyboardImage, SlotTable } from "./image";

/** One stored item, named the same way everywhere. */
export type SyncItem =
  | { kind: "key"; layer: number; offset: number }
  | { kind: "encoder"; layer: number; id: number }
  | { kind: "slot"; table: SlotTable; index: number }
  | { kind: "layerMetadata"; layer: number }
  /** One layer's cells of the scene table. */
  | { kind: "lighting"; layer: number }
  | { kind: "rules" }
  | { kind: "macros" }
  | { kind: "defaultLayer" }
  | { kind: "behaviorOptions" }
  | { kind: "autoMouseLayers" }
  | { kind: "pointing" }
  | { kind: "wakeLayers" };

export type ItemKind = SyncItem["kind"];

/** An item that differs between two images, with its value in each. */
export interface ItemChange {
  item: SyncItem;
  from: unknown;
  to: unknown;
}

/** An item's name as a map key: `key:0:12`, `rules`. */
export function itemKey(item: SyncItem): string {
  switch (item.kind) {
    case "key":
      return `key:${item.layer}:${item.offset}`;
    case "encoder":
      return `encoder:${item.layer}:${item.id}`;
    case "slot":
      return `slot:${item.table}:${item.index}`;
    case "layerMetadata":
    case "lighting":
      return `${item.kind}:${item.layer}`;
    default:
      return item.kind;
  }
}

/** One layer's cells, in LED order (the keyboard keeps its own order, which means nothing). */
function layerCells(scenes: readonly LightingSceneCell[], layer: number): LightingSceneCell[] {
  return scenes.filter((cell) => cell.layer === layer).sort((a, b) => a.led_id - b.led_id);
}

/** A pointing configuration without its revision, which the keyboard counts. */
const pointingBody = (config: PointingConfig | null) => (config ? { ...config, revision: 0 } : null);

/** The value an item has in an image; undefined when the image does not hold it. */
export function valueAt(image: KeyboardImage, item: SyncItem): unknown {
  switch (item.kind) {
    case "key":
      return image.layers[item.layer]?.[item.offset];
    case "encoder":
      return image.encoders[item.layer]?.[item.id];
    case "slot":
      return image[item.table][item.index];
    case "layerMetadata":
      return image.metadata[item.layer];
    case "lighting":
      return layerCells(image.scenes, item.layer);
    case "rules":
      return image.runtimeConditionalScenes;
    case "macros":
      return image.macroOps;
    default:
      return image[item.kind];
  }
}

const replaced = <T,>(list: readonly T[], index: number, value: T): T[] => {
  const next = [...list];
  next[index] = value;
  return next;
};

function withValue(image: KeyboardImage, item: SyncItem, value: unknown): KeyboardImage {
  switch (item.kind) {
    case "key":
      return { ...image, layers: replaced(image.layers, item.layer, replaced(image.layers[item.layer] ?? [], item.offset, value as never)) };
    case "encoder":
      return { ...image, encoders: replaced(image.encoders, item.layer, replaced(image.encoders[item.layer] ?? [], item.id, value as never)) };
    case "slot":
      return { ...image, [item.table]: replaced(image[item.table] as unknown[], item.index, value) };
    case "layerMetadata":
      return { ...image, metadata: replaced(image.metadata, item.layer, value as never) };
    case "lighting":
      return { ...image, scenes: [...image.scenes.filter((cell) => cell.layer !== item.layer), ...((value as LightingSceneCell[] | undefined) ?? [])] };
    case "rules":
      return { ...image, runtimeConditionalScenes: value as never };
    case "macros":
      return { ...image, macroOps: value as never };
    default:
      return { ...image, [item.kind]: value };
  }
}

/** The image with each item set to its value. */
export function withValues(image: KeyboardImage, values: Iterable<{ item: SyncItem; value: unknown }>): KeyboardImage {
  let next = image;
  for (const { item, value } of values) next = withValue(next, item, value);
  return next;
}

/** The layers that hold lighting cells in either image. */
function lightingLayers(a: KeyboardImage, b: KeyboardImage): number[] {
  return [...new Set([...a.scenes, ...b.scenes].map((cell) => cell.layer))].sort((x, y) => x - y);
}

/** Every item that differs between `from` and `to`, in a stable order. A part
 *  `to` does not hold (no macros read, no behaviour options, no pointing) is
 *  not compared, as the planner does not write it (ADR 0012). */
export function differences(from: KeyboardImage, to: KeyboardImage): ItemChange[] {
  const out: ItemChange[] = [];
  const check = (item: SyncItem, a: unknown, b: unknown, same = sameValue) => {
    if (!same(a, b)) out.push({ item, from: a, to: b });
  };
  to.layers.forEach((cells, layer) =>
    cells.forEach((action, offset) => check({ kind: "key", layer, offset }, from.layers[layer]?.[offset], action)),
  );
  to.encoders.forEach((row, layer) =>
    row.forEach((action, id) => check({ kind: "encoder", layer, id }, from.encoders[layer]?.[id], action)),
  );
  for (const table of ["combos", "morse", "forks"] as const) {
    to[table].forEach((value, index) => check({ kind: "slot", table, index }, from[table][index], value));
  }
  to.metadata.forEach((value, layer) => check({ kind: "layerMetadata", layer }, from.metadata[layer], value));
  for (const layer of lightingLayers(from, to)) {
    check({ kind: "lighting", layer }, layerCells(from.scenes, layer), layerCells(to.scenes, layer));
  }
  check({ kind: "rules" }, from.runtimeConditionalScenes, to.runtimeConditionalScenes);
  if (to.macroOps && from.macroOps) check({ kind: "macros" }, from.macroOps, to.macroOps);
  check({ kind: "defaultLayer" }, from.defaultLayer, to.defaultLayer);
  if (to.behaviorOptions) check({ kind: "behaviorOptions" }, from.behaviorOptions, to.behaviorOptions);
  check({ kind: "autoMouseLayers" }, from.autoMouseLayers, to.autoMouseLayers);
  if (to.pointing) check({ kind: "pointing" }, from.pointing, to.pointing, (a, b) => sameValue(pointingBody(a as PointingConfig), pointingBody(b as PointingConfig)));
  check({ kind: "wakeLayers" }, from.wakeLayers, to.wakeLayers);
  return out;
}
