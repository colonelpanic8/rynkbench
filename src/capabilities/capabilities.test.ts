import { describe, expect, it } from "vitest";
import { firmwareFactsOf, resolveCapabilities, type FactSource } from "./resolve";

const none: FactSource = {
  sceneStatus: null,
  runtimeConditionalStatus: null,
  compiledSceneStatus: null,
  lightingExtension: null,
  pointingConfig: null,
  lightingState: null,
  lightingOutputMode: null,
  overlayReadSupported: false,
  caps: { max_morses: 0, max_patterns_per_key: 0, max_macros: 0, macro_space_size: 0, macros_writable: false, max_forks: 0 },
  morseProfileCapacity: 0,
};

describe("firmwareFactsOf", () => {
  it("reads a null connect-time read as a missing surface", () => {
    expect(firmwareFactsOf(none)).toEqual({
      sceneSlots: null,
      ruleSlots: null,
      lighting: false,
      compiledScenes: false,
      extensionEffects: false,
      pointing: false,
      outputMode: false,
      overlay: false,
      morseSlots: 0,
      morsePatterns: 0,
      macroSlots: 0,
      macroBytes: 0,
      macrosWritable: false,
      forkSlots: 0,
      profileSlots: 0,
    });
  });

  it("carries capacities through, including an empty table", () => {
    const facts = firmwareFactsOf({
      ...none,
      sceneStatus: { capacity: 0 },
      runtimeConditionalStatus: { capacity: 24 },
    });
    expect(facts.sceneSlots).toBe(0);
    expect(facts.ruleSlots).toBe(24);
  });

  it("reads the lighting subsystem from the lighting state alone", () => {
    expect(firmwareFactsOf({ ...none, lightingState: {} }).lighting).toBe(true);
    expect(firmwareFactsOf(none).lighting).toBe(false);
  });

  it("needs both the state and the output mode for the output capability", () => {
    expect(firmwareFactsOf({ ...none, lightingState: {} }).outputMode).toBe(false);
    expect(firmwareFactsOf({ ...none, lightingOutputMode: {} }).outputMode).toBe(false);
    expect(firmwareFactsOf({ ...none, lightingState: {}, lightingOutputMode: {} }).outputMode).toBe(true);
  });

  it("offers the overlay only when the lighting subsystem answered its read", () => {
    expect(firmwareFactsOf({ ...none, lightingState: {}, overlayReadSupported: true }).overlay).toBe(true);
    expect(firmwareFactsOf({ ...none, lightingState: {} }).overlay).toBe(false);
    expect(firmwareFactsOf({ ...none, overlayReadSupported: true }).overlay).toBe(false);
  });
});

describe("resolveCapabilities", () => {
  it("offers nothing for a board with none of the optional surfaces", () => {
    const set = resolveCapabilities(firmwareFactsOf(none));
    expect(set.list()).toEqual([]);
    expect(set.get("lighting.scenes")).toBeUndefined();
    expect(set.has("pointing")).toBe(false);
  });

  it("describes each surface with its slots, reach and write access", () => {
    const set = resolveCapabilities({
      sceneSlots: 16,
      ruleSlots: 24,
      lighting: true,
      compiledScenes: true,
      extensionEffects: true,
      pointing: true,
      outputMode: true,
      overlay: true,
      morseSlots: 32,
      morsePatterns: 8,
      macroSlots: 0,
      macroBytes: 0,
      macrosWritable: false,
      forkSlots: 0,
      profileSlots: 0,
    });
    expect(set.get("lighting.scenes")).toEqual({ id: "lighting.scenes", slots: 16, reach: "device", readOnly: false });
    expect(set.get("lighting.rules")).toEqual({ id: "lighting.rules", slots: 24, reach: "device", readOnly: false });
    expect(set.get("lighting.compiled")).toEqual({ id: "lighting.compiled", reach: "build", readOnly: true });
    expect(set.get("lighting.state")).toEqual({ id: "lighting.state", reach: "device", readOnly: false });
    expect(set.has("lighting.extension")).toBe(true);
    expect(set.has("lighting.output")).toBe(true);
    expect(set.get("lighting.overlay")).toEqual({ id: "lighting.overlay", reach: "device", readOnly: false });
    expect(set.has("pointing")).toBe(true);
    expect(set.get("keys.doubleTap")).toEqual({ id: "keys.doubleTap", slots: 32, reach: "device", readOnly: false });
    expect(set.get("behaviors.morse")).toEqual({ id: "behaviors.morse", slots: 32, reach: "device", readOnly: false });
    expect(set.list()).toHaveLength(10);
  });

  it("offers a double tap only when a morse entry fits tap, hold and tap-tap", () => {
    const facts = firmwareFactsOf({ ...none, caps: { ...none.caps, max_morses: 8, max_patterns_per_key: 3 } });
    expect(resolveCapabilities(facts).get("keys.doubleTap")?.slots).toBe(8);
    expect(resolveCapabilities({ ...facts, morsePatterns: 2 }).has("keys.doubleTap")).toBe(false);
    expect(resolveCapabilities({ ...facts, morseSlots: 0 }).has("keys.doubleTap")).toBe(false);
  });

  it("offers each behavior kind the keyboard has slots for, macros with their shared bytes", () => {
    const facts = firmwareFactsOf({
      ...none,
      caps: { ...none.caps, max_macros: 32, macro_space_size: 1024, macros_writable: true, max_forks: 4 },
      morseProfileCapacity: 8,
    });
    const set = resolveCapabilities(facts);
    expect(set.get("behaviors.macros")).toEqual({ id: "behaviors.macros", slots: 32, bytes: 1024, reach: "device", readOnly: false });
    expect(set.get("behaviors.forks")?.slots).toBe(4);
    expect(set.get("behaviors.profiles")?.slots).toBe(8);
    expect(set.has("behaviors.morse")).toBe(false);
    const readOnly = firmwareFactsOf({ ...none, caps: { ...none.caps, max_macros: 4, macro_space_size: 64 } });
    expect(resolveCapabilities(readOnly).get("behaviors.macros")?.readOnly).toBe(true);
    expect(resolveCapabilities(firmwareFactsOf({ ...none, caps: { ...none.caps, max_macros: 4 } })).has("behaviors.macros")).toBe(false);
  });

  it("gives table capabilities a slot count the type can rely on", () => {
    const set = resolveCapabilities({ ...firmwareFactsOf(none), sceneSlots: 4, ruleSlots: 8 });
    const scenes = set.get("lighting.scenes");
    const rules = set.get("lighting.rules");
    // `slots` is a plain number here, not `number | undefined`.
    expect((scenes?.slots ?? 0) + (rules?.slots ?? 0)).toBe(12);
  });

  it("treats a supported but empty table as present with zero slots", () => {
    const set = resolveCapabilities({ ...firmwareFactsOf(none), sceneSlots: 0 });
    expect(set.has("lighting.scenes")).toBe(true);
    expect(set.get("lighting.scenes")?.slots).toBe(0);
  });
});
