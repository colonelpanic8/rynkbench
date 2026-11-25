import { describe, expect, it } from "vitest";
import type { Action, ComboDefinition, Fork, KeyAction, Morse } from "../vendor/rynk-wasm/rynk_wasm";
import { noStateBits } from "../model/slots";
import { activators, attributedEdges, behaviorUse, buildGraph, cellRef, dangling, keyActionReferences, layerRef, reachableLayers, referencedBy, refKey, slotRef } from "./index";
import type { GraphSource } from "./index";

const key = (code: string): KeyAction => ({ Single: { Key: { Hid: code as never } } });
const mo = (layer: number): KeyAction => ({ Single: { LayerOn: layer } });
const emptyMorse: Morse = { profile: {} as Morse["profile"], actions: [] };
const holdMorse: Morse = {
  profile: {} as Morse["profile"],
  actions: [
    [1, { Key: { Hid: "Delete" } }],
    [2, { LayerOn: 2 }],
  ],
};

function source(overrides: Partial<GraphSource>): GraphSource {
  return { layers: [], cols: 2, combos: [], morse: [], forks: [], macroCount: 0, profileSlots: [], ...overrides };
}

describe("references of a key binding", () => {
  it("lists layer, morse, macro and profile references in order", () => {
    expect(keyActionReferences(mo(3))).toEqual([{ kind: "activates", to: layerRef(3) }]);
    expect(keyActionReferences({ Morse: 4 })).toEqual([{ kind: "morse", to: slotRef("morse", 4) }]);
    expect(keyActionReferences({ Single: { TriggerMacro: 2 } })).toEqual([{ kind: "invokes", to: slotRef("macro", 2) }]);
    expect(keyActionReferences({ Single: { LayerOff: 1 } })).toEqual([{ kind: "deactivates", to: layerRef(1) }]);
    expect(keyActionReferences({ TapHold: [{ Key: { Hid: "A" } } as Action, { LayerOn: 1 }, 5] })).toEqual([
      { kind: "activates", to: layerRef(1) },
      { kind: "profile", to: slotRef("profile", 5) },
    ]);
    expect(keyActionReferences({ LayerModTap: [6, "LCtrl", "Tab"] } as KeyAction)).toEqual([{ kind: "activates", to: layerRef(6) }]);
  });

  it("does not count the default tap-hold profile", () => {
    expect(keyActionReferences({ TapHold: [{ Key: { Hid: "A" } } as Action, "No", 255] })).toEqual([]);
  });

  it("holds nothing for a plain key or a bare keyword", () => {
    expect(keyActionReferences(key("A"))).toEqual([]);
    expect(keyActionReferences("No")).toEqual([]);
    expect(keyActionReferences("Transparent")).toEqual([]);
  });
});

describe("the graph", () => {
  const graph = buildGraph(
    source({
      layers: [
        [key("A"), { Morse: 0 }], // layer 0: morse hold activates layer 2
        [key("B"), "No"], // layer 1: island
        [key("C"), mo(1)], // layer 2: reachable via the morse slot, refers to layer 1
      ],
      morse: [holdMorse, emptyMorse],
    }),
  );

  it("keeps only places that hold references, in table order", () => {
    expect(graph.owners.map((o) => refKey(o.ref))).toEqual(["cell:0:1", "cell:2:1"]);
  });

  it("knows which layers and slots exist", () => {
    expect(graph.has(layerRef(2))).toBe(true);
    expect(graph.has(layerRef(3))).toBe(false);
    expect(graph.has(slotRef("morse", 1))).toBe(true);
    expect(graph.has(slotRef("morse", 2))).toBe(false);
    expect(graph.has(slotRef("macro", 0))).toBe(false);
  });

  it("scopes a cell to its layer", () => {
    expect(graph.scopeOf(cellRef(2, 1))).toBe(2);
    expect(graph.scopeOf(slotRef("fork", 0))).toBeNull();
  });

  it("attributes a morse slot's references to whoever refers to the slot", () => {
    const attributed = attributedEdges(graph);
    const viaSlot = attributed.filter((a) => a.via !== null);
    expect(viaSlot).toHaveLength(1);
    expect(refKey(viaSlot[0].owner)).toBe("cell:0:1");
    expect(refKey(viaSlot[0].edge.to)).toBe("layer:2");
    expect(viaSlot[0].scope).toBe(0);
  });

  it("finds what activates each layer and which layers can be reached", () => {
    const attributed = attributedEdges(graph);
    const byLayer = activators(attributed);
    expect([...byLayer.keys()]).toEqual([2, 1]);
    expect(byLayer.get(1)?.map((a) => refKey(a.owner))).toEqual(["cell:2:1"]);
    expect([...reachableLayers(attributed, 0)].sort()).toEqual([0, 1, 2]);
  });

  it("finds a layer nothing reaches", () => {
    const island = buildGraph(source({ layers: [[key("A")], [key("B")]] }));
    expect([...reachableLayers(attributedEdges(island), 0)]).toEqual([0]);
  });

  it("lets a layer-scoped owner help only once its layer is reached, and a global one everywhere", () => {
    const g = buildGraph(
      source({
        layers: [[key("A")], [mo(2)], [key("C")], [key("D")]],
        combos: [{ Actions: { actions: [key("A"), key("B")], output: mo(3), layers: 0xffffffff } } as ComboDefinition],
      }),
    );
    // layer 1 holds the only edge into 2, but nothing reaches layer 1; the
    // unscoped combo turns on 3 from wherever you are.
    expect([...reachableLayers(attributedEdges(g), 0)].sort()).toEqual([0, 3]);
  });

  it("reports references to things that do not exist", () => {
    const g = buildGraph(source({ layers: [[mo(4), { Morse: 3 }, { Single: { TriggerMacro: 0 } }]] }));
    expect(dangling(g).map((e) => refKey(e.to))).toEqual(["layer:4", "morse:3", "macro:0"]);
  });

  it("lists everything that refers to a node", () => {
    const attributed = attributedEdges(graph);
    expect(referencedBy(attributed, layerRef(2)).map((a) => refKey(a.owner))).toEqual(["cell:0:1"]);
    expect(referencedBy(attributed, layerRef(1)).map((a) => refKey(a.owner))).toEqual(["cell:2:1"]);
    expect(referencedBy(attributed, layerRef(0))).toEqual([]);
  });
});

describe("combos and forks", () => {
  const fork: Fork = {
    trigger: mo(1),
    negative_output: key("Z"),
    positive_output: { Single: { TriggerMacro: 1 } },
    match_any: noStateBits(),
    match_none: noStateBits(),
    kept_modifiers: noStateBits().modifiers,
    bindable: false,
    layers: 0xffffffff,
  };
  const unprogrammedFork: Fork = { ...fork, trigger: "No" };

  it("includes programmed combos and forks and skips empty ones", () => {
    const g = buildGraph(
      source({
        layers: [[key("A")], [key("B")], [key("C")]],
        macroCount: 2,
        forks: [fork, unprogrammedFork],
        combos: [
          { Actions: { actions: [key("A"), key("B")], output: mo(2), layers: 1 << 1 } },
          { Actions: { actions: [], output: "No", layers: 0xffffffff } },
        ] as ComboDefinition[],
      }),
    );
    expect(g.owners.map((o) => refKey(o.ref))).toEqual(["combo:0", "fork:0"]);
    expect(g.scopeOf(slotRef("combo", 0))).toBe(1);
    // A combo limited to layer 1 refers to layer 1, besides turning on layer 2.
    expect(g.from(slotRef("combo", 0)).map((e) => `${e.kind}>${refKey(e.to)}`)).toEqual(["activates>layer:2", "scopes>layer:1"]);
    expect(g.from(slotRef("fork", 0)).map((e) => `${e.kind}>${refKey(e.to)}`)).toEqual(["activates>layer:1", "invokes>macro:1"]);
  });
});

describe("how a behavior is used", () => {
  it("is used by a key, only by a tap pattern nothing uses, or not at all", () => {
    const macroMorse: Morse = { profile: {} as Morse["profile"], actions: [[2, { TriggerMacro: 0 }]] };
    const kept: Morse = { profile: {} as Morse["profile"], actions: [[2, { TriggerMacro: 1 }]] };
    const built = source({ layers: [[{ Morse: 1 }, key("A")]], morse: [macroMorse, kept], macroCount: 3 });
    const graph = buildGraph(built);
    const attributed = attributedEdges(graph);
    const use = (ref: Parameters<typeof behaviorUse>[2]) => behaviorUse(graph, attributed, ref, built.morse.length);
    expect(use(slotRef("morse", 1))).toBe("used");
    expect(use(slotRef("macro", 1))).toBe("used");
    expect(use(slotRef("morse", 0))).toBe("unused");
    expect(use(slotRef("macro", 0))).toBe("only-by-unused");
    expect(use(slotRef("macro", 2))).toBe("unused");
  });
});
