import { describe, expect, it } from "vitest";
import type { MacroOp } from "../vendor/rynk-wasm/rynk_wasm";
import { hidStep, type DecodedMacro } from "./macros";
import {
  dropIndex,
  macroProblem,
  macrosRunBy,
  mayRunMacro,
  regionWith,
  withSendKind,
  withStep,
  withStepMoved,
  withStepsAt,
  withoutStep,
} from "./macro-draft";

const hi: DecodedMacro = { steps: [{ kind: "text", text: "hi" }, hidStep("tap", "Enter")] };
const runs = (macro: number): MacroOp => ({ Tap: { TriggerMacro: macro } });

describe("editing a macro", () => {
  it("changes, inserts and removes steps", () => {
    expect(withStep(hi, 1, { kind: "delay", ms: 50 }).steps[1]).toEqual({ kind: "delay", ms: 50 });
    expect(withStepsAt(hi, 1, [{ kind: "letGo" }]).steps.map((step) => step.kind)).toEqual(["text", "letGo", "tap"]);
    expect(withStepsAt(hi, 99, [{ kind: "letGo" }]).steps.at(-1)).toEqual({ kind: "letGo" });
    expect(withoutStep(hi, 0).steps).toEqual([hidStep("tap", "Enter")]);
  });

  it("moves a step to where it is dropped, and nowhere when it would land in its own place", () => {
    const abc: DecodedMacro = { steps: [hidStep("tap", "A"), hidStep("tap", "B"), hidStep("tap", "C")] };
    const order = (macro: DecodedMacro) => macro.steps.map((step) => ("action" in step ? JSON.stringify(step.action) : step.kind)).join();
    expect(order(withStepMoved(abc, 0, 2))).toBe(order({ steps: [abc.steps[1], abc.steps[2], abc.steps[0]] }));
    expect(withStepMoved(abc, 1, 1)).toBe(abc);
    expect(withStepMoved(abc, 0, 5)).toBe(abc);
    expect(dropIndex(0, 2, true)).toBe(2); // after the last
    expect(dropIndex(2, 0, false)).toBe(0); // before the first
    expect(dropIndex(1, 0, true)).toBeNull(); // just after the row above: where it is
    expect(dropIndex(1, 2, false)).toBeNull();
  });

  it("sends the same action another way; other steps stay as they are", () => {
    expect(withSendKind(hidStep("tap", "A"), "press")).toEqual(hidStep("press", "A"));
    expect(withSendKind({ kind: "delay", ms: 5 }, "press")).toEqual({ kind: "delay", ms: 5 });
  });

  it("puts it in its slot of the region, growing the region for a new one", () => {
    expect(regionWith([], 1, hi)).toEqual([[], [{ Char: 104 }, { Char: 105 }, { Tap: { Key: { Hid: "Enter" } } }]]);
  });

  it("lets a step run another macro, never one that runs this one again", () => {
    const region: MacroOp[][] = [[runs(1)], [runs(2)], [], [runs(0)]];
    expect(macrosRunBy([runs(1), runs(1), { Delay: 5 }, "PauseForRelease"])).toEqual([1]);
    expect(mayRunMacro(region, 2, 1)).toBe(false); // 1 runs 2
    expect(mayRunMacro(region, 2, 2)).toBe(false); // itself
    expect(mayRunMacro(region, 0, 2)).toBe(true);
    expect(mayRunMacro(region, 1, 3)).toBe(false); // 3 → 0 → 1
    expect(mayRunMacro([[runs(0)], []], 1, 0)).toBe(true); // a loop elsewhere is not this one's
  });

  it("says what stops it: no steps, empty or non-ASCII text, a loop, no space left", () => {
    const space = { slots: 2, bytes: 64 };
    expect(macroProblem({ steps: [] }, [], 0, space)).toBe("Add a step first");
    expect(macroProblem({ steps: [hidStep("tap", "A"), { kind: "text", text: "" }] }, [], 0, space)).toBe("Step 2: the text is empty");
    expect(macroProblem({ steps: [{ kind: "text", text: "é" }] }, [], 0, space)).toBe("Step 1: only plain ASCII text fits in a macro");
    expect(macroProblem({ steps: [{ kind: "tap", action: { TriggerMacro: 1 } }] }, [[], [runs(0)]], 0, space)).toMatch(/never end/);
    expect(macroProblem(hi, [], 0, space)).toBeNull();
    expect(macroProblem(hi, [], 0, { slots: 2, bytes: 4 })).toMatch(/^Not enough macro space: \d+ of 4 bytes$/);
  });
});
