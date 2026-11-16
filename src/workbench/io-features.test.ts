import { describe, expect, it } from "vitest";
import { ioFeaturesFor } from "./io";
import { type ConnectedBundle } from "../model/workbench-state";

/** The gating `ioFeaturesFor` had before it read the capability set. Kept here
 *  so the migration is proven to change nothing, for every combination. */
function legacy(bundle: Pick<ConnectedBundle, "sceneStatus" | "runtimeConditionalStatus" | "lightingExtension" | "pointingConfig" | "lightingState" | "lightingOutputMode">) {
  return {
    sceneCapacity: bundle.sceneStatus?.capacity ?? null,
    conditionalSceneCapacity: bundle.runtimeConditionalStatus?.capacity ?? null,
    scenesSupported: bundle.sceneStatus !== null,
    conditionalScenesSupported: bundle.runtimeConditionalStatus !== null,
    extensionSupported: bundle.lightingExtension !== null,
    pointingSupported: bundle.pointingConfig !== null,
    lightingOutputSupported: bundle.lightingState !== null && bundle.lightingOutputMode !== null,
    macroSpace: null,
  };
}

describe("ioFeaturesFor", () => {
  it("matches the previous gating for every combination of optional surfaces", () => {
    const scenes = [null, { capacity: 0 }, { capacity: 16 }];
    const rules = [null, { capacity: 0 }, { capacity: 24 }];
    const present = [null, {}];
    let checked = 0;
    for (const sceneStatus of scenes)
      for (const runtimeConditionalStatus of rules)
        for (const lightingExtension of present)
          for (const pointingConfig of present)
            for (const lightingState of present)
              for (const lightingOutputMode of present) {
                const bundle = {
                  sceneStatus,
                  runtimeConditionalStatus,
                  compiledSceneStatus: null,
                  lightingExtension,
                  pointingConfig,
                  lightingState,
                  lightingOutputMode,
                  caps: { max_morse: 0, max_patterns_per_key: 0, max_macros: 0, macro_space_size: 0, macros_writable: false, max_forks: 0 },
                  morseProfileCapacity: 0,
                } as unknown as ConnectedBundle;
                expect(ioFeaturesFor(bundle)).toEqual(legacy(bundle));
                checked += 1;
              }
    expect(checked).toBe(3 * 3 * 2 * 2 * 2 * 2);
  });

  it("gives the operations the macro slots and the bytes they share", () => {
    const bundle = {
      sceneStatus: null,
      runtimeConditionalStatus: null,
      compiledSceneStatus: null,
      lightingExtension: null,
      pointingConfig: null,
      lightingState: null,
      lightingOutputMode: null,
      caps: { max_morse: 0, max_patterns_per_key: 0, max_macros: 16, macro_space_size: 512, macros_writable: true, max_forks: 0 },
      morseProfileCapacity: 0,
    } as unknown as ConnectedBundle;
    expect(ioFeaturesFor(bundle).macroSpace).toEqual({ slots: 16, bytes: 512 });
  });
});
