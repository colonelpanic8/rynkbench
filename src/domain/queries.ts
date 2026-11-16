// Questions asked of the reference graph. Each one is a plain function over a
// built graph, so the usage report, impact analysis and reachability all read
// the same facts instead of each walking the data its own way.

import type { Edge, Graph } from "./graph";
import { sameRef } from "./refs";
import type { Ref } from "./refs";

/** An edge together with whose it is: the place that holds the reference, and,
 *  when a morse slot passed it on, that slot. A key bound to a morse slot whose
 *  hold action turns on layer 5 reaches layer 5 through the slot. */
export interface Attributed {
  edge: Edge;
  owner: Ref;
  via: Ref | null;
  /** The layer the owner is scoped to, or null when it applies everywhere. */
  scope: number | null;
}

/** Every edge with its owner, in order: each owner's own edges, then, for each
 *  morse slot it refers to, that slot's edges attributed to the owner. */
export function attributedEdges(graph: Graph): Attributed[] {
  const out: Attributed[] = [];
  for (const owner of graph.owners) {
    for (const edge of owner.edges) out.push({ edge, owner: owner.ref, via: null, scope: owner.scope });
    for (const edge of owner.edges) {
      if (edge.kind !== "morse") continue;
      for (const passed of graph.from(edge.to)) {
        out.push({ edge: passed, owner: owner.ref, via: edge.to, scope: owner.scope });
      }
    }
  }
  return out;
}

/** What can turn each layer on, by layer index, in order of first mention. A
 *  layer nothing mentions has no entry. */
export function activators(attributed: readonly Attributed[]): Map<number, Attributed[]> {
  const byLayer = new Map<number, Attributed[]>();
  for (const entry of attributed) {
    if (entry.edge.kind !== "activates" || entry.edge.to.kind !== "layer") continue;
    const layer = entry.edge.to.index;
    const list = byLayer.get(layer);
    if (list) list.push(entry);
    else byLayer.set(layer, [entry]);
  }
  return byLayer;
}

/** Layers that can be reached from a starting layer. An owner scoped to a layer
 *  only helps once that layer is reached; one that applies everywhere (scope
 *  null) helps from every reached layer. */
export function reachableLayers(attributed: readonly Attributed[], start: number): Set<number> {
  const scoped = new Map<number | null, Set<number>>();
  for (const entry of attributed) {
    if (entry.edge.kind !== "activates" || entry.edge.to.kind !== "layer") continue;
    const set = scoped.get(entry.scope) ?? new Set<number>();
    set.add(entry.edge.to.index);
    scoped.set(entry.scope, set);
  }
  const everywhere = [...(scoped.get(null) ?? [])];
  const reached = new Set<number>();
  const queue = [start];
  while (queue.length > 0) {
    const layer = queue.shift()!;
    if (reached.has(layer)) continue;
    reached.add(layer);
    for (const target of scoped.get(layer) ?? []) queue.push(target);
    for (const target of everywhere) queue.push(target);
  }
  return reached;
}

/** Everything that refers to a node, directly or through a morse slot. */
export function referencedBy(attributed: readonly Attributed[], target: Ref): Attributed[] {
  return attributed.filter((entry) => sameRef(entry.edge.to, target));
}

/** The references the owners themselves hold (not passed on through a slot)
 *  whose target is missing, in order. */
export function dangling(graph: Graph): Edge[] {
  const out: Edge[] = [];
  for (const owner of graph.owners) {
    for (const edge of owner.edges) if (!graph.has(edge.to)) out.push(edge);
  }
  return out;
}

/** How a behavior slot is used: by a place (a key, combo or fork, directly or
 *  through a tap pattern), only by tap patterns nothing uses, or not at all. */
export type BehaviorUse = "used" | "only-by-unused" | "unused";

export function behaviorUse(graph: Graph, attributed: readonly Attributed[], target: Ref, morseSlots: number): BehaviorUse {
  if (referencedBy(attributed, target).length > 0) return "used";
  for (let index = 0; index < morseSlots; index += 1) {
    const slot: Ref = { kind: "morse", index };
    if (!sameRef(slot, target) && graph.from(slot).some((edge) => sameRef(edge.to, target))) return "only-by-unused";
  }
  return "unused";
}
