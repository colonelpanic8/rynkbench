// What can be referred to, and what a reference is. The vocabulary of the
// reference graph; nothing here knows any protocol.

export type RefKind = "layer" | "cell" | "combo" | "fork" | "morse" | "macro" | "profile";

/** A node of the graph: a layer, a keymap cell, or a numbered slot. A cell is
 *  addressed by its layer and its offset within the layer. */
export type Ref =
  | { kind: "cell"; layer: number; offset: number }
  | { kind: Exclude<RefKind, "cell">; index: number };

/** What a reference does to its target.
 *
 *  activates    turns a layer on (momentary, toggle, one-shot, default, ...)
 *  deactivates  turns a layer off
 *  scopes       limits a combo to a layer
 *  invokes      runs a macro
 *  morse        hands the key to a morse slot
 *  profile      uses a tap-hold profile */
export type EdgeKind = "activates" | "deactivates" | "scopes" | "invokes" | "morse" | "profile";

export const layerRef = (index: number): Ref => ({ kind: "layer", index });
export const cellRef = (layer: number, offset: number): Ref => ({ kind: "cell", layer, offset });
export const slotRef = (kind: Exclude<RefKind, "cell" | "layer">, index: number): Ref => ({ kind, index });

/** A stable string for a node, for maps and sets: `layer:3`, `cell:0:15`. */
export function refKey(ref: Ref): string {
  return ref.kind === "cell" ? `cell:${ref.layer}:${ref.offset}` : `${ref.kind}:${ref.index}`;
}

export function sameRef(a: Ref, b: Ref): boolean {
  return refKey(a) === refKey(b);
}
