import { describe, expect, it } from "vitest";
import type { ComboDefinition, KeyAction, Morse } from "../vendor/rynk-wasm/rynk_wasm";
import { planLayerRewrite, type LayerRewriteSnapshot } from "../layers/management";
import { deletionBlockedMessage, layerDeletionBlockers } from "./layer-impact";

const key = (code: string): KeyAction => ({ Single: { Key: { Hid: code as never } } });
const mo = (layer: number): KeyAction => ({ Single: { LayerOn: layer } });
const off = (layer: number): KeyAction => ({ Single: { LayerOff: layer } });

function source(overrides: Partial<Parameters<typeof layerDeletionBlockers>[0]>) {
  return { layers: [], cols: 2, layerMetadata: null, combos: [], morse: [], forks: [], ...overrides };
}

describe("what blocks deleting a layer", () => {
  it("lists every place that turns the layer on or off, once each", () => {
    const blockers = layerDeletionBlockers(
      source({ layers: [[key("A"), mo(2), off(2), key("B")], [key("C")], [key("D")]] }),
      2,
    );
    expect(blockers.map((b) => b.label)).toEqual(["Layer 0 · r0c1", "Layer 0 · r1c0"]);
  });

  it("does not count keys on the layer being deleted", () => {
    // Layer 2 holds its own key that holds layer 2 on: that goes with the layer.
    const blockers = layerDeletionBlockers(source({ layers: [[key("A")], [key("B")], [mo(2), key("D")]] }), 2);
    expect(blockers).toEqual([]);
  });

  it("counts a combo that turns the layer on and a combo limited to it", () => {
    const turnsOn = { Actions: { actions: [key("A"), key("B")], output: mo(1), layer: undefined } } as ComboDefinition;
    const limited = { Actions: { actions: [key("A"), key("B")], output: key("C"), layer: 1 } } as ComboDefinition;
    const blockers = layerDeletionBlockers(source({ layers: [[key("A")], [key("B")]], combos: [turnsOn, limited] }), 1);
    expect(blockers.map((b) => b.label)).toEqual(["Combo 0", "Combo 1"]);
  });

  it("counts a key whose morse slot turns the layer on", () => {
    const holdLayer: Morse = { profile: {} as Morse["profile"], actions: [[2, { LayerOn: 1 }]] };
    const blockers = layerDeletionBlockers(source({ layers: [[{ Morse: 0 }], [key("B")]], morse: [holdLayer] }), 1);
    expect(blockers.map((b) => b.label)).toEqual(["Morse 0 via Layer 0 · r0c0"]);
  });
});

describe("the refusal message", () => {
  const sites = (labels: string[]) => labels.map((label) => ({ label, target: null }));

  it("says how many places and names the first few", () => {
    expect(deletionBlockedMessage("Layer 2", sites(["Layer 0 · r0c1"]))).toBe(
      "Layer 2 is still used by 1 place: Layer 0 · r0c1. Change those first, then delete it.",
    );
    expect(deletionBlockedMessage("Nav", sites(["a", "b", "c", "d", "e"]))).toBe(
      "Nav is still used by 5 places: a, b, c, … 2 more. Change those first, then delete it.",
    );
  });
});

// The pre-check must never refuse a delete the rewrite would accept. If the
// graph says a layer is in use, the layer rewrite has to refuse it too.
describe("agreement with the layer rewrite", () => {
  let seed = 4242;
  const rand = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(rand() * n);

  it("blocks only what the rewrite refuses", () => {
    let blocked = 0;
    let allowed = 0;
    for (let n = 0; n < 300; n++) {
      const count = 3 + int(3);
      const cell = (): KeyAction => {
        const r = int(8);
        if (r === 0) return mo(int(count));
        if (r === 1) return off(int(count));
        if (r === 2) return { Tap: { LayerToggle: int(count) } };
        if (r === 3) return { LayerModTap: [int(count), "LCtrl", "Tab"] } as KeyAction;
        if (r === 4) return { TapHold: [{ Key: { Hid: "A" } }, { LayerOn: int(count) }, 255] } as KeyAction;
        return key("A");
      };
      const layers = Array.from({ length: count }, () => Array.from({ length: 4 }, cell));
      const combos = Array.from({ length: int(3) }, () =>
        int(2) === 0
          ? ({ Actions: { actions: [key("A"), key("B")], output: cell(), layer: int(2) === 0 ? int(count) : undefined } } as ComboDefinition)
          : ({ Actions: { actions: [], output: "No", layer: undefined } } as ComboDefinition),
      );
      const target = 1 + int(count - 1);
      const snapshot: LayerRewriteSnapshot = {
        metadata: layers.map((_, i) => ({ name: `L${i}`, occupied: true })),
        layers,
        encoders: layers.map(() => []),
        defaultLayer: 0,
        activeLayers: [],
        combos,
        morse: [],
        forks: [],
        behaviorOptions: null,
        autoMouseLayers: [],
        scenes: [],
        runtimeConditionalScenes: [],
        compiledScenes: [],
        compiledConditionalScenes: [],
        wakeLayers: 0,
        pointing: null,
      };
      const blockers = layerDeletionBlockers(
        { layers, cols: 2, layerMetadata: snapshot.metadata, combos, morse: [], forks: [] },
        target,
      );
      let refusal: string | null = null;
      try {
        planLayerRewrite(snapshot, { type: "delete", layer: target });
      } catch (error) {
        refusal = (error as Error).message;
      }
      if (blockers.length > 0) {
        blocked += 1;
        expect(refusal, `case ${n}: ${blockers.map((b) => b.label).join(", ")}`).toContain("refers to deleted layer");
      } else {
        allowed += 1;
      }
    }
    // The cases exercised both outcomes.
    expect(blocked).toBeGreaterThan(40);
    expect(allowed).toBeGreaterThan(20);
  });
});
