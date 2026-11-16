import { describe, expect, it } from "vitest";
import type { Action, Morse } from "../vendor/rynk-wasm/rynk_wasm";
import { emptyMorse } from "./slots";
import { elementsToPattern } from "./morse";
import { morseProblem, nextPattern, withNewPattern, withoutPattern, withPattern, withPatternAction } from "./morse-draft";

const a = { Key: { Hid: "A" } } as Action;
const tap = elementsToPattern(["tap"]);
const hold = elementsToPattern(["hold"]);

describe("editing a tap pattern", () => {
  it("adds the next useful pattern: tap, hold, double tap …", () => {
    const one = withNewPattern(emptyMorse());
    expect(one.actions).toEqual([[tap, "No"]]);
    expect(withNewPattern(one).actions[1][0]).toBe(hold);
    expect(nextPattern({ ...emptyMorse(), actions: [[tap, a], [hold, a]] })).toBe(elementsToPattern(["tap", "tap"]));
  });

  it("changes a pattern's taps and holds, its action, and removes one", () => {
    let morse: Morse = withNewPattern(emptyMorse());
    morse = withPatternAction(withPattern(morse, 0, ["hold"]), 0, a);
    expect(morse.actions).toEqual([[hold, a]]);
    expect(withoutPattern(morse, 0).actions).toEqual([]);
  });

  it("says what stops it from being applied", () => {
    expect(morseProblem(emptyMorse(), 4)).toBe("Add a pattern first");
    expect(morseProblem({ ...emptyMorse(), actions: [[tap, "No"]] }, 4)).toBe("● does nothing yet");
    expect(morseProblem({ ...emptyMorse(), actions: [[tap, a], [tap, a]] }, 4)).toBe("Two patterns are ●");
    expect(morseProblem({ ...emptyMorse(), actions: [[tap, a], [hold, a]] }, 1)).toBe("Only one pattern fits");
    expect(morseProblem({ ...emptyMorse(), actions: [[tap, a], [hold, a]] }, 4)).toBeNull();
  });
});
