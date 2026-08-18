import { describe, expect, it } from "vitest";
import type { RuntimeSnapshot } from "../../config/document";
import type { KeyboardModel } from "../keyboard";
import type { KeyAction, LightingEffect } from "../../vendor/rynk-wasm/rynk_wasm";
import {
  GLOVE80_TRANSFER_MODEL,
  GO60_TRANSFER_MODEL,
  boardForTarget,
  transferSnapshot,
} from "./transfer";
import type { BoardTransferModel } from "./transfer";

const transparent = (size: number): KeyAction[] =>
  Array.from({ length: size }, () => "Transparent" as const);
const user = (id: number): KeyAction => ({ Single: { User: id } });
const solid: LightingEffect = { Solid: { color: { r: 1, g: 2, b: 3 } } };

function snapshot(layers: KeyAction[][]): RuntimeSnapshot {
  return {
    bluetooth_name: undefined,
    rows: layers[0].length === 70 ? 5 : 6,
    cols: 14,
    default_layer: 0,
    layers,
    lighting: undefined,
    behaviors: {
      config: undefined,
      options: undefined,
      morse_profiles: undefined,
      hold_trigger_positions: undefined,
      auto_mouse_layers: undefined,
      morses: undefined,
      combos: undefined,
      macros: undefined,
      forks: undefined,
    },
  };
}

function keyboardModel(board: BoardTransferModel): KeyboardModel {
  return {
    name: board.name,
    variantIndex: 0,
    bounds: { minX: 0, minY: 0, maxX: board.cols, maxY: board.rows },
    keys: [...board.physical].map(([address]) => {
      const [row, col] = address.split(",").map(Number);
      return {
        row,
        col,
        shape: {
          row,
          col,
          rect: { x: col, y: row, w: 1, h: 1 },
          r: 0,
          rect2: undefined,
          pivot: undefined,
        },
        ledId: board.ledAt.get(address),
        zoneIds: [],
      };
    }),
    encoders: [],
    pointingDevices: [],
    zones: [],
    topologyRevision: 1,
  };
}

describe("Glove80 and Go60 layout transfer", () => {
  it("does not treat an unrelated same-size keyboard as a Go60", () => {
    expect(() => boardForTarget("Other 60", 5, 14)).toThrow(/reports itself as Other 60/);
  });

  it("maps the Go60 finger rows, bottom row, and lower thumbs onto Glove80", () => {
    const source = transparent(70);
    source[0] = user(1);
    source[3 * 14 + 13] = user(2);
    source[4 * 14 + 2] = user(3);
    source[4 * 14 + 11] = user(4);
    source[6] = user(5);
    source[2 * 14 + 7] = user(6);

    const target = transparent(84);
    target[0] = user(90);
    const result = transferSnapshot(
      snapshot([source]),
      6,
      14,
      snapshot([target]),
      keyboardModel(GLOVE80_TRANSFER_MODEL),
    );

    expect(result.notes).toEqual([]);
    expect(result.snapshot.layers[0][1 * 14 + 0]).toEqual(user(1));
    expect(result.snapshot.layers[0][4 * 14 + 13]).toEqual(user(2));
    expect(result.snapshot.layers[0][5 * 14 + 2]).toEqual(user(3));
    expect(result.snapshot.layers[0][5 * 14 + 11]).toEqual(user(4));
    expect(result.snapshot.layers[0][3 * 14 + 6]).toEqual(user(5));
    expect(result.snapshot.layers[0][5 * 14 + 7]).toEqual(user(6));
    expect(result.snapshot.layers[0][0]).toEqual(user(90));
  });

  it("maps every Go60 physical binding in the reverse direction", () => {
    const source = transparent(84);
    for (const [address] of GLOVE80_TRANSFER_MODEL.physical) {
      const [row, col] = address.split(",").map(Number);
      source[row * 14 + col] = user(row * 14 + col);
    }
    const target = transparent(70);
    const result = transferSnapshot(
      snapshot([source]),
      5,
      14,
      snapshot([target]),
      keyboardModel(GO60_TRANSFER_MODEL),
    );

    for (const [address] of GO60_TRANSFER_MODEL.physical) {
      const [row, col] = address.split(",").map(Number);
      const gloveRow = col === 6 || col === 7 ? row + 3 : row === 4 ? 5 : row + 1;
      expect(result.snapshot.layers[0][row * 14 + col], address).toEqual(
        user(gloveRow * 14 + col),
      );
    }
    expect(result.notes).toHaveLength(20);
    expect(result.notes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          location: expect.stringContaining("Glove80 F1 [0, 0]"),
          message: expect.stringContaining("no corresponding key on Go60"),
        }),
        expect.objectContaining({ location: expect.stringContaining("[5, 13]") }),
      ]),
    );
  });

  it("reports only meaningful unmapped bindings and positional behavior entries", () => {
    const source = snapshot([transparent(84), transparent(84)]);
    source.layers[1][0] = user(12);
    source.behaviors!.hold_trigger_positions = [
      { profile: 0, row: 2, col: 1 },
      { profile: 0, row: 0, col: 1 },
    ];
    const result = transferSnapshot(
      source,
      5,
      14,
      snapshot([transparent(70), transparent(70)]),
      keyboardModel(GO60_TRANSFER_MODEL),
    );

    expect(result.snapshot.behaviors?.hold_trigger_positions).toEqual([
      { profile: 0, row: 1, col: 1 },
    ]);
    expect(result.notes).toHaveLength(2);
    expect(result.notes[0].location).toContain("layer 1");
    expect(result.notes[1].location).toContain("morse hold trigger");
  });

  it("moves per-key lighting and preserves target-only Glove80 lights", () => {
    const goLed = GO60_TRANSFER_MODEL.ledAt.get("0,1")!;
    const gloveLed = GLOVE80_TRANSFER_MODEL.ledAt.get("1,1")!;
    const targetOnlyLed = GLOVE80_TRANSFER_MODEL.ledAt.get("0,0")!;
    const source = snapshot([transparent(70)]);
    source.lighting = {
      brightness: 100,
      output_mode: "AlwaysOn",
      wake_layers: [],
      scene_policy: "EffectiveOnly",
      background: { enabled: false, hue: 0, saturation: 0, value: 0, speed: 0, mode: "Solid" },
      effects: undefined,
      overlay: undefined,
      effect_params: [],
      scenes: [{ layer: 0, led_id: goLed, effect: solid }],
      conditional_scenes: [],
    };
    const target = snapshot([transparent(84)]);
    target.lighting = {
      ...source.lighting,
      scenes: [{ layer: 0, led_id: targetOnlyLed, effect: solid }],
      conditional_scenes: [],
    };

    const result = transferSnapshot(
      source,
      6,
      14,
      target,
      keyboardModel(GLOVE80_TRANSFER_MODEL),
    );

    expect(result.snapshot.lighting?.scenes).toEqual([
      { layer: 0, led_id: targetOnlyLed, effect: solid },
      { layer: 0, led_id: gloveLed, effect: solid },
    ]);
  });
});
