import { describe, expect, it, vi } from "vitest";
import type { Fork, KeyAction, MacroOp, Morse, MorseProfile } from "../vendor/rynk-wasm/rynk_wasm";
import type { KeyboardImage } from "../sync/image";
import { noLabels, withLabel, type BehaviorLabels } from "../model/behavior-labels";
import { emptyFork, emptyMorse, emptyMorseProfile } from "../model/slots";
import { behaviorsAsText, behaviorUses, runOperation, type CopiedBehavior, type OperationFacts, type OperationResult } from ".";

// A macro costs a byte per step and one per slot: enough to test the space check without the WASM encoder.
vi.mock("../model/macros", async (original) => ({
  ...(await original<typeof import("../model/macros")>()),
  macroTableSize: (macros: MacroOp[][], slots = macros.length) => macros.reduce((n, ops) => n + ops.length, 0) + slots,
}));

const tap = (code: string) => ({ Key: { Hid: code } }) as Morse["actions"][number][1];
const morse = (...codes: string[]): Morse => ({ ...emptyMorse(), actions: codes.map((code, i) => [2 + i, tap(code)]) });
const fork: Fork = { ...emptyFork(), trigger: { Single: { Key: { Hid: "Dot" } } } as KeyAction, positive_output: { Single: { Key: { Hid: "A" } } } as KeyAction };
const macro: MacroOp[] = [{ Tap: tap("H") as never }];

/** One layer of two keys: the first runs tap pattern 1. Four tap patterns, two forks, two profile slots. */
function image(): KeyboardImage {
  return {
    metadata: [],
    layers: [[{ Morse: 1 } as KeyAction, "No"]],
    encoders: [[]],
    defaultLayer: 0,
    combos: [],
    morse: [morse("A"), morse("B"), emptyMorse(), emptyMorse()],
    forks: [emptyFork(), emptyFork()],
    macroOps: [],
    behaviorOptions: null,
    autoMouseLayers: [],
    scenes: [],
    runtimeConditionalScenes: [],
    wakeLayers: 0,
    pointing: null,
    morseProfiles: [null, null],
    holdTriggerPositions: [{ profile: 0, row: 0, col: 1 }],
  };
}

const facts = (labels: BehaviorLabels = noLabels(), macroBytes = 64): OperationFacts => ({
  cols: 2,
  sceneCapacity: null,
  ruleCapacity: null,
  activeLayers: [],
  compiledScenes: [],
  compiledRules: [],
  ledNodes: {},
  labels,
  macroSpace: { slots: 4, bytes: macroBytes },
});

const run = (name: Parameters<typeof runOperation>[0], input: unknown, on = image(), with_ = facts()) => runOperation(name, on, input as never, with_);
const ok = (result: OperationResult) => {
  if (!result.ok) throw new Error(result.message);
  return result;
};
const named = (kind: "morse" | "macros" | "forks", slot: number, name: string, labels = noLabels()) => withLabel(labels, kind, slot, { name, description: "" });

describe("creating a behavior", () => {
  it("takes the first free slot of its kind, with its name and description", () => {
    const result = ok(run("create_behavior", { kind: "morse", value: morse("C"), name: "Copy", description: "tap for c" }));
    expect(result.image.morse[2]).toEqual(morse("C"));
    expect(result.labels?.morse).toEqual({ 2: { name: "Copy", description: "tap for c" } });
  });

  it("gives a taken name a number, and says when every slot is in use", () => {
    const result = ok(run("create_behavior", { kind: "morse", value: morse("C"), name: "home" }, image(), facts(named("morse", 0, "Home"))));
    expect(result.labels?.morse[2].name).toBe("home 2");
    const full = { ...image(), morse: [morse("A"), morse("B")] };
    expect(run("create_behavior", { kind: "morse", value: morse("C") }, full)).toEqual({ ok: false, message: "Every tap pattern slot is in use" });
  });

  it("adds a macro after the last, within the macro slots and their bytes", () => {
    expect(ok(run("create_behavior", { kind: "macros", value: macro })).image.macroOps).toEqual([macro]);
    expect(run("create_behavior", { kind: "macros", value: macro }, image(), facts(noLabels(), 4))).toEqual({ ok: false, message: "Not enough macro space left" });
  });

  it("names a profile on the keyboard, a free one when none is given", () => {
    const result = ok(run("create_behavior", { kind: "profiles", value: emptyMorseProfile() as MorseProfile }));
    expect(result.image.morseProfiles?.[0]).toEqual({ index: 0, name: "Profile 0", profile: emptyMorseProfile() });
    expect(result.labels?.profiles).toEqual({});
  });

  it("checks its input against the catalog", () => {
    expect(run("create_behavior", { kind: "combos", value: {} })).toMatchObject({ ok: false, message: expect.stringMatching(/kind must be one of/) });
  });
});

describe("setting, renaming and duplicating", () => {
  it("sets a slot's value and keeps its name", () => {
    const result = ok(run("set_behavior", { kind: "forks", slot: 1, value: fork }));
    expect(result.image.forks[1]).toEqual(fork);
    expect(result.labels).toBeUndefined();
  });

  it("renames within its kind, keeping the description unless given", () => {
    const labels = withLabel(named("morse", 1, "Home"), "morse", 0, { name: "Old", description: "keep me" });
    const result = ok(run("rename_behavior", { kind: "morse", slot: 0, name: "New" }, image(), facts(labels)));
    expect(result.labels?.morse[0]).toEqual({ name: "New", description: "keep me" });
    expect(result.image).toEqual(image());
    expect(run("rename_behavior", { kind: "morse", slot: 0, name: "home" }, image(), facts(labels))).toEqual({ ok: false, message: "Another tap pattern is called home" });
    expect(run("rename_behavior", { kind: "morse", slot: 3, name: "x" })).toEqual({ ok: false, message: "There is no tap pattern 3" });
  });

  it("renames a profile on the keyboard, within its length", () => {
    const withProfile = ok(run("create_behavior", { kind: "profiles", value: emptyMorseProfile() as MorseProfile, name: "Fast" })).image;
    expect(ok(run("rename_behavior", { kind: "profiles", slot: 0, name: "Slow", description: "thumbs" }, withProfile)).image.morseProfiles?.[0]?.name).toBe("Slow");
    expect(run("rename_behavior", { kind: "profiles", slot: 0, name: "x".repeat(33) }, withProfile)).toMatchObject({ ok: false });
  });

  it("duplicates into a free slot under a free name", () => {
    const result = ok(run("duplicate_behavior", { kind: "morse", slot: 1 }, image(), facts(named("morse", 1, "Home"))));
    expect(result.image.morse[2]).toEqual(morse("B"));
    expect(result.labels?.morse[2].name).toBe("Home 2");
  });
});

describe("deleting", () => {
  it("empties the slot and forgets its name", () => {
    const result = ok(run("delete_behavior", { kind: "morse", slot: 1 }, image(), facts(named("morse", 1, "Home"))));
    expect(result.image.morse[1]).toEqual(emptyMorse());
    expect(result.labels?.morse).toEqual({});
  });

  it("forgets a profile's hold-trigger keys with it", () => {
    const withProfile = ok(run("create_behavior", { kind: "profiles", value: emptyMorseProfile() as MorseProfile })).image;
    const result = ok(run("delete_behavior", { kind: "profiles", slot: 0 }, withProfile));
    expect(result.image.morseProfiles).toEqual([null, null]);
    expect(result.image.holdTriggerPositions).toEqual([]);
  });

  it("knows what nothing uses, and what only unused ones use", () => {
    const callsMacro: Morse = { ...emptyMorse(), actions: [[2, { TriggerMacro: 0 } as never]] };
    const on = { ...image(), morse: [callsMacro, morse("B"), emptyMorse(), emptyMorse()], macroOps: [macro, macro], forks: [fork, emptyFork()] };
    expect(Object.fromEntries(behaviorUses(on, 2))).toEqual({
      "macros:0": "only-by-unused",
      "macros:1": "unused",
      "morse:0": "unused",
      "morse:1": "used",
      "forks:0": "used",
    });
    const result = ok(run("delete_unused_behaviors", {}, on, facts(named("macros", 1, "Hi"))));
    expect(result.image.macroOps).toEqual([[], []]);
    expect(result.image.morse.slice(0, 2)).toEqual([emptyMorse(), morse("B")]);
    expect(result.image.forks[0]).toEqual(fork);
    expect(result.labels?.macros).toEqual({});
    const chosen = ok(run("delete_unused_behaviors", { items: [{ kind: "macros", slot: 1 }, { kind: "morse", slot: 1 }] }, on));
    expect(chosen.image.macroOps).toEqual([macro, []]);
    expect(chosen.image.morse[1]).toEqual(morse("B"));
  });
});

describe("copy and paste", () => {
  const copied: CopiedBehavior[] = [
    { kind: "morse", value: morse("Z"), name: "Home", description: "d" },
    { kind: "macros", value: macro, name: "", description: "" },
  ];

  it("pastes each into a free slot of its kind under a free name", () => {
    const result = ok(run("paste_behaviors", { text: behaviorsAsText(copied) }, image(), facts(named("morse", 0, "Home"))));
    expect(result.image.morse[2]).toEqual(morse("Z"));
    expect(result.labels?.morse[2]).toEqual({ name: "Home 2", description: "d" });
    expect(result.image.macroOps).toEqual([macro]);
  });

  it("changes nothing when they do not all fit, or the text holds none", () => {
    const full = { ...image(), morse: [morse("A"), morse("B")] };
    expect(run("paste_behaviors", { text: behaviorsAsText(copied) }, full)).toEqual({ ok: false, message: "No free tap pattern slot for Home" });
    expect(run("paste_behaviors", { text: "hello" })).toEqual({ ok: false, message: "The clipboard holds no behaviors" });
    expect(run("paste_behaviors", { text: JSON.stringify({ format: "rynkbench.behaviors", items: [{ kind: "morse", value: {} }] }) })).toEqual({
      ok: false,
      message: "A copied behavior could not be read",
    });
  });
});

describe("an editor's Apply", () => {
  it("sets the value with its name and description as one change", () => {
    const result = ok(run("set_behavior", { kind: "morse", slot: 1, value: morse("Q"), name: "Quit", description: "q" }));
    expect(result.image.morse[1]).toEqual(morse("Q"));
    expect(result.labels?.morse[1]).toEqual({ name: "Quit", description: "q" });
    expect(run("set_behavior", { kind: "morse", slot: 1, value: morse("Q"), name: "home" }, image(), facts(named("morse", 0, "Home")))).toMatchObject({ ok: false });
  });

  it("names a new profile with the value", () => {
    const result = ok(run("set_behavior", { kind: "profiles", slot: 1, value: emptyMorseProfile() as MorseProfile, name: "Thumbs" }));
    expect(result.image.morseProfiles?.[1]?.name).toBe("Thumbs");
  });
});
