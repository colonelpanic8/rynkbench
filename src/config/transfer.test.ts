import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { initSync } from "../vendor/moergo-config-wasm/moergo_config_wasm";
import { importDocument } from "./transfer";
import type { ExtensionCatalog } from "./document";
import type { RynkSession, LayerMetadata } from "../session/types";
import type { ConnectedBundle, WorkbenchAction, WorkbenchState } from "../ui/state";

beforeAll(() => {
  initSync({
    module: readFileSync("src/vendor/moergo-config-wasm/moergo_config_wasm_bg.wasm"),
  });
});

const CATALOG: ExtensionCatalog = { effects: [], palettes: [], params: [] };

const CAPACITY = 16;
const KEYS = 6 * 14;

/** A Glove80 MoErgo backup: all-transparent layers named by `names`. */
const moergoDocument = (names: string[]) =>
  JSON.stringify({
    keyboard: "glove80",
    layer_names: names,
    layers: names.map(() => Array.from({ length: 80 }, () => ({ value: "&trans" }))),
  });

interface Recorded {
  metadataWrites: [number, LayerMetadata][];
  keyWrites: number;
  actions: WorkbenchAction[];
}

/** The slice of a connected workbench the importer touches, with a device that
 *  records what reaches it. The keymap already matches the document, so layer
 *  metadata is the only difference left to write. */
function harness(layerMetadata: LayerMetadata[] | null) {
  const recorded: Recorded = { metadataWrites: [], keyWrites: 0, actions: [] };
  const session = {
    keymap: {
      setKey: async () => {
        recorded.keyWrites += 1;
      },
      setDefaultLayer: async () => {},
      setLayerMetadata: async (layer: number, metadata: LayerMetadata) => {
        recorded.metadataWrites.push([layer, structuredClone(metadata)]);
      },
    },
  } as unknown as RynkSession;
  const bundle = {
    info: { product_name: "MoErgo Glove80" },
    caps: {
      num_rows: 6,
      num_cols: 14,
      num_layers: CAPACITY,
      macro_space_size: 512,
      max_morse: 32,
      max_combos: 32,
      max_forks: 32,
    },
  } as unknown as ConnectedBundle;
  const state = {
    defaultLayer: 0,
    layers: Array.from({ length: CAPACITY }, () =>
      Array.from({ length: KEYS }, () => "Transparent"),
    ),
    layerMetadata,
    behavior: null,
    behaviorOptions: null,
    morseProfileCapacity: 0,
    morseProfiles: [],
    morseHoldTriggerPositionCapacity: null,
    morseHoldTriggerPositions: [],
    autoMouseLayerCapacity: 0,
    autoMouseLayers: [],
    macroBytes: new Uint8Array(),
    morse: [],
    combos: [],
    forks: [],
    lightingState: null,
  } as unknown as WorkbenchState;
  const dispatch = (action: WorkbenchAction) => {
    recorded.actions.push(action);
  };
  return { recorded, session, bundle, state, dispatch };
}

describe("importDocument layer names", () => {
  it("occupies and labels the slots the document configures", async () => {
    const metadata = Array.from({ length: CAPACITY }, (_, layer): LayerMetadata =>
      layer === 0 ? { occupied: true, name: "Base" } : { occupied: false, name: "" },
    );
    const { recorded, session, bundle, state, dispatch } = harness(metadata);

    const result = await importDocument({
      text: moergoDocument(["Base", "Symbols"]),
      session,
      bundle,
      state,
      dispatch,
      catalog: CATALOG,
    });

    // Slot 0 already matches; only slot 1 is newly occupied.
    expect(recorded.metadataWrites).toEqual([[1, { occupied: true, name: "Symbols" }]]);
    expect(recorded.actions).toContainEqual({
      type: "layerMetadataSet",
      layer: 1,
      metadata: { occupied: true, name: "Symbols" },
    });
    expect(result.applied).toContain("1 layer name");
    expect(result.skipped).toEqual([]);
  });

  it("reports rather than writes names on firmware without metadata", async () => {
    const { recorded, session, bundle, state, dispatch } = harness(null);

    const result = await importDocument({
      text: moergoDocument(["Base"]),
      session,
      bundle,
      state,
      dispatch,
      catalog: CATALOG,
    });

    expect(recorded.metadataWrites).toEqual([]);
    expect(result.skipped).toEqual([
      "layer names (this keyboard does not store layer metadata)",
    ]);
  });
});
