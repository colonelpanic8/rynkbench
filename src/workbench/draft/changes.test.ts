import { describe, expect, it } from "vitest";
import type { KeyAction } from "../../vendor/rynk-wasm/rynk_wasm";
import { testWorkbench } from "../../test/workbench";
import type { WorkbenchState } from "../../model/workbench-state";
import { withStatusLight } from "../../model/lighting/status-light";
import { draftGroups, draftSize, draftSnapshot, parseStoredDraft, restoreActions } from "./changes";

const A = { Single: { Key: { Hid: "A" } } } as unknown as KeyAction;
const B = { Single: { Key: { Hid: "B" } } } as unknown as KeyAction;
const RED = { r: 255, g: 0, b: 0 };
const cell = (led_id: number) => ({ led_id, effect: { Solid: { color: RED } }, ttl_ms: undefined });

function state(over: Partial<WorkbenchState> = {}): WorkbenchState {
  return testWorkbench({ bundle: { caps: { num_layers: 2, num_cols: 2 } }, state: { layers: [["No", "No"], ["No", "No"]], ...over } }).state;
}

const staged = {
  "k:0:0:0": { layer: 0, row: 0, col: 0, before: "No" as KeyAction, action: A },
  "k:0:0:1": { layer: 0, row: 0, col: 1, before: "No" as KeyAction, action: B },
  "k:1:0:0": { layer: 1, row: 0, col: 0, before: "No" as KeyAction, action: A },
};

describe("the draft", () => {
  it("is empty when nothing waits for the keyboard", () => {
    expect(draftGroups(state())).toEqual([]);
    expect(draftSnapshot(state())).toBeNull();
  });

  it("groups staged keys per layer, lighting per layer, and the lock and battery lights", () => {
    const rules = withStatusLight([], 1, 7, { kind: "lock", lock: "caps_lock", on: RED, off: null });
    const groups = draftGroups(state({ stagedKeys: staged, layerDrafts: { 1: { 4: cell(4), 5: cell(5) } }, runtimeConditionalDraft: rules }));
    expect(groups).toEqual([
      { area: "keys", layer: 0, count: 2 },
      { area: "keys", layer: 1, count: 1 },
      { area: "lighting", layer: 1, count: 2 },
      { area: "lightRules", count: 1 },
    ]);
    expect(draftSize(groups)).toBe(6);
  });

  it("is kept as what each change makes, and read back", () => {
    const kept = draftSnapshot(state({ stagedKeys: staged, layerDrafts: { 1: { 4: cell(4) } } }));
    expect(kept).toMatchObject({ size: 4, keys: [{ layer: 0, row: 0, col: 0, action: A }, expect.anything(), expect.anything()], lighting: { 1: [cell(4)] }, rules: null });
    expect(parseStoredDraft(JSON.stringify(kept))).toEqual(kept);
    expect(parseStoredDraft("not json")).toBeNull();
    expect(parseStoredDraft("")).toBeNull();
  });

  it("is put back on top of what the keyboard has now", () => {
    const kept = draftSnapshot(state({ stagedKeys: staged, layerDrafts: { 1: { 4: cell(4) } } }))!;
    const actions = restoreActions(kept, state());
    expect(actions.filter((action) => action.type === "keyStage")).toHaveLength(3);
    expect(actions).toContainEqual({ type: "draftReset", target: 1 });
    expect(actions).toContainEqual({ type: "paint", cells: [cell(4)], target: 1 });
  });
});
