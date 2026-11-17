import { describe, expect, it } from "vitest";
import type { KeyAction } from "../../vendor/rynk-wasm/rynk_wasm";
import { testWorkbench } from "../../test/workbench";
import type { WorkbenchState } from "../../model/workbench-state";
import { withStatusLight } from "../../model/lighting/status-light";
import { makeWorkbenchReducer } from "../reducer";
import { draftGroups, draftSize, draftSnapshot, groupItems, keptPatch, parseStoredDraft } from "./changes";
import { draftOf } from "./want";

const A = { Single: { Key: { Hid: "A" } } } as unknown as KeyAction;
const B = { Single: { Key: { Hid: "B" } } } as unknown as KeyAction;
const RED = { r: 255, g: 0, b: 0 };
const cell = (led_id: number) => ({ led_id, effect: { Solid: { color: RED } }, ttl_ms: undefined });
const nothing = [["No", "No"], ["No", "No"]] as KeyAction[][];

/** A two-layer, two-key board whose keyboard holds nothing; `over` is what you want. */
function state(over: Partial<WorkbenchState> = {}): WorkbenchState {
  return testWorkbench({ bundle: { caps: { num_layers: 2, num_cols: 2 } }, state: { layers: nothing, ...over, base: { layers: nothing } } }).state;
}
const keys = { layers: [[A, B], [A, "No"]] as KeyAction[][] };
const reduce = makeWorkbenchReducer(2);

describe("the draft", () => {
  it("is empty when nothing waits for the keyboard", () => {
    expect(draftGroups(state())).toEqual([]);
    expect(draftSnapshot(state())).toBeNull();
  });

  it("groups drafted keys per layer, lighting per layer, and the lock and battery lights", () => {
    const rules = withStatusLight([], 1, 7, { kind: "lock", lock: "caps_lock", on: RED, off: null });
    const groups = draftGroups(state({ ...keys, layerDrafts: { 1: { 4: cell(4), 5: cell(5) } }, runtimeConditionalDraft: rules }));
    expect(groups).toEqual([
      { area: "keys", layer: 0, count: 2 },
      { area: "keys", layer: 1, count: 1 },
      { area: "lighting", layer: 1, count: 2 },
      { area: "lightRules", count: 1 },
    ]);
    expect(draftSize(groups)).toBe(6);
  });

  it("lets one group go back to what the keyboard holds", () => {
    const drafted = state({ ...keys, layerDrafts: { 1: { 4: cell(4) } } });
    const back = reduce(drafted, { type: "draftRevert", items: groupItems(drafted, { area: "keys", layer: 0, count: 2 }) });
    expect(back.layers).toEqual([["No", "No"], [A, "No"]]);
    expect(draftGroups(back).map((group) => group.area)).toEqual(["keys", "lighting"]);
    expect(draftGroups(reduce(back, { type: "batchDiscard" }))).toEqual([]);
  });

  it("shows a deleted layer as one change, with the keys of the layers that moved down, discarded whole", () => {
    const meta = (...names: Array<string | null>) => names.map((name) => ({ occupied: name !== null, name: name ?? "" }));
    const three = [[A, A], [B, B], [A, B]] as KeyAction[][];
    const deleted = testWorkbench({
      bundle: { caps: { num_layers: 3, num_cols: 2 } },
      state: {
        layers: [[A, A], [A, B], ["No", "No"]] as KeyAction[][],
        layerMetadata: meta("Base", "Games", null),
        base: { layers: three, metadata: meta("Base", "Lower", "Games") },
      },
    }).state;
    const groups = draftGroups(deleted);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ area: "layers", structure: { deleted: ["Lower"], moved: 1 }, folded: [{ area: "keys", layer: 1 }, { area: "keys", layer: 2 }] });
    const back = reduce(deleted, { type: "draftRevert", items: groupItems(deleted, groups[0]) });
    expect(draftGroups(back)).toEqual([]);
  });

  it("holds nothing a Live write already put on the keyboard, and keeps nothing it failed to", () => {
    let live = state({ batchMode: false });
    live = reduce(live, { type: "keyWriteStart", layer: 0, row: 0, col: 1, action: A });
    expect(draftOf(live).changes).toEqual([]);
    live = reduce(live, { type: "keyWriteErr", layer: 0, row: 0, col: 1, prev: "No", attempted: A, message: "dropped" });
    expect(live.layers[0][1]).toBe("No");
    expect(draftOf(live).changes).toEqual([]);
  });

  it("is kept as each item with what it was based on, and read back", () => {
    const kept = draftSnapshot(state({ ...keys, layerDrafts: { 1: { 4: cell(4) } } }))!;
    expect(kept.size).toBe(4);
    expect(kept.changes[0]).toEqual({ item: { kind: "key", layer: 0, offset: 0 }, before: "No", after: A });
    expect(parseStoredDraft(JSON.stringify(kept))).toEqual(kept);
    expect(parseStoredDraft("not json")).toBeNull();
    expect(parseStoredDraft("")).toBeNull();
  });

  it("is put back on top of what the keyboard has now, based on what it was based on", () => {
    const kept = draftSnapshot(state({ ...keys, layerDrafts: { 1: { 4: cell(4) } } }))!;
    // Meanwhile the keyboard got B on layer 1's first key.
    const now = state({ layers: [["No", "No"], [B, "No"]] });
    const restored = reduce({ ...now, base: { ...now.base, layers: [["No", "No"], [B, "No"]] } }, { type: "draftRestore", patch: keptPatch(kept, now.base, 2) });
    expect(restored.layers).toEqual(keys.layers);
    expect(restored.layerDrafts[1]).toEqual({ 4: cell(4) });
    // What it was based on is kept beside the base, so Send's three-way check
    // sees B as a change made on the keyboard, and Discard lands on B.
    expect(draftSnapshot(restored)!.changes).toContainEqual({ item: { kind: "key", layer: 1, offset: 0 }, before: "No", after: A });
    expect(draftSize(draftGroups(restored))).toBe(4);
    expect(reduce(restored, { type: "batchDiscard" }).layers).toEqual([["No", "No"], [B, "No"]]);
  });

  it("converts a draft kept in the shape before ADR 0018 once, when read", () => {
    const old = {
      keys: [{ layer: 1, row: 0, col: 1, action: A, before: "No" }],
      slots: [],
      encoders: [],
      lighting: { 1: [cell(4)] },
      rules: null,
      size: 2,
    };
    const kept = parseStoredDraft(JSON.stringify(old))!;
    const now = state();
    const restored = reduce(now, { type: "draftRestore", patch: keptPatch(kept, now.base, 2) });
    expect(restored.layers[1][1]).toEqual(A);
    expect(restored.layerDrafts[1]).toEqual({ 4: cell(4) });
    expect(draftOf(restored).changes.map((change) => change.item)).toEqual([
      { kind: "key", layer: 1, offset: 1 },
      { kind: "lighting", layer: 1 },
    ]);
  });
});
