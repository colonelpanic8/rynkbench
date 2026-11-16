import { describe, expect, it } from "vitest";
import type { KeyAction } from "../../vendor/rynk-wasm/rynk_wasm";
import { emptyHistory, merge, record, redo, stepBetween, undo, type Cells, type DraftImage, type Step } from "./history";

const A = { Single: { Key: { Hid: "A" } } } as unknown as KeyAction;
const B = { Single: { Key: { Hid: "B" } } } as unknown as KeyAction;
const drafted = [{ layer: 0, row: 0, col: 1 }];
const image = (over: Partial<DraftImage>): DraftImage => ({ layers: [["No", "No"]], draftedKeys: [], lighting: [{}], rules: [], ...over });
const lit = (led: number, r: number): Cells => ({ [led]: { led_id: led, effect: { Solid: { color: { r, g: 0, b: 0 } } }, ttl_ms: undefined } });
const keyStep = (from: KeyAction, to: KeyAction): Step => ({ order: 1, keys: [{ layer: 0, row: 0, col: 1, from, to }], lights: [], rules: null });
const lightStep = (from: Cells, to: Cells): Step => ({ order: 1, keys: [], lights: [{ layer: 0, from, to }], rules: null });

describe("the draft's undo and redo", () => {
  it("takes a step from how the drafted keys changed", () => {
    const before = image({});
    const after = image({ layers: [["No", A]], draftedKeys: drafted });
    expect(stepBetween(before, after, 2).keys).toEqual([{ layer: 0, row: 0, col: 1, from: "No", to: A }]);
    // A key edited back to what the keyboard has leaves the draft, and is still a step.
    expect(stepBetween(after, image({}), 2).keys).toEqual([{ layer: 0, row: 0, col: 1, from: A, to: "No" }]);
  });

  it("ignores changes that are not to drafted keys", () => {
    expect(stepBetween(image({ layers: [[A, "No"]] }), image({ layers: [[B, "No"]] }), 2)).toEqual({ order: 0, keys: [], lights: [], rules: null });
  });

  it("takes a step from a layer's lighting and the rules, and none from the same cells read again", () => {
    const step = stepBetween(image({}), image({ lighting: [lit(3, 9)] }), 2);
    expect(step.lights).toEqual([{ layer: 0, from: {}, to: lit(3, 9) }]);
    expect(stepBetween(image({ lighting: [lit(3, 9)] }), image({ lighting: [JSON.parse(JSON.stringify(lit(3, 9))) as Cells] }), 2).lights).toEqual([]);
    const rules = stepBetween(image({}), image({ rules: [{ cell: { led_id: 1 } } as never] }), 2).rules;
    expect(rules?.to).toHaveLength(1);
  });

  it("undoes, redoes, and drops the future on a new step", () => {
    const one = keyStep("No", A);
    const two = keyStep(A, B);
    let history = record(record(emptyHistory(), one), two);
    const back = undo(history)!;
    expect(back.step).toBe(two);
    history = back.history;
    expect(redo(history)!.step).toBe(two);
    history = record(history, one);
    expect(history.future).toEqual([]);
    expect(undo(emptyHistory())).toBeNull();
  });
});

describe("a Paint stroke", () => {
  it("joins the last step: each thing from where it started to where it ended", () => {
    let history = record(emptyHistory(), lightStep({}, lit(3, 9)));
    history = record(history, { order: 2, keys: [], lights: [{ layer: 0, from: lit(3, 9), to: { ...lit(3, 9), ...lit(4, 9) } }], rules: null }, true);
    expect(history.past).toHaveLength(1);
    expect(history.past[0].order).toBe(1);
    expect(history.past[0].lights).toEqual([{ layer: 0, from: {}, to: { ...lit(3, 9), ...lit(4, 9) } }]);
  });

  it("is no step at all when it ends where it started", () => {
    const history = record(record(emptyHistory(), lightStep({}, lit(3, 9))), lightStep(lit(3, 9), {}), true);
    expect(history.past).toEqual([]);
  });

  it("merges keys, layers and rules alike", () => {
    const joined = merge(keyStep("No", A), { ...keyStep(A, B), rules: { from: [], to: [{} as never] } });
    expect(joined.keys).toEqual([{ layer: 0, row: 0, col: 1, from: "No", to: B }]);
    expect(joined.rules?.to).toHaveLength(1);
  });
});
