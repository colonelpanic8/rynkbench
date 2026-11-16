import { describe, expect, it } from "vitest";
import type { KeyAction, ModifierCombination } from "../../model/action-types";
import { faceLayout } from "../canvas/legend";
import { actionFace, keyFace, specialKind, type FaceContext } from "./keyFace";
import { KEY_ICON_DATA, type KeyIconName } from "./keyIconData";
import { chordLook, chordText } from "./modifiers";

const NONE: ModifierCombination = {
  left_ctrl: false, left_shift: false, left_alt: false, left_gui: false,
  right_ctrl: false, right_shift: false, right_alt: false, right_gui: false,
} as ModifierCombination;
const mods = (...held: string[]) => ({ ...NONE, ...Object.fromEntries(held.map((m) => [m, true])) }) as ModifierCombination;
const mac: FaceContext = { os: "mac", bleProfiles: 4, userIcons: new Map<number, KeyIconName>([[10, "bt-clr"]]) };
const win: FaceContext = { ...mac, os: "win" };
const hid = (code: string): KeyAction => ({ Single: { Key: { Hid: code } } }) as KeyAction;
const single = (action: object) => ({ Single: action }) as KeyAction;

describe("modifiers by computer", () => {
  it("read as GLIDE writes them", () => {
    expect(chordText(mods("left_ctrl", "left_shift"), "mac")).toBe("⌃⇧");
    expect(chordText(mods("left_ctrl", "left_shift"), "win")).toBe("Ctrl+Shift");
    expect(chordText(mods("left_gui"), "linux")).toBe("Super");
    expect(chordLook(mods("left_gui"), "linux")[0].word).toBe("Super");
  });
  it("call right Alt AltGr off the Mac, and all four Hyper", () => {
    expect(chordText(mods("right_alt"), "win")).toBe("AltGr");
    expect(chordText(mods("right_alt"), "mac")).toBe("⌥");
    expect(chordText(mods("left_ctrl", "left_alt", "left_shift", "left_gui"), "mac")).toBe("Hyper");
  });
});

describe("key faces", () => {
  it("show pictures for system, lighting, media and arrow keys", () => {
    expect(keyFace(single({ KeyboardControl: "Bootloader" }), [], mac).face).toEqual([{ icon: "bootloader" }]);
    expect(keyFace(single({ Light: "RgbHui" }), [], mac).face).toEqual([{ icon: "rgb-hue" }, { icon: "increase" }]);
    expect(keyFace(hid("AudioVolUp"), [], mac).face).toEqual([{ icon: "volume-up" }]);
    expect(keyFace(hid("Left"), [], win).face).toEqual([{ icon: "left" }]);
  });
  it("show Return as a picture only on the Mac", () => {
    expect(keyFace(hid("Enter"), [], mac).face).toEqual([{ icon: "ret" }]);
    expect(keyFace(hid("Enter"), [], win).face).toBeUndefined();
  });
  it("number Bluetooth profiles and use the board's own pictures", () => {
    expect(actionFace({ User: 2 }, mac)).toEqual([{ icon: "bluetooth" }, { text: "2" }]);
    expect(actionFace({ User: 10 }, mac)).toEqual([{ icon: "bt-clr" }]);
    expect(actionFace({ User: 7 }, mac)).toBeUndefined();
    expect(actionFace({ User: 2 }, { ...mac, bleProfiles: 0 })).toBeUndefined();
  });
  it("draw modifiers per computer, as pictures where it has them", () => {
    const ctrl = single({ Modifier: mods("left_ctrl") });
    expect(keyFace(ctrl, [], mac).face).toEqual([{ icon: "macos-ctrl" }]);
    expect(keyFace(ctrl, [], win)).toEqual({ text: "Ctrl", top: undefined });
    expect(keyFace(single({ Modifier: mods("left_gui") }), [], win).face).toEqual([{ icon: "windows" }]);
    expect(keyFace(hid("LShift"), [], mac).face).toEqual([{ icon: "shift" }]);
    expect(keyFace(hid("LShift"), [], { ...mac, os: "linux" })).toEqual({ text: "Shift", top: undefined });
    expect(keyFace(hid("RAlt"), [], win).text).toBe("AltGr");
  });
  it("put a chord's modifiers above its key, unless it types a character", () => {
    const undo = single({ KeyWithModifier: ["Z", mods("left_gui")] });
    expect(keyFace(undo, [], mac)).toMatchObject({ text: "Z", chord: [{ icon: "command" }] });
    expect(keyFace(undo, [], { ...mac, os: "linux" })).toMatchObject({ chord: [{ text: "Super" }] });
    const at = single({ KeyWithModifier: ["Kc2", mods("left_shift")] });
    expect(keyFace(at, [], mac).chord).toBeUndefined();
  });
  it("draw a modifier hold in the hold line", () => {
    const homeRow = { TapHold: [{ Key: { Hid: "A" } }, { Modifier: mods("left_alt") }, 0] } as KeyAction;
    expect(keyFace(homeRow, [], mac).subFace).toEqual([{ icon: "macos-alt" }]);
    expect(keyFace(homeRow, [], win)).toEqual({ text: "A", sub: "Alt" });
  });
  it("only name pictures that exist", () => {
    const names = [
      keyFace(single({ Light: "RgbModeForward" }), [], mac).face,
      keyFace(single({ KeyboardControl: "OutputUsb" }), [], mac).face,
    ].flat();
    for (const part of names) if (part && "icon" in part) expect(KEY_ICON_DATA[part.icon]).toBeDefined();
  });
});

describe("face layout", () => {
  it("spans the cap with a wide picture alone, as GLIDE's MoErgo logo", () => {
    const [logo] = faceLayout([{ icon: "magic" }], 1, "main");
    expect(logo.size).toBeCloseTo(1.02 * (62 / 70));
    expect(logo.height).toBeCloseTo(logo.size * (650 / 1772));
  });
  it("centres a row and keeps it inside the cap", () => {
    const row = faceLayout([{ icon: "bluetooth" }, { text: "2" }], 1, "main");
    expect(row[0].dx).toBeLessThan(0);
    expect(row[1].dx).toBeGreaterThan(0);
    const wide = faceLayout([{ icon: "macos-ctrl" }, { icon: "macos-alt" }, { icon: "shift" }, { icon: "command" }], 1, "main");
    const right = wide.at(-1)!;
    expect(right.dx + right.size / 2).toBeLessThanOrEqual(0.4 + 1e-9);
  });
  it("sizes pictures as GLIDE does: 40% of the cap alone, 36% and 23% as a pair", () => {
    const cap = 62 / 70;
    expect(faceLayout([{ icon: "bootloader" }], 1, "main")[0].size).toBeCloseTo(0.402 * cap);
    const [picture, step] = faceLayout([{ icon: "rgb-hue" }, { icon: "increase" }], 1, "main");
    expect(picture.size).toBeCloseTo(0.356 * cap);
    expect(step.size).toBeCloseTo(0.232 * cap);
  });
});

describe("empty keys", () => {
  it("show GLIDE's slash for a key that does nothing", () => {
    expect(keyFace("No", [], mac).none).toBe(true);
    expect(keyFace("Transparent", [], mac).none).toBeUndefined();
  });
});

describe("special keys", () => {
  it("are Bluetooth keys, then anything but a plain key press", () => {
    expect(specialKind(single({ User: 1 }), mac)).toBe("bluetooth");
    expect(specialKind(single({ User: 10 }), mac)).toBe("bluetooth");
    expect(specialKind(single({ LayerOn: 1 }), mac)).toBe("action");
    expect(specialKind(single({ Light: "RgbTog" }), mac)).toBe("action");
    expect(specialKind({ TapHold: [{ Key: { Hid: "A" } }, { LayerOn: 1 }, 0] } as KeyAction, mac)).toBe("action");
  });
  it("leave plain presses, chords, modifiers and empty keys alone", () => {
    expect(specialKind(hid("A"), mac)).toBeUndefined();
    expect(specialKind(single({ KeyWithModifier: ["Z", mods("left_gui")] }), mac)).toBeUndefined();
    expect(specialKind(single({ Modifier: mods("left_shift") }), mac)).toBeUndefined();
    expect(specialKind("No", mac)).toBeUndefined();
    expect(specialKind("Transparent", mac)).toBeUndefined();
  });
});

describe("layer keys", () => {
  const named: FaceContext = { ...mac, layerNames: ["Base", "Lower", undefined, "Magic"] };
  it("read as their layer's name under GLIDE's layers mark", () => {
    expect(keyFace(single({ LayerOn: 1 }), [], named)).toMatchObject({ text: "Lower", layer: true, chord: [{ icon: "layers" }] });
    expect(keyFace(single({ LayerToggleOnly: 0 }), [], named).text).toBe("Base");
  });
  it("fall back to the layer number when the layer has no name", () => {
    expect(keyFace(single({ LayerOn: 2 }), [], named).text).toBe("L2");
    expect(keyFace(single({ LayerToggle: 2 }), [], named).text).toBe("TG2");
  });
  it("show the MoErgo picture for a key to Magic", () => {
    expect(keyFace(single({ LayerOn: 3 }), [], named).face).toEqual([{ icon: "magic" }]);
  });
  it("name the layer a hold switches to, with the layers mark", () => {
    const lt = { TapHold: [{ Key: { Hid: "Space" } }, { LayerOn: 1 }, 0] } as KeyAction;
    expect(keyFace(lt, [], named).subFace).toEqual([{ icon: "layers" }, { text: "Lower" }]);
  });
});
