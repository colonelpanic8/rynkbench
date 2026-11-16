import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { initSync } from "../vendor/moergo-config-wasm/moergo_config_wasm";
import { readImport } from "./transfer";
import { RUNTIME_EFFECTS_CONDITIONS } from "../session/lighting-features";
import type { ExtensionCatalog } from "./document";
import { renderDocument, snapshotFromState } from "./document";
import { offlineGlove80Catalog, openOfflineGlove80 } from "../session/offline/glove80";
import { openBundle } from "../ui/bundle";
import { initialWorkbenchState } from "../workbench/initial-state";
import { wantOf } from "../workbench/draft/want";
import type { LayerMetadata } from "../session/types";
import type { ConnectedBundle, WorkbenchState } from "../model/workbench-state";
import type { KeyboardImage } from "../sync/image";
import type { PointingConfig } from "../vendor/rynk-wasm/rynk_wasm";
import { initSync as initRynkSync } from "../vendor/rynk-wasm/rynk_wasm";
import { ruleFromWire, ruleToWire } from "../session/lighting-rules";

beforeAll(() => {
  initSync({
    module: readFileSync("src/vendor/moergo-config-wasm/moergo_config_wasm_bg.wasm"),
  });
  initRynkSync({ module: readFileSync("src/vendor/rynk-wasm/rynk_wasm_bg.wasm") });
});

const CATALOG: ExtensionCatalog = { effects: [], palettes: [], params: [] };

const CAPACITY = 16;

/** A Glove80 MoErgo backup: all-transparent layers named by `names`. */
const moergoDocument = (names: string[]) =>
  JSON.stringify({
    keyboard: "glove80",
    layer_names: names,
    layers: names.map(() => Array.from({ length: 80 }, () => ({ value: "&trans" }))),
  });

const pointingDocument = `rows = 5
default_layer = 0

[[layer]]
id = "base"
name = "Base"
keys = """
_______ _______ _______ _______ _______ _______ _______ _______ _______ _______ _______ _______ _______ _______
_______ _______ _______ _______ _______ _______ _______ _______ _______ _______ _______ _______ _______ _______
_______ _______ _______ _______ _______ _______ _______ _______ _______ _______ _______ _______ _______ _______
_______ _______ _______ _______ _______ _______ -- -- _______ _______ _______ _______ _______ _______
-- -- _______ _______ _______ -- -- -- -- _______ _______ _______ -- --
"""

[pointing]

[[pointing.device]]
device_id = 2
mode = "cursor"

[[pointing.override]]
layer = 0
device_id = 2
mode = "press"
holds = 1
`;

/** What you want on a keyboard with these layers, names and pointing configuration. */
function wanted(layers: unknown[][], metadata: LayerMetadata[] | null, pointing: PointingConfig | null = null): KeyboardImage {
  return {
    metadata: metadata ?? [],
    layers: layers as KeyboardImage["layers"],
    encoders: [],
    defaultLayer: 0,
    combos: [],
    morse: [],
    forks: [],
    macroOps: [],
    behaviorOptions: null,
    autoMouseLayers: [],
    scenes: [],
    runtimeConditionalScenes: [],
    wakeLayers: 0,
    pointing,
  };
}

/** The slice of a connected workbench the importer reads. */
function harness(rows: number, product: string, layerMetadata: LayerMetadata[] | null, pointing: PointingConfig | null = null) {
  const bundle = {
    info: { product_name: product, vendor_id: 0x16c0, product_id: 0x27db },
    caps: {
      num_rows: rows,
      num_cols: 14,
      num_layers: CAPACITY,
      macro_space_size: 512,
      max_macros: 32,
      max_morse: 32,
      max_combos: 32,
      max_forks: 32,
    },
  } as unknown as ConnectedBundle;
  const layers = Array.from({ length: CAPACITY }, () => Array.from({ length: rows * 14 }, () => "Transparent"));
  const state = {
    defaultLayer: 0,
    layers,
    layerMetadata,
    pointingConfig: pointing,
    pointingDraft: pointing,
    behavior: null,
    behaviorOptions: null,
    morseProfileCapacity: 0,
    morseProfiles: [],
    morseHoldTriggerPositionCapacity: null,
    morseHoldTriggerPositions: [],
    autoMouseLayerCapacity: 0,
    autoMouseLayers: [],
    macroOps: [],
    morse: [],
    combos: [],
    forks: [],
    lightingState: null,
    lightingOutputMode: null,
    lightingControls: { output_toggle_user_action: undefined, wake_layers: 0 },
  } as unknown as WorkbenchState;
  return { bundle, state, want: wanted(layers, layerMetadata, pointing) };
}

/** Cells that differ between two images' layers. */
const differingCells = (a: KeyboardImage, b: KeyboardImage) =>
  a.layers.reduce((sum, cells, layer) => sum + cells.filter((cell, offset) => JSON.stringify(cell) !== JSON.stringify(b.layers[layer][offset])).length, 0);

describe("an import over what you want: layer names", () => {
  it("occupies and labels the slots the document configures", () => {
    const metadata = Array.from({ length: CAPACITY }, (_, layer): LayerMetadata =>
      layer === 0 ? { occupied: true, name: "Base" } : { occupied: false, name: "" },
    );
    const { bundle, state, want } = harness(6, "Glove80", metadata);

    const result = readImport({ text: moergoDocument(["Base", "Symbols"]), bundle, state, catalog: CATALOG }).onto(state, want);

    // Slot 0 already matches; only slot 1 is newly occupied.
    expect(result.image.metadata[1]).toEqual({ occupied: true, name: "Symbols" });
    expect(result.image.metadata.filter((entry, layer) => entry !== metadata[layer])).toHaveLength(1);
    expect(result.applied).toContain("1 layer name");
    expect(result.skipped).toEqual([]);
    expect(result.changedKeys).toBe(differingCells(want, result.image));
  });

  it("reports rather than sets names on firmware without metadata", () => {
    const { bundle, state, want } = harness(6, "Glove80", null);

    const result = readImport({ text: moergoDocument(["Base"]), bundle, state, catalog: CATALOG }).onto(state, want);

    expect(result.image.metadata).toEqual([]);
    expect(result.skipped).toEqual([
      "layer names (this keyboard does not store layer metadata)",
    ]);
  });
});

describe("an import over what you want: pointing configuration", () => {
  const current: PointingConfig = { revision: 5, device_count: 0, devices: [], override_count: 0, overrides: [] };

  it("wants a complete fixed-capacity config at the keyboard's revision", () => {
    const { bundle, state, want } = harness(5, "Go60", null, current);
    const result = readImport({ text: pointingDocument, bundle, state, catalog: CATALOG }).onto(state, want);

    expect(result.image.pointing).toMatchObject({ revision: 5, device_count: 1, override_count: 1 });
    expect(result.image.pointing!.devices).toHaveLength(4);
    expect(result.image.pointing!.overrides).toHaveLength(16);
    expect(result.applied).toContain("pointing configuration");
  });

  it("reports pointing data the keyboard holds none of, with the reason it could not be read", () => {
    const { bundle, state, want } = harness(5, "Go60", null);
    const file = readImport({ text: pointingDocument, bundle, state, catalog: CATALOG });
    expect(file.reads.pointing).toBe(true);

    expect(file.onto(state, want).skipped).toContain("pointing configuration (unsupported by this keyboard)");
    const unread = file.onto(state, want, "timed out");
    expect(unread.skipped).toContain("pointing configuration (timed out)");
    expect(unread.image.pointing).toBeNull();
  });
});

describe("reading an import: lighting preflight", () => {
  it.each(["capacity", "unsupported", "predicates", "scenes", "layer predicates", "malformed"] as const)(
    "rejects %s before anything changes",
    async (failure) => {
      const session = openOfflineGlove80();
      try {
        const bundle = await openBundle(session);
        const state = initialWorkbenchState(bundle);
        const snapshot = structuredClone(snapshotFromState(state));
        snapshot.layers[0][0] = { Single: { Key: { Hid: "A" } } };
        snapshot.layer_names![0].name = "Changed";
        snapshot.lighting!.conditional_scenes = [ruleToWire({
          cell: {
            led_id: 0,
            effect: { Solid: { color: { r: 255, g: 0, b: 0 } } },
            conditions: { layer: undefined, battery: undefined, output_mode: undefined },
          },
          connection: undefined,
          effects: { enabled: true },
          layers: undefined,
          indicators: undefined,
        })];
        const catalog = offlineGlove80Catalog();
        let text = renderDocument(snapshot, catalog, "toml");
        let message = /No settings were written/;
        if (failure === "capacity") {
          bundle.runtimeConditionalStatus = { ...bundle.runtimeConditionalStatus!, capacity: 0 };
        } else if (failure === "unsupported") {
          bundle.runtimeConditionalStatus = null;
        } else if (failure === "predicates") {
          bundle.lightingCaps = { ...bundle.lightingCaps!, features: 0 };
        } else if (failure === "layer predicates") {
          const rule = ruleFromWire(snapshot.lighting!.conditional_scenes![0]);
          rule.layers = { active: 2, inactive: 4 };
          snapshot.lighting!.conditional_scenes![0] = ruleToWire(rule);
          text = renderDocument(snapshot, catalog, "toml");
          bundle.lightingCaps = { ...bundle.lightingCaps!, features: RUNTIME_EFFECTS_CONDITIONS };
        } else if (failure === "scenes") {
          snapshot.lighting!.scenes.push({
            layer: 0, led_id: 0, effect: { Solid: { color: { r: 255, g: 0, b: 0 } } },
          });
          text = renderDocument(snapshot, catalog, "toml");
          bundle.sceneStatus = { ...bundle.sceneStatus!, capacity: 0 };
        } else {
          text += "\n[lighting.invalid\n";
          message = /./;
        }
        expect(() => readImport({ text, bundle, state, catalog })).toThrow(message);
      } finally {
        await session.close();
      }
    },
  );
});

it("round-trips layer conditions through the browser configuration codec", async () => {
  const session = openOfflineGlove80();
  try {
    const bundle = await openBundle(session);
    const snapshot = structuredClone(snapshotFromState(initialWorkbenchState(bundle)));
    snapshot.lighting!.conditional_scenes = [ruleToWire({
      cell: {
        led_id: 0,
        effect: { Solid: { color: { r: 255, g: 0, b: 255 } } },
        conditions: { layer: undefined, battery: undefined, output_mode: undefined },
      },
      connection: undefined,
      effects: undefined,
      layers: { active: 2, inactive: 4 },
      indicators: undefined,
    })];
    const catalog = offlineGlove80Catalog();
    const text = renderDocument(snapshot, catalog, "toml");
    const { parseDocument } = await import("./document");
    expect(parseDocument(text, catalog).snapshot.lighting!.conditional_scenes)
      .toEqual(snapshot.lighting!.conditional_scenes);
    const invalid = structuredClone(snapshot);
    const invalidRule = ruleFromWire(invalid.lighting!.conditional_scenes![0]);
    invalidRule.layers!.inactive = 2;
    invalid.lighting!.conditional_scenes![0] = ruleToWire(invalidRule);
    expect(() => renderDocument(invalid, catalog, "toml")).toThrow(/InvalidRequest/);
    const state = initialWorkbenchState(bundle);
    const { image } = readImport({ text, bundle, state, catalog }).onto(state, wantOf(state));
    expect(image.runtimeConditionalScenes).toEqual(snapshot.lighting!.conditional_scenes.map(ruleFromWire));
  } finally {
    await session.close();
  }
});
