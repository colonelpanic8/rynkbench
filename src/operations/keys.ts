// Keys: set several at once, or swap two. Pure.

import type { KeyAction } from "../vendor/rynk-wasm/rynk_wasm";
import type { KeyboardImage } from "../sync/image";
import { failed, type Operation } from "./types";

export interface KeyPlace {
  layer: number;
  row: number;
  col: number;
}

export interface KeySet extends KeyPlace {
  action: KeyAction;
}

/** The key's offset in its layer, or a message when there is no such key. */
function offsetOf(image: KeyboardImage, cols: number, { layer, row, col }: KeyPlace): number | string {
  const cells = image.layers[layer];
  if (!cells) return `Layer ${layer} does not exist`;
  const offset = row * cols + col;
  if (col < 0 || col >= cols || row < 0 || offset >= cells.length) return `There is no key at row ${row}, column ${col}`;
  return offset;
}

/** The image with these keys set; a message when one does not exist. */
export function withKeys(image: KeyboardImage, cols: number, keys: readonly KeySet[]): KeyboardImage | string {
  const layers = [...image.layers];
  for (const key of keys) {
    const offset = offsetOf(image, cols, key);
    if (typeof offset === "string") return offset;
    if (layers[key.layer] === image.layers[key.layer]) layers[key.layer] = [...image.layers[key.layer]];
    layers[key.layer][offset] = key.action;
  }
  return { ...image, layers };
}

export const setKeys: Operation<{ keys: readonly KeySet[] }> = {
  name: "set_keys",
  description: "Sets keys to actions, as one change: a paste, a move, a whole layer.",
  inputs: [{ name: "keys", kind: "value", list: true, description: "Each key: { layer, row, col, action }." }],
  run(image, { keys }, facts) {
    const next = withKeys(image, facts.cols, keys);
    return typeof next === "string" ? failed(next) : { ok: true, image: next };
  },
};

export const swapKeys: Operation<{ a: KeyPlace; b: KeyPlace }> = {
  name: "swap_keys",
  description: "Swaps the actions of two keys, on one layer or across layers.",
  inputs: [
    { name: "a", kind: "value", description: "One key: { layer, row, col }." },
    { name: "b", kind: "value", description: "The other key: { layer, row, col }." },
  ],
  run(image, { a, b }, facts) {
    const from = offsetOf(image, facts.cols, a);
    const to = offsetOf(image, facts.cols, b);
    if (typeof from === "string") return failed(from);
    if (typeof to === "string") return failed(to);
    const next = withKeys(image, facts.cols, [
      { ...a, action: image.layers[b.layer][to] },
      { ...b, action: image.layers[a.layer][from] },
    ]);
    return typeof next === "string" ? failed(next) : { ok: true, image: next };
  },
};
