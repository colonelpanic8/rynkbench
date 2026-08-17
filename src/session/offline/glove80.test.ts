import { describe, expect, it } from "vitest";
import type { RuntimeSnapshot } from "../../config/document";
import { offlineGlove80Board, openOfflineGlove80 } from "./glove80";

const layer = () => Array.from({ length: 6 * 14 }, () => "No" as const);

const snapshotBehaviors = (): NonNullable<RuntimeSnapshot["behaviors"]> => ({
  config: undefined,
  options: undefined,
  morse_profiles: [],
  hold_trigger_positions: [],
  auto_mouse_layers: [],
  morses: [],
  combos: [],
  macros: [],
  forks: [],
});

describe("offline Glove80 workspace", () => {
  it("creates a clean six-layer document rather than the seeded demo", () => {
    const board = offlineGlove80Board();
    expect(board.defaultLayers).toHaveLength(6);
    expect(board.seedCombos).toEqual([]);
    expect(board.seedMorse).toEqual([]);
    expect(board.seedForks).toEqual([]);
    expect(board.seedMorseProfiles).toEqual([]);
    expect(board.seedHoldTriggerPositions).toEqual([]);
    expect(board.initialDefaultLayer).toBe(0);
  });

  it("seeds document state and exposes it through an offline session", async () => {
    const snapshot: RuntimeSnapshot = {
      rows: 6,
      cols: 14,
      default_layer: 1,
      layers: [layer(), layer()],
      lighting: {
        brightness: 177,
        output_mode: "AlwaysOn",
        wake_layers: [1],
        scene_policy: "ActiveStack",
        background: {
          enabled: false,
          hue: 0,
          saturation: 0,
          value: 0,
          speed: 128,
          mode: "Solid",
        },
        effects: { effect: 5, palette: 1, value: 200, speed: 90 },
        overlay: undefined,
        effect_params: [{ effect: 5, index: 0, value: 11 }],
        scenes: [],
        conditional_scenes: [],
      },
      behaviors: {
        config: undefined,
        options: undefined,
        morse_profiles: [
          {
            index: 23,
            name: "thumb_layer",
            profile: {
              enable_flow_tap: false,
              hold_timeout_ms: 200,
              gap_timeout_ms: 200,
              quick_tap_timeout_ms: 150,
              prior_idle_time_ms: 120,
              unilateral_tap: false,
              opposite_hand_hold: undefined,
              retro_tap: false,
              hold_trigger_on_release: false,
              mode: "PermissiveHold",
            },
          },
        ],
        hold_trigger_positions: [{ profile: 255, row: 3, col: 8 }],
        auto_mouse_layers: [],
        morses: [],
        combos: [],
        macros: [1, 2, 3],
        forks: [],
      },
    };

    const board = offlineGlove80Board(snapshot);
    expect(board.capabilities.num_layers).toBe(2);
    expect(board.initialDefaultLayer).toBe(1);
    expect(board.brightness).toBe(177);
    expect(board.initialLayerPolicy).toBe("ActiveStack");
    expect(board.lightingOutputMode?.wake_layers).toBe(2 ** 1);
    expect(board.morseProfileCount).toBe(24);
    expect(board.seedMorseProfiles).toEqual(snapshot.behaviors?.morse_profiles);
    expect(board.seedHoldTriggerPositions).toEqual([{ profile: 255, row: 3, col: 8 }]);

    const session = openOfflineGlove80(snapshot);
    expect(session.kind).toBe("offline");
    expect(await session.behavior.profiles()).toEqual({
      capacity: 24,
      total: 1,
      entries: snapshot.behaviors?.morse_profiles,
    });
    expect(await session.macros.read()).toEqual(new Uint8Array([1, 2, 3, ...Array(509).fill(0)]));
    expect(await session.lighting.outputMode()).toMatchObject({ wake_layers: 2 ** 1 });
    await session.close();
  });

  it("labels layers from the document rather than the board's stock names", async () => {
    const named: RuntimeSnapshot = {
      rows: 6,
      cols: 14,
      default_layer: 0,
      layers: [layer(), layer()],
      layer_names: [
        { occupied: true, name: "Alpha" },
        { occupied: true, name: "Symbols" },
      ],
      lighting: undefined,
      behaviors: snapshotBehaviors(),
    };
    expect(offlineGlove80Board(named).layerNames).toEqual(["Alpha", "Symbols"]);

    const session = openOfflineGlove80(named);
    expect(await session.keymap.getLayerMetadata(1)).toEqual({
      occupied: true,
      name: "Symbols",
    });
    await session.close();

    // A document that says nothing about names keeps the board's labels.
    expect(offlineGlove80Board({ ...named, layer_names: undefined }).layerNames).toEqual(
      offlineGlove80Board().layerNames?.slice(0, 2),
    );
  });
});
