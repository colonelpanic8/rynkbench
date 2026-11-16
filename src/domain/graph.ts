// The reference graph: which places refer to which layers and slots. Built
// from the edge table (./sources) and read through the queries (./queries).
// Entities are stored by the caller; the edges are derived here, so the graph
// cannot disagree with the data it was built from.

import { EDGE_SOURCES } from "./sources";
import type { GraphSource } from "./sources";
import { refKey } from "./refs";
import type { EdgeKind, Ref } from "./refs";

export interface Edge {
  from: Ref;
  to: Ref;
  kind: EdgeKind;
}

/** A place that holds references, with the layer it is scoped to (null when it
 *  applies everywhere) and its edges in the order the references appear. */
export interface OwnerNode {
  ref: Ref;
  scope: number | null;
  edges: Edge[];
}

export interface Graph {
  /** Owners in their own right, in table order: cells, combos, forks. */
  readonly owners: readonly OwnerNode[];
  /** Whether a layer or slot exists. A reference to one that does not is dangling. */
  has(ref: Ref): boolean;
  /** The edges leaving a node, in order. Empty for nodes that hold none. */
  from(ref: Ref): readonly Edge[];
  /** The layer a node is scoped to, or null when it applies everywhere. */
  scopeOf(ref: Ref): number | null;
  readonly layerCount: number;
}

export function buildGraph(source: GraphSource): Graph {
  const outgoing = new Map<string, Edge[]>();
  const scopes = new Map<string, number | null>();
  const owners: OwnerNode[] = [];

  for (const row of EDGE_SOURCES) {
    for (const owner of row.owners(source)) {
      if (owner.references.length === 0 && !owner.indirect) continue;
      const edges = owner.references.map((r): Edge => ({ from: owner.ref, to: r.to, kind: r.kind }));
      const key = refKey(owner.ref);
      outgoing.set(key, edges);
      scopes.set(key, owner.scope);
      if (!owner.indirect) owners.push({ ref: owner.ref, scope: owner.scope, edges });
    }
  }

  const profiles = new Set(source.profileSlots);
  const exists = (ref: Ref): boolean => {
    switch (ref.kind) {
      case "layer":
        return ref.index >= 0 && ref.index < source.layers.length;
      case "morse":
        return ref.index >= 0 && ref.index < source.morse.length;
      case "macro":
        return ref.index >= 0 && ref.index < source.macroCount;
      case "profile":
        return profiles.has(ref.index);
      case "combo":
        return ref.index >= 0 && ref.index < source.combos.length;
      case "fork":
        return ref.index >= 0 && ref.index < source.forks.length;
      case "cell":
        return source.layers[ref.layer]?.[ref.offset] !== undefined;
    }
  };

  return {
    owners,
    layerCount: source.layers.length,
    has: exists,
    from: (ref) => outgoing.get(refKey(ref)) ?? [],
    scopeOf: (ref) => scopes.get(refKey(ref)) ?? null,
  };
}
