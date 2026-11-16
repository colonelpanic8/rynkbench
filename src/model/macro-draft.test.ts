import { describe, expect, it, vi } from "vitest";
import type { MacroOp } from "../vendor/rynk-wasm/rynk_wasm";
import type { DecodedMacro } from "./macros";
import { macroProblem, newStep, regionWith, withoutStep, withStep, withStepMoved } from "./macro-draft";

// A byte per op and one per slot: the space check without the WASM encoder.
vi.mock("./macros", async (original) => ({
  ...(await original<typeof import("./macros")>()),
  macroTableSize: (macros: MacroOp[][], slots = macros.length) => macros.reduce((n, ops) => n + ops.length, 0) + slots,
}));

const hi: DecodedMacro = { steps: [{ kind: "text", text: "hi" }, { kind: "tap", code: "Enter" }] };

describe("editing a macro", () => {
  it("changes, moves and removes steps", () => {
    expect(withStep(hi, 1, { kind: "delay", ms: 50 }).steps[1]).toEqual({ kind: "delay", ms: 50 });
    expect(withStepMoved(hi, 1, -1).steps.map((step) => step.kind)).toEqual(["tap", "text"]);
    expect(withStepMoved(hi, 0, -1)).toBe(hi);
    expect(withoutStep(hi, 0).steps).toEqual([{ kind: "tap", code: "Enter" }]);
    expect(newStep()).toEqual({ kind: "text", text: "" });
  });

  it("puts it in its slot of the region, growing the region for a new one", () => {
    expect(regionWith([], 1, hi)).toEqual([[], [{ Char: 104 }, { Char: 105 }, { Tap: { Key: { Hid: "Enter" } } }]]);
  });

  it("says what stops it: no steps, empty or non-ASCII text, no space left", () => {
    const space = { slots: 2, bytes: 10 };
    expect(macroProblem({ steps: [] }, [], 0, space)).toBe("Add a step first");
    expect(macroProblem({ steps: [newStep()] }, [], 0, space)).toBe("A text step is empty");
    expect(macroProblem({ steps: [{ kind: "text", text: "é" }] }, [], 0, space)).toBe("Only plain ASCII text fits in a macro");
    expect(macroProblem(hi, [], 0, space)).toBeNull();
    expect(macroProblem(hi, [], 0, { slots: 2, bytes: 4 })).toBe("Not enough macro space: 5 of 4 bytes");
  });
});
