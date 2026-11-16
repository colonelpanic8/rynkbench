import { describe, expect, it } from "vitest";
import type { Fork, KeyAction } from "../vendor/rynk-wasm/rynk_wasm";
import { emptyFork } from "./slots";
import { forkProblem } from "./fork-draft";

const key = (code: string) => ({ Single: { Key: { Hid: code } } }) as KeyAction;

describe("a fork's problems", () => {
  it("asks for the key, what it becomes, and what makes it change", () => {
    const fork: Fork = emptyFork();
    expect(forkProblem(fork)).toBe("Pick the key it changes");
    expect(forkProblem({ ...fork, trigger: key("Dot") })).toBe("Pick what it becomes");
    const both = { ...fork, trigger: key("Dot"), positive_output: key("Semicolon") };
    expect(forkProblem(both)).toBe("Pick what makes it change");
    expect(forkProblem({ ...both, match_any: { ...both.match_any, modifiers: { ...both.match_any.modifiers, left_shift: true } } })).toBeNull();
  });
});
