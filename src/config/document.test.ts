import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { initSync } from "../vendor/glove80-config-wasm/glove80_config_wasm";
import type { ExtensionCatalog } from "./document";
import { detectFormat, parseDocument, renderDocument, snapshotFromState } from "./document";
import type { WorkbenchState } from "../ui/state";

// The document module is a wasm binding, so the tests load the same package the
// app does. `--target web` init wants a fetch; under Node the bytes are handed
// over directly instead.
beforeAll(() => {
  initSync({
    module: readFileSync("src/vendor/glove80-config-wasm/glove80_config_wasm_bg.wasm"),
  });
});

const CATALOG: ExtensionCatalog = {
  effects: ["Gradient", "Rain"],
  palettes: ["Amber", "Classic"],
  params: [
    {
      effect: 1,
      name: "Rain",
      params: [{ name: "Drops", min: 1, max: 32, default: 8, value: 11 }],
    },
  ],
};

/** A minimal document: one layer of the 6x14 grid, holes where the board has
 *  no switch, and the lighting a `glove80.toml` always carries. */
const MINIMAL = `default_layer = 0

[[layer]]
id = "base"
name = "Base"
keys = """
KC_A KC_B KC_C KC_D KC_E -- KC_F KC_G -- KC_H KC_I KC_J KC_K KC_L
KC_A KC_B KC_C KC_D KC_E KC_N KC_F KC_G KC_M KC_H KC_I KC_J KC_K KC_L
KC_A KC_B KC_C KC_D KC_E KC_N KC_F KC_G KC_M KC_H KC_I KC_J KC_K KC_L
KC_A KC_B KC_C KC_D KC_E KC_N KC_F KC_G KC_M KC_H KC_I KC_J KC_K KC_L
KC_A KC_B KC_C KC_D KC_E KC_N KC_F KC_G KC_M KC_H KC_I KC_J KC_K KC_L
KC_A KC_B KC_C KC_D KC_E -- KC_F KC_G -- KC_H KC_I KC_J KC_K KC_L
"""

[lighting]
brightness = 200
output_mode = "always-on"
scene_policy = "effective-only"

[lighting.background]
enabled = false
hue = 0
saturation = 0
value = 0
speed = 128
mode = "solid"

[lighting.effects]
effect = "Rain"
palette = "Amber"
value = 255
speed = 108

[lighting.effects.params.Rain]
Drops = 11
`;

describe("detectFormat", () => {
  it("tells the two document formats apart by their first character", () => {
    expect(detectFormat(MINIMAL)).toBe("toml");
    expect(detectFormat('  {"keyboard": "glove80"}')).toBe("moergo-json");
  });
});

describe("parseDocument", () => {
  it("resolves effect, palette and parameter names through the catalog", () => {
    const { format, snapshot } = parseDocument(MINIMAL, CATALOG);
    expect(format).toBe("toml");
    expect(snapshot.layers).toHaveLength(1);
    expect(snapshot.layers[0]).toHaveLength(84);
    expect(snapshot.lighting?.effects).toEqual({
      effect: 1,
      palette: 0,
      value: 255,
      speed: 108,
    });
    expect(snapshot.lighting?.effect_params).toEqual([{ effect: 1, index: 0, value: 11 }]);
  });

  it("names an effect the connected keyboard does not advertise", () => {
    expect(() => parseDocument(MINIMAL, { effects: [], palettes: [], params: [] })).toThrow(
      /unknown extension effect 'Rain'/,
    );
  });

  it("rejects a document before anything could be written from it", () => {
    expect(() => parseDocument(MINIMAL.replace("KC_A", "KC_NOPE"), CATALOG)).toThrow(
      /KC_NOPE/,
    );
  });

  it("accepts the nested modifier objects emitted by the MoErgo editor", () => {
    const keys = Array.from({ length: 80 }, () => ({ value: "&trans" }));
    keys[0] = {
      value: "&kp",
      params: [{ value: "LS", params: [{ value: "N9" }] }],
    } as (typeof keys)[number];
    const text = JSON.stringify({
      keyboard: "glove80",
      layer_names: ["Base"],
      layers: [keys],
    });

    const { format, snapshot } = parseDocument(text, CATALOG);
    expect(format).toBe("moergo-json");
    expect(snapshot.layers).toHaveLength(1);
    expect(snapshot.layers[0][0]).toEqual({
      Single: {
        KeyWithModifier: [
          "Kc9",
          {
            left_ctrl: false,
            left_shift: true,
            left_alt: false,
            left_gui: false,
            right_ctrl: false,
            right_shift: false,
            right_alt: false,
            right_gui: false,
          },
        ],
      },
    });
  });
});

describe("snapshotFromState", () => {
  it("round-trips live state through a rendered document", () => {
    const parsed = parseDocument(MINIMAL, CATALOG);
    const lighting = parsed.snapshot.lighting!;
    // The workbench holds these values across several slots; only the ones a
    // document describes matter here.
    const state = {
      defaultLayer: parsed.snapshot.default_layer,
      layers: parsed.snapshot.layers,
      lightingState: {
        revision: 1,
        output_enabled: true,
        output_brightness: lighting.brightness,
        background: lighting.background,
        overlay_len: 0,
      },
      lightingOutputMode: { mode: lighting.output_mode, powered: true, wake_active: false, effective_enabled: true },
      scenePolicy: lighting.scene_policy,
      scenes: lighting.scenes,
      runtimeConditionalScenes: lighting.conditional_scenes ?? [],
      lightingExtension: { revision: 1, effect_count: 2, palette_count: 2, state: lighting.effects! },
      lightingExtensionLayers: { overlay: lighting.overlay },
    } as unknown as WorkbenchState;

    const text = renderDocument(snapshotFromState(state), CATALOG, "toml", MINIMAL);
    const again = parseDocument(text, CATALOG);
    expect(again.snapshot.layers).toEqual(parsed.snapshot.layers);
    expect(again.snapshot.lighting?.effects).toEqual(lighting.effects);
    expect(again.snapshot.lighting?.background).toEqual(lighting.background);
    // The user's own layer labels survive, because the document being replaced
    // is what supplies them — the firmware stores none.
    expect(text).toContain('id = "base"');
  });
});
