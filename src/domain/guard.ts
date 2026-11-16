// Rynkbench Guard: what keeps a layout from being broken (ADR 0011). It
// compares a change before and after on the reference graph and reports only
// what the change itself breaks, so a layout that was already odd is never
// blamed on the next edit. Every key write passes it, in Live and in Draft;
// screens show its findings and never decide them.

import { buildGraph } from "./graph";
import type { Graph } from "./graph";
import { activators, attributedEdges, dangling, reachableLayers } from "./queries";
import type { Attributed } from "./queries";
import { layerRef, refKey } from "./refs";
import type { Ref, RefKind } from "./refs";
import { keyActionIsBound } from "./sources";
import type { GraphSource } from "./sources";

/** stop: the change is not made. ask: it is made only after a yes. */
export type GuardTier = "stop" | "ask";

export type GuardRuleId = "broken-reference" | "unreachable-layer";

export interface GuardFinding {
  rule: GuardRuleId;
  tier: GuardTier;
  /** What the change breaks: the missing layer or slot, or the layer it cuts off. */
  subject: Ref;
  /** The places whose change causes it, in layout order. */
  places: Ref[];
}

/** One side of a change: the layout, and the layer the keyboard starts on. */
export interface GuardInput {
  source: GraphSource;
  defaultLayer: number;
}

interface Facts {
  source: GraphSource;
  graph: Graph;
  attributed: Attributed[];
  reachable: Set<number>;
}

interface GuardRule {
  tier: GuardTier;
  find(before: Facts, after: Facts): Omit<GuardFinding, "rule" | "tier">[];
}

/** What a broken reference is judged for. Tap-hold profiles are left out: an
 *  empty profile slot has no settled meaning in the firmware yet. */
const JUDGED_TARGETS = new Set<RefKind>(["layer", "macro", "morse", "combo", "fork"]);

const edgeKey = (from: Ref, to: Ref) => `${refKey(from)}>${refKey(to)}`;

/** Findings grouped by subject, the places of each kept in order without repeats. */
function bySubject(pairs: { subject: Ref; place: Ref }[]): Omit<GuardFinding, "rule" | "tier">[] {
  const groups = new Map<string, { subject: Ref; places: Map<string, Ref> }>();
  for (const { subject, place } of pairs) {
    const group = groups.get(refKey(subject)) ?? { subject, places: new Map() };
    group.places.set(refKey(place), place);
    groups.set(refKey(subject), group);
  }
  return [...groups.values()].map(({ subject, places }) => ({ subject, places: [...places.values()] }));
}

export const GUARD_RULES: Record<GuardRuleId, GuardRule> = {
  // A key, combo or fork pointing at a layer, macro or slot that does not exist.
  "broken-reference": {
    tier: "stop",
    find(before, after) {
      const known = new Set(dangling(before.graph).map((edge) => edgeKey(edge.from, edge.to)));
      return bySubject(
        dangling(after.graph)
          .filter((edge) => JUDGED_TARGETS.has(edge.to.kind) && !known.has(edgeKey(edge.from, edge.to)))
          .map((edge) => ({ subject: edge.to, place: edge.from })),
      );
    },
  },
  // A layer with keys on it that the keyboard could reach and now cannot.
  "unreachable-layer": {
    tier: "ask",
    find(before, after) {
      const ways = (facts: Facts, layer: number): Ref[] =>
        (activators(facts.attributed).get(layer) ?? []).map((entry) => entry.owner);
      // A layer reached only through another one that is cut off is cut off
      // too; its own ways are still there, so it lists no places.
      return [...before.reachable]
        .filter((layer) => !after.reachable.has(layer) && after.source.layers[layer]?.some(keyActionIsBound))
        .sort((a, b) => a - b)
        .map((layer) => {
          const left = new Set(ways(after, layer).map(refKey));
          const places = ways(before, layer).filter((place) => !left.has(refKey(place)));
          return { subject: layerRef(layer), places: [...new Map(places.map((p) => [refKey(p), p])).values()] };
        });
    },
  },
};

function factsOf({ source, defaultLayer }: GuardInput): Facts {
  const graph = buildGraph(source);
  const attributed = attributedEdges(graph);
  return { source, graph, attributed, reachable: reachableLayers(attributed, defaultLayer) };
}

/** What a change breaks that was not broken before, stops first. */
export function judgeChange(before: GuardInput, after: GuardInput): GuardFinding[] {
  const facts = [factsOf(before), factsOf(after)] as const;
  const findings = (Object.entries(GUARD_RULES) as [GuardRuleId, GuardRule][]).flatMap(([rule, { tier, find }]) =>
    find(...facts).map((found) => ({ rule, tier, ...found })),
  );
  return findings.sort((a, b) => (a.tier === b.tier ? 0 : a.tier === "stop" ? -1 : 1));
}
