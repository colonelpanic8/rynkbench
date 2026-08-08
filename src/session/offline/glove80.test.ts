import { describe, expect, it } from "vitest";
import type { RuntimeSnapshot } from "../../config/document";
import { offlineGlove80Board, openOfflineGlove80 } from "./glove80";

const layer = () => Array.from({ length: 6 * 14 }, () => "No" as const);

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
      default_layer: 1,
      layers: [layer(), layer()],
      lighting: {
        brightness: 177,
        output_mode: "AlwaysOn",
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
        morse_profiles: [],
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
    expect(board.seedHoldTriggerPositions).toEqual([{ profile: 255, row: 3, col: 8 }]);

    const session = openOfflineGlove80(snapshot);
    expect(session.kind).toBe("offline");
    expect(await session.macros.read()).toEqual(new Uint8Array([1, 2, 3, ...Array(509).fill(0)]));
    await session.close();
  });
});
