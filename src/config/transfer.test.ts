import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { initSync } from "../vendor/moergo-config-wasm/moergo_config_wasm";
import { importDocument } from "./transfer";
import { RUNTIME_EFFECTS_CONDITIONS } from "../session/lighting-features";
import type { ExtensionCatalog } from "./document";
import { renderDocument, snapshotFromState } from "./document";
import { offlineGlove80Catalog, openOfflineGlove80 } from "../session/offline/glove80";
import { openBundle } from "../ui/bundle";
import { initialWorkbenchState } from "../ui/state";
import type { RynkSession, LayerMetadata } from "../session/types";
import type { ConnectedBundle, WorkbenchAction, WorkbenchState } from "../ui/state";
import type { PointingConfig } from "../vendor/rynk-wasm/rynk_wasm";

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
    info: { product_name: "Glove80", vendor_id: 0x16c0, product_id: 0x27db },
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
    lightingControls: { output_toggle_user_action: undefined, wake_layers: 0 },
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

describe("importDocument pointing configuration", () => {
  function pointingHarness(supported: boolean) {
    const actions: WorkbenchAction[] = [];
    const writes: PointingConfig[] = [];
    const current: PointingConfig | null = supported
      ? {
          revision: 5,
          device_count: 0,
          devices: [],
          override_count: 0,
          overrides: [],
        }
      : null;
    let accepted: PointingConfig | null = current;
    const session = {
      keymap: {
        setKey: async () => {},
        setDefaultLayer: async () => {},
        setLayerMetadata: async () => {},
      },
      pointing: {
        set: async (config: PointingConfig) => {
          writes.push(structuredClone(config));
          accepted = { ...structuredClone(config), revision: config.revision + 1 };
          return structuredClone(accepted);
        },
        get: async () => {
          if (!supported) throw new Error("UnknownCmd");
          return structuredClone(accepted!);
        },
      },
    } as unknown as RynkSession;
    const bundle = {
      info: { product_name: "Go60", vendor_id: 0x16c0, product_id: 0x27db },
      caps: {
        num_rows: 5,
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
        Array.from({ length: 5 * 14 }, () => "Transparent"),
      ),
      layerMetadata: null,
      pointingConfig: current,
      pointingDraft: current,
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
      lightingControls: { output_toggle_user_action: undefined, wake_layers: 0 },
    } as unknown as WorkbenchState;
    return {
      actions,
      writes,
      session,
      bundle,
      state,
      dispatch: (action: WorkbenchAction) => actions.push(action),
    };
  }

  it("writes a complete fixed-capacity config at the live revision and adopts readback", async () => {
    const h = pointingHarness(true);
    const result = await importDocument({ ...h, text: pointingDocument, catalog: CATALOG });

    expect(h.writes).toHaveLength(1);
    expect(h.writes[0]).toMatchObject({ revision: 5, device_count: 1, override_count: 1 });
    expect(h.writes[0].devices).toHaveLength(4);
    expect(h.writes[0].overrides).toHaveLength(16);
    expect(h.actions).toContainEqual(
      expect.objectContaining({
        type: "pointingWriteOk",
        config: expect.objectContaining({ revision: 6 }),
      }),
    );
    expect(result.applied).toContain("pointing configuration");
  });

  it("reports pointing data when the target firmware does not support it", async () => {
    const h = pointingHarness(false);
    const result = await importDocument({ ...h, text: pointingDocument, catalog: CATALOG });

    expect(h.writes).toEqual([]);
    expect(result.skipped).toContain("pointing configuration (unsupported by this keyboard)");
  });

  it("re-reads before skipping, so a failed connect-time read does not block the import", async () => {
    const h = pointingHarness(true);
    const state = { ...h.state, pointingConfig: null, pointingDraft: null } as WorkbenchState;
    const result = await importDocument({ ...h, state, text: pointingDocument, catalog: CATALOG });

    expect(h.writes).toHaveLength(1);
    expect(h.writes[0]).toMatchObject({ revision: 5 });
    expect(result.applied).toContain("pointing configuration");
  });
});


describe("importDocument conditional rules", () => {
  it("preserves document rules for the session and skips an unchanged reimport", async () => {
    const session = openOfflineGlove80();
    try {
      const bundle = await openBundle(session);
      const state = initialWorkbenchState(bundle);
      const snapshot = snapshotFromState(state);
      const rule = {
        cell: {
          led_id: 0,
          effect: { Solid: { color: { r: 255, g: 0, b: 0 } } },
          conditions: { layer: { layer: 0, active: true }, battery: undefined, output_mode: undefined },
        },
        connection: undefined,
        effects: { enabled: true },
          layers: undefined,
          indicators: undefined,
      };
      snapshot.lighting!.conditional_scenes = [rule];
      const catalog = offlineGlove80Catalog();
      const text = renderDocument(snapshot, catalog, "toml");
      const replace = vi.spyOn(session.lighting.conditionalScenes, "replace");
      const dispatch = vi.fn();
      await importDocument({ text, session, bundle, state, dispatch, catalog });
      expect(replace).toHaveBeenCalledExactlyOnceWith([
        { ...rule, layers: undefined, indicators: undefined },
      ]);
      replace.mockClear();
      const updated = await openBundle(session);
      await importDocument({
        text, session, bundle: updated, state: initialWorkbenchState(updated), dispatch, catalog,
      });
      expect(replace).not.toHaveBeenCalled();
    } finally {
      await session.close();
    }
  });
});

describe("importDocument lighting preflight", () => {
  it.each(["capacity", "unsupported", "predicates", "scenes", "layer predicates", "malformed"] as const)(
    "rejects %s before writing earlier keymap or metadata changes",
    async (failure) => {
      const session = openOfflineGlove80();
      try {
        const bundle = await openBundle(session);
        const state = initialWorkbenchState(bundle);
        const snapshot = structuredClone(snapshotFromState(state));
        snapshot.layers[0][0] = { Single: { Key: { Hid: "A" } } };
        snapshot.layer_names![0].name = "Changed";
        snapshot.lighting!.conditional_scenes = [{
          cell: {
            led_id: 0,
            effect: { Solid: { color: { r: 255, g: 0, b: 0 } } },
            conditions: { layer: undefined, battery: undefined, output_mode: undefined },
          },
          connection: undefined,
          effects: { enabled: true },
          layers: undefined,
          indicators: undefined,
        }];
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
          snapshot.lighting!.conditional_scenes![0].layers = { active: 2, inactive: 4 };
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
        const before = await openBundle(session);
        const dispatch = vi.fn();
        await expect(importDocument({ text, session, bundle, state, dispatch, catalog }))
          .rejects.toThrow(message);
        expect(dispatch).not.toHaveBeenCalled();
        const after = await openBundle(session);
        expect(after.layers).toEqual(before.layers);
        expect(after.layerMetadata).toEqual(before.layerMetadata);
        expect(after.lightingState).toEqual(before.lightingState);
        expect(after.runtimeConditionalScenes).toEqual(before.runtimeConditionalScenes);
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
    snapshot.lighting!.conditional_scenes = [{
      cell: {
        led_id: 0,
        effect: { Solid: { color: { r: 255, g: 0, b: 255 } } },
        conditions: { layer: undefined, battery: undefined, output_mode: undefined },
      },
      connection: undefined,
      effects: undefined,
      layers: { active: 2, inactive: 4 },
      indicators: undefined,
    }];
    const catalog = offlineGlove80Catalog();
    const text = renderDocument(snapshot, catalog, "toml");
    const { parseDocument } = await import("./document");
    expect(parseDocument(text, catalog).snapshot.lighting!.conditional_scenes)
      .toEqual(snapshot.lighting!.conditional_scenes);
    const invalid = structuredClone(snapshot);
    invalid.lighting!.conditional_scenes![0].layers!.inactive = 2;
    expect(() => renderDocument(invalid, catalog, "toml")).toThrow(/active and inactive/);
    await importDocument({
      text, session, bundle, state: initialWorkbenchState(bundle), dispatch: vi.fn(), catalog,
    });
    expect((await openBundle(session)).runtimeConditionalScenes)
      .toEqual(snapshot.lighting!.conditional_scenes);
  } finally {
    await session.close();
  }
});
