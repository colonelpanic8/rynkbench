import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { initSync } from "../vendor/glove80-config-wasm/glove80_config_wasm";
import type { ExtensionCatalog } from "./document";
import { detectFormat, parseDocument, renderDocument, snapshotFromState } from "./document";
import type { WorkbenchState } from "../ui/state";
import type { Morse } from "../vendor/rynk-wasm/rynk_wasm";

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

/** A MoErgo document of `layerCount` transparent layers, plus whatever behavior
 *  tables the case under test needs. The importer's own correctness is covered
 *  against the real editor exports in glove80-config; what matters here is that
 *  the results cross the wasm ABI intact. */
const moergo = (extra: Record<string, unknown>, layerCount = 1) =>
  JSON.stringify({
    keyboard: "glove80",
    layer_names: Array.from({ length: layerCount }, (_, i) => `Layer ${i}`),
    layers: Array.from({ length: layerCount }, () =>
      Array.from({ length: 80 }, () => ({ value: "&trans" })),
    ),
    ...extra,
  });

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

  it("carries the behavior tables a keymap cell addresses by index", () => {
    // One bilateral home row mod: hold Gui, tap A, hold reachable only from the
    // opposite hand. It has to arrive as a morse, or the `TD(0)` cell that
    // indexes it would resolve through whatever the keyboard already held.
    const doc = JSON.parse(moergo({}));
    doc.holdTaps = [
      {
        name: "&hrm_ring",
        bindings: ["&kp", "&kp"],
        tappingTermMs: 240,
        flavor: "tap-preferred",
        quickTapMs: 300,
        holdTriggerOnRelease: true,
        holdTriggerKeyPositions: [40, 41, 42],
      },
    ];
    doc.layers[0][0] = {
      value: "&hrm_ring",
      params: [{ value: "LGUI" }, { value: "A" }],
    };

    const { snapshot } = parseDocument(JSON.stringify(doc), CATALOG);
    const morses = snapshot.behaviors?.morses;
    expect(morses).toHaveLength(1);
    expect(morses?.[0].profile.hold_timeout_ms).toBe(240);
    expect(morses?.[0].profile.unilateral_tap).toBe(true);
    // And the key resolves through the table rather than carrying the action.
    expect(snapshot.layers[0][0]).toEqual({ Morse: 0 });
  });

  it("reports what it imported but could not reproduce exactly", () => {
    // Per-layer pointer scaling has no Rynk equivalent — the mouse speed is one
    // global interval — so the import approximates it and has to say so.
    const text = moergo(
      {
        inputListeners: [
          {
            code: "&mmv_input_listener",
            nodes: [
              {
                code: "warp",
                layers: [1],
                inputProcessors: [{ code: "&zip_xy_scaler", params: [{ value: "12" }] }],
              },
            ],
          },
        ],
      },
      2,
    );

    const { notes } = parseDocument(text, CATALOG);
    expect(notes).toHaveLength(1);
    expect(notes[0].approximated).toBe(true);
    // The note names where it came from, which is what makes it actionable.
    // Some diagnostics carry that in `location` and some name it inline, so
    // assert on what a reader actually sees.
    const shown = [notes[0].location, notes[0].message].filter(Boolean).join(" ");
    expect(shown).toContain("layer 1");
    expect(shown).toMatch(/pointer|mouse/i);
  });

  it("names every binding it cannot import, not just the first", () => {
    const doc = JSON.parse(moergo({}));
    doc.layers[0][0] = { value: "&no_such_behavior" };
    doc.layers[0][1] = { value: "&also_missing" };

    // Reporting one at a time would send the reader back around the import loop
    // once per unportable key, and hide how much of the layout is portable.
    expect(() => parseDocument(JSON.stringify(doc), CATALOG)).toThrow(
      /2 bindings cannot be imported/,
    );
  });

  it("says nothing about the behavior tables when the document does not", () => {
    // A TOML file predating those sections must not read as "clear them".
    const { snapshot, notes } = parseDocument(MINIMAL, CATALOG);
    expect(snapshot.behaviors?.morses).toBeUndefined();
    expect(snapshot.behaviors?.combos).toBeUndefined();
    expect(snapshot.behaviors?.macros).toBeUndefined();
    expect(snapshot.behaviors?.forks).toBeUndefined();
    expect(notes).toEqual([]);
  });

  it("imports MoErgo mod-morphs as forks", () => {
    const doc = JSON.parse(
      moergo({
        modMorphs: [
          {
            name: "&parang_left",
            cases: [
              {
                binding: { value: "&kp", params: [{ value: "LS", params: [{ value: "N9" }] }] },
                mods: [],
                keepMods: [],
              },
              {
                binding: { value: "&kp", params: [{ value: "LS", params: [{ value: "COMMA" }] }] },
                mods: ["MOD_RSFT"],
                keepMods: [],
              },
            ],
          },
        ],
      }),
    );
    doc.layers[0][0] = { value: "&parang_left" };

    const { snapshot } = parseDocument(JSON.stringify(doc), CATALOG);
    expect(snapshot.behaviors?.forks).toHaveLength(1);
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

const LIVE_MORSE = [
  {
    profile: {
      unilateral_tap: true,
      enable_flow_tap: undefined,
      mode: "Normal" as const,
      hold_timeout_ms: 210,
      gap_timeout_ms: undefined,
      quick_tap_timeout_ms: undefined,
      retro_tap: undefined,
      prior_idle_time_ms: undefined,
      hold_trigger_on_release: undefined,
    },
    // A bilateral home row mod: tap A, hold Gui, on the ring finger's window.
    actions: [
      [0b10, { Key: { Hid: "A" as const } }],
      [
        0b11,
        {
          Modifier: {
            left_ctrl: false,
            left_shift: false,
            left_alt: false,
            left_gui: true,
            right_ctrl: false,
            right_shift: false,
            right_alt: false,
            right_gui: false,
          },
        },
      ],
    ] as Array<[number, unknown]>,
  },
] as unknown as Morse[];

describe("snapshotFromState", () => {
  it("round-trips live state through a rendered document", () => {
    const parsed = parseDocument(MINIMAL, CATALOG);
    const lighting = parsed.snapshot.lighting!;
    // The workbench holds these values across several slots; only the ones a
    // document describes matter here.
    const forkDocument = JSON.parse(
      moergo({
        modMorphs: [
          {
            name: "&parang_left",
            cases: [
              {
                binding: { value: "&kp", params: [{ value: "LS", params: [{ value: "N9" }] }] },
                mods: [],
                keepMods: [],
              },
              {
                binding: { value: "&kp", params: [{ value: "LS", params: [{ value: "COMMA" }] }] },
                mods: ["MOD_RSFT"],
                keepMods: [],
              },
            ],
          },
        ],
      }),
    );
    forkDocument.layers[0][0] = { value: "&parang_left" };
    const liveForks = parseDocument(JSON.stringify(forkDocument), CATALOG).snapshot.behaviors!.forks!;
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
      // The behavior tables a `TD(n)` cell resolves through. A document
      // describes these too, so an export that dropped them would make an
      // import a one-way door.
      morse: LIVE_MORSE,
      behavior: {
        combo_timeout_ms: 50,
        oneshot_timeout_ms: 1000,
        tap_interval_ms: 200,
        tap_capslock_interval_ms: 350,
      },
      behaviorOptions: {
        tri_layer: undefined,
        combo_prior_idle_ms: 90,
        oneshot_activate_on_keypress: false,
        oneshot_quick_release: true,
        morse_enable_flow_tap: true,
        morse_prior_idle_ms: 120,
        morse_default_profile: LIVE_MORSE[0].profile,
      },
      morseProfileCapacity: 16,
      morseProfiles: [{
        index: 0,
        name: "profile_000",
        profile: { ...LIVE_MORSE[0].profile, hold_timeout_ms: 175, prior_idle_time_ms: 110 },
      }],
      morseHoldTriggerPositionCapacity: 32,
      morseHoldTriggerPositions: [
        { profile: 255, row: 2, col: 8 },
        { profile: 0, row: 2, col: 1 },
      ],
      autoMouseLayers: [],
      combos: [],
      forks: liveForks,
      macroBytes: new Uint8Array(),
    } as unknown as WorkbenchState;

    const text = renderDocument(snapshotFromState(state), CATALOG, "toml", MINIMAL);
    const again = parseDocument(text, CATALOG);
    expect(again.snapshot.layers).toEqual(parsed.snapshot.layers);
    expect(again.snapshot.lighting?.effects).toEqual(lighting.effects);
    expect(again.snapshot.lighting?.background).toEqual(lighting.background);
    // The user's own layer labels survive, because the document being replaced
    // is what supplies them — the firmware stores none.
    expect(text).toContain('id = "base"');
    // The morse survives with its timing intact, which is the whole point of
    // rendering the table rather than only the keymap that indexes it.
    expect(again.snapshot.behaviors?.morses).toEqual(LIVE_MORSE);
    expect(again.snapshot.behaviors?.forks).toEqual(liveForks);
    expect(again.snapshot.behaviors?.morse_profiles).toEqual(
      state.morseProfiles.map((entry) => entry.profile),
    );
    expect(again.snapshot.behaviors?.hold_trigger_positions).toEqual(
      state.morseHoldTriggerPositions,
    );
    expect(again.snapshot.behaviors?.options).toEqual(state.behaviorOptions);
    expect(again.snapshot.behaviors?.config).toEqual(state.behavior);
    expect(text).toContain("[behavior.morse.profiles.profile_000]");
    expect(text).toContain("hold_trigger_key_positions");
    expect(text).toContain("[[fork]]");
  });
});
