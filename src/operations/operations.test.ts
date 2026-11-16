import { describe, expect, it } from "vitest";
import type { BehaviorOptions, KeyAction, MorseProfile } from "../vendor/rynk-wasm/rynk_wasm";
import type { KeyboardImage } from "../sync/image";
import { catalog, guardInputOf, OPERATIONS, runOperation, type OperationFacts } from ".";

const key = (code: string): KeyAction => ({ Single: { Key: { Hid: code } } }) as KeyAction;
const mo = (layer: number): KeyAction => ({ Single: { LayerOn: layer } }) as KeyAction;
const behavior = {
  tri_layer: undefined,
  combo_prior_idle_ms: undefined,
  oneshot_activate_on_keypress: false,
  oneshot_quick_release: false,
  morse_enable_flow_tap: false,
  morse_prior_idle_ms: 0,
  morse_default_profile: {} as MorseProfile,
} as BehaviorOptions;

/** Two columns, three used layers of four. */
function image(): KeyboardImage {
  return {
    metadata: [
      { occupied: true, name: "Base" },
      { occupied: true, name: "Nav" },
      { occupied: true, name: "Sym" },
      { occupied: false, name: "" },
    ],
    layers: [[mo(1), key("A")], [key("B"), "No"], [key("C"), "No"], ["No", "No"]],
    encoders: [[], [], [], []],
    defaultLayer: 0,
    combos: [],
    morse: [],
    forks: [],
    behaviorOptions: behavior,
    autoMouseLayers: [],
    scenes: [{ layer: 1, led_id: 0, effect: { Solid: { color: { r: 1, g: 2, b: 3 } } } }],
    runtimeConditionalScenes: [],
    wakeLayers: 0,
    pointing: null,
  };
}

const facts: OperationFacts = {
  cols: 2,
  sceneCapacity: 8,
  ruleCapacity: 4,
  activeLayers: [],
  compiledScenes: [],
  compiledRules: [],
  ledNodes: {},
};

const run = (name: Parameters<typeof runOperation>[0], input: unknown, on = image(), with_ = facts) =>
  runOperation(name, on, input as never, with_);

describe("the catalog", () => {
  it("lists every operation by name, with a description and its input fields, as plain data", () => {
    const listed = catalog();
    expect(listed.map((entry) => entry.name)).toEqual(Object.keys(OPERATIONS));
    for (const entry of listed) {
      expect(entry.description).toMatch(/\.$/);
      expect(entry.inputs.length).toBeGreaterThan(0);
      expect(JSON.parse(JSON.stringify(entry))).toEqual(entry);
    }
  });

  it("checks the input before running, with a plain message", () => {
    expect(run("move_layer", { layer: 1 })).toEqual({ ok: false, message: "move_layer: to is missing" });
    expect(run("move_layer", { layer: -1, to: 2 })).toEqual({ ok: false, message: "move_layer: layer must be an integer from 0" });
    expect(run("apply_transform", { transform: "rot13" })).toMatchObject({ message: expect.stringMatching(/one of ctrl-gui-swap, alpha-layout/) });
    expect(run("set_key_light", { layer: 0, leds: [1, "x"], light: { kind: "off" } })).toMatchObject({ message: expect.stringContaining("leds[1]") });
    expect(run("nothing" as never, {})).toEqual({ ok: false, message: "There is no operation called nothing" });
  });

  it("leaves the image it was given alone", () => {
    const before = image();
    const copy = structuredClone(before);
    run("swap_keys", { a: { layer: 0, row: 0, col: 0 }, b: { layer: 2, row: 0, col: 0 } }, before);
    run("move_layer", { layer: 1, to: 2 }, before);
    expect(before).toEqual(copy);
  });
});

describe("keys", () => {
  it("sets several keys at once, and refuses a key that does not exist", () => {
    const result = run("set_keys", { keys: [{ layer: 1, row: 0, col: 1, action: key("X") }, { layer: 2, row: 0, col: 0, action: "No" }] });
    expect(result).toMatchObject({ ok: true, image: { layers: [image().layers[0], [key("B"), key("X")], ["No", "No"], ["No", "No"]] } });
    expect(run("set_keys", { keys: [{ layer: 0, row: 0, col: 2, action: "No" }] })).toEqual({ ok: false, message: "There is no key at row 0, column 2" });
    expect(run("set_keys", { keys: [{ layer: 9, row: 0, col: 0, action: "No" }] })).toEqual({ ok: false, message: "Layer 9 does not exist" });
  });

  it("swaps two keys, across layers too", () => {
    const result = run("swap_keys", { a: { layer: 0, row: 0, col: 1 }, b: { layer: 2, row: 0, col: 0 } });
    expect(result.ok && result.image.layers[0][1]).toEqual(key("C"));
    expect(result.ok && result.image.layers[2][0]).toEqual(key("A"));
  });
});

describe("layers", () => {
  it("moves a layer: the references follow, and the order says where each went", () => {
    const result = run("move_layer", { layer: 1, to: 2 });
    if (!result.ok) throw new Error(result.message);
    expect(result.image.metadata.slice(0, 3).map((slot) => slot.name)).toEqual(["Base", "Sym", "Nav"]);
    expect(result.image.layers[0][0]).toEqual(mo(2));
    expect(result.image.scenes).toEqual([{ ...image().scenes[0], layer: 2 }]);
    expect(result.layerOrder).toEqual([0, 2, 1]);
  });

  it("will not delete a layer something still lights or names, and will not move an active one", () => {
    expect(run("delete_layer", { layer: 1 })).toMatchObject({ ok: false });
    expect(run("move_layer", { layer: 1, to: 2 }, image(), { ...facts, activeLayers: [1] })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/active layer/),
    });
  });

  it("duplicates a layer under a free name", () => {
    const result = run("duplicate_layer", { layer: 2 });
    expect(result.ok && result.image.metadata[3]).toEqual({ occupied: true, name: "Sym copy" });
    expect(result.ok && result.image.layers[3]).toEqual(image().layers[2]);
  });

  it("needs layer names on the keyboard", () => {
    expect(run("move_layer", { layer: 1, to: 2 }, { ...image(), metadata: [] })).toEqual({
      ok: false,
      message: "this firmware does not support persistent layer metadata",
    });
  });
});

describe("lighting", () => {
  it("gives keys a colour on a layer, replacing their cells there", () => {
    const red = { r: 255, g: 0, b: 0 };
    const result = run("set_key_light", { layer: 1, leds: [0, 1], light: { kind: "color", color: red, effect: "Solid", timing: {} } });
    if (!result.ok) throw new Error(result.message);
    expect(result.image.scenes.map((cell) => [cell.layer, cell.led_id])).toEqual([[1, 0], [1, 1]]);
    expect(result.image.runtimeConditionalScenes).toEqual([]);
  });

  it("shows the layer below by removing the cells, and checks the keyboard has room", () => {
    const below = run("set_key_light", { layer: 1, leds: [0], light: { kind: "below" } });
    expect(below.ok && below.image.scenes).toEqual([]);
    const full = run("set_key_light", { layer: 0, leds: [0, 1], light: { kind: "off" } }, image(), { ...facts, sceneCapacity: 2 });
    expect(full).toEqual({ ok: false, message: "This layout needs 3 scene cells; the keyboard holds 2." });
  });

  it("puts a status light in the rules", () => {
    const result = run("set_key_light", { layer: 1, leds: [0], light: { kind: "usb" } });
    if (!result.ok) throw new Error(result.message);
    expect(result.image.scenes).toEqual([]);
    expect(result.image.runtimeConditionalScenes.length).toBeGreaterThan(0);
  });
});

describe("transforms", () => {
  it("swaps Ctrl and GUI everywhere", () => {
    const ctrl = { Single: { Key: { Hid: "LCtrl" } } } as KeyAction;
    const result = run("apply_transform", { transform: "ctrl-gui-swap" }, { ...image(), layers: [[ctrl, "No"], ["No", "No"], ["No", "No"], ["No", "No"]] });
    expect(result.ok && result.image.layers[0][0]).toEqual({ Single: { Key: { Hid: "LGui" } } });
  });

  it("asks for the layouts and migrations of an alpha switch", () => {
    expect(run("apply_transform", { transform: "alpha-layout", from: "qwerty" })).toMatchObject({ ok: false });
    const result = run("apply_transform", { transform: "alpha-layout", from: "qwerty", to: "colemak", migrations: ["alphas", "positional", "positional", "positional"] }, {
      ...image(),
      layers: [[key("E"), key("A")], ["No", "No"], ["No", "No"], ["No", "No"]],
    });
    expect(result.ok && result.image.layers[0]).toEqual([key("F"), key("A")]);
  });
});

describe("Guard's view of an image", () => {
  it("is the layout judgeChange takes", () => {
    const input = guardInputOf({ ...image(), morseProfiles: [null, { index: 1 } as never] }, 2);
    expect(input).toEqual({
      defaultLayer: 0,
      source: { layers: image().layers, cols: 2, combos: [], morse: [], forks: [], macroCount: 0, profileSlots: [1] },
    });
  });
});
