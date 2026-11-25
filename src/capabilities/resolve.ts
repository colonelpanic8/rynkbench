// From what connecting found out about the firmware to the capabilities it
// offers. Pure and free of protocol types: the inputs are plain facts, so this
// layer needs nothing from the wire package, the session or the screen.

import type { Capability, CapabilityId, CapabilitySet } from "./types";

/** The firmware facts the capabilities derive from, reduced to primitives so a
 *  hook can memoize on them without chasing object identity. */
export interface FirmwareFacts {
  /** Capacity of the on-device layer scene table; null when the firmware has none. */
  sceneSlots: number | null;
  /** Capacity of the runtime lighting rule table; null when the firmware has none. */
  ruleSlots: number | null;
  /** The firmware has the lighting subsystem at all. */
  lighting: boolean;
  /** Layer scenes compiled into this firmware build. */
  compiledScenes: boolean;
  extensionEffects: boolean;
  pointing: boolean;
  /** The three-state lighting output policy and its live state. */
  outputMode: boolean;
  /** Lights that are shown and never stored: the overlay. */
  overlay: boolean;
  /** Entries in the morse (tap-dance) table; 0 when the firmware has none. */
  morseSlots: number;
  /** Patterns one morse entry can hold. */
  morsePatterns: number;
  /** Macro slots and the bytes they share; 0 when the firmware has none. */
  macroSlots: number;
  macroBytes: number;
  /** Whether macros can be changed (a firmware without storage serves its own). */
  macrosWritable: boolean;
  forkSlots: number;
  /** Tap-hold profile slots. */
  profileSlots: number;
}

/** Anything that carries the connect-time reads: a connect bundle or the
 *  workbench state. Structural on purpose, so neither has to be imported. */
export interface FactSource {
  sceneStatus: { capacity: number } | null;
  runtimeConditionalStatus: { capacity: number } | null;
  compiledSceneStatus: unknown;
  lightingExtension: unknown;
  pointingConfig: unknown;
  lightingState: unknown;
  lightingOutputMode: unknown;
  /** Whether the firmware answered the overlay read. */
  overlayReadSupported: boolean;
  caps: {
    max_morses: number;
    max_patterns_per_key: number;
    max_macros: number;
    macro_space_size: number;
    macros_writable: boolean;
    max_forks: number;
  };
  morseProfileCapacity: number;
}

/** A read that came back `null` means the firmware does not have the surface. */
export function firmwareFactsOf(source: FactSource): FirmwareFacts {
  return {
    sceneSlots: source.sceneStatus?.capacity ?? null,
    ruleSlots: source.runtimeConditionalStatus?.capacity ?? null,
    lighting: source.lightingState !== null,
    compiledScenes: source.compiledSceneStatus !== null,
    extensionEffects: source.lightingExtension !== null,
    pointing: source.pointingConfig !== null,
    outputMode: source.lightingState !== null && source.lightingOutputMode !== null,
    overlay: source.lightingState !== null && source.overlayReadSupported,
    morseSlots: source.caps.max_morses,
    morsePatterns: source.caps.max_patterns_per_key,
    macroSlots: source.caps.macro_space_size > 0 ? source.caps.max_macros : 0,
    macroBytes: source.caps.macro_space_size,
    macrosWritable: source.caps.macros_writable,
    forkSlots: source.caps.max_forks,
    profileSlots: source.morseProfileCapacity,
  };
}

export function resolveCapabilities(facts: FirmwareFacts): CapabilitySet {
  const found = new Map<CapabilityId, Capability>();
  const add = (capability: Capability) => found.set(capability.id, capability);

  if (facts.lighting) {
    add({ id: "lighting.state", reach: "device", readOnly: false });
  }
  if (facts.sceneSlots !== null) {
    add({ id: "lighting.scenes", slots: facts.sceneSlots, reach: "device", readOnly: false });
  }
  if (facts.ruleSlots !== null) {
    add({ id: "lighting.rules", slots: facts.ruleSlots, reach: "device", readOnly: false });
  }
  if (facts.compiledScenes) {
    add({ id: "lighting.compiled", reach: "build", readOnly: true });
  }
  if (facts.extensionEffects) {
    add({ id: "lighting.extension", reach: "device", readOnly: false });
  }
  if (facts.outputMode) {
    add({ id: "lighting.output", reach: "device", readOnly: false });
  }
  if (facts.overlay) {
    add({ id: "lighting.overlay", reach: "device", readOnly: false });
  }
  // A double tap is a morse entry of tap, hold and tap-tap: three patterns.
  if (facts.morseSlots > 0 && facts.morsePatterns >= 3) {
    add({ id: "keys.doubleTap", slots: facts.morseSlots, reach: "device", readOnly: false });
  }
  if (facts.macroSlots > 0) {
    add({ id: "behaviors.macros", slots: facts.macroSlots, bytes: facts.macroBytes, reach: "device", readOnly: !facts.macrosWritable });
  }
  if (facts.morseSlots > 0) add({ id: "behaviors.morse", slots: facts.morseSlots, reach: "device", readOnly: false });
  if (facts.forkSlots > 0) add({ id: "behaviors.forks", slots: facts.forkSlots, reach: "device", readOnly: false });
  if (facts.profileSlots > 0) add({ id: "behaviors.profiles", slots: facts.profileSlots, reach: "device", readOnly: false });
  if (facts.pointing) {
    add({ id: "pointing", reach: "device", readOnly: false });
  }

  return {
    // Table capabilities are only ever stored with their slot count (above).
    get: ((id: CapabilityId) => found.get(id)) as CapabilitySet["get"],
    has: (id) => found.has(id),
    list: () => [...found.values()],
  };
}
