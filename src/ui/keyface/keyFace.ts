// What a key's face shows beyond its text, as GLIDE draws it (assets/keys/keys.json
// and core/keycodes/modifiers.js there): system keys show a picture (Bluetooth,
// USB, the bootloader, the lighting controls, media, arrows, Backspace …) and
// modifiers read the way the chosen computer writes them. The text legend from
// labels.ts stays the fallback and what lists and messages print. Pure.

import type { Action, KeyAction, ModifierCombination, Morse } from "../../model/action-types";
import { characterWithModifiers, hidLabel, keyActionGlyph, layerOf, type KeyGlyph, type LayerNames } from "../labels";
import type { Os } from "../preferences";
import { KEY_ICON_DATA, type KeyIconName } from "./keyIconData";
import { chordLook, chordText } from "./modifiers";
import type { SpecialKey } from "../theme/themes";

/** One piece of a face: a picture or a little text, laid out in a row. */
export type FacePart = { icon: KeyIconName } | { text: string };

export interface FaceContext {
  os: Os;
  /** Bluetooth profiles the firmware has: User(n) below this switches to profile n. */
  bleProfiles: number;
  /** Pictures a board gives its own User actions (its profile's `userActions`). */
  userIcons?: ReadonlyMap<number, KeyIconName>;
  /** The layout's layer names: layer keys read as them. */
  layerNames?: LayerNames;
}

/** A key to the layer named Magic shows the MoErgo picture, as GLIDE's Magic key does. */
const isMagic = (names: LayerNames | undefined, layer: number) => /^magic$/i.test(names?.[layer]?.trim() ?? "");

const icon = (name: KeyIconName): FacePart => ({ icon: name });
const text = (value: string): FacePart => ({ text: value });
const up = (name: KeyIconName) => [icon(name), icon("increase")];
const down = (name: KeyIconName) => [icon(name), icon("decrease")];

/** Lighting, as GLIDE shows rgb_ug: on this firmware BacklightToggle is RGB_TOG
 *  (every light off) and Backlight± the brightness, as the stock magic layer has them. */
const LIGHT_FACES: Partial<Record<string, FacePart[]>> = {
  RgbTog: [icon("rgb-toggle")],
  BacklightToggle: [icon("rgb-toggle")],
  RgbVai: up("rgb-brightness"),
  RgbVad: down("rgb-brightness"),
  BacklightUp: up("rgb-brightness"),
  BacklightDown: down("rgb-brightness"),
  RgbHui: up("rgb-hue"),
  RgbHud: down("rgb-hue"),
  RgbSai: up("rgb-saturation"),
  RgbSad: down("rgb-saturation"),
  RgbSpi: up("rgb-underglow"),
  RgbSpd: down("rgb-underglow"),
  RgbModeForward: [icon("rgb-cycle1"), icon("rgb-cycle2")],
};

const CONTROL_FACES: Partial<Record<string, FacePart[]>> = {
  Bootloader: [icon("bootloader")],
  OutputUsb: [icon("out-usb")],
  OutputBluetooth: [icon("bluetooth")],
};

/** Plain keys (HID usages) and their consumer twins. */
const KEY_FACES: Partial<Record<string, KeyIconName>> = {
  Left: "left",
  Right: "right",
  Up: "up",
  Down: "down",
  Backspace: "bspc",
  Tab: "tab",
  Application: "menu",
  AudioVolUp: "volume-up",
  AudioVolDown: "volume-down",
  AudioMute: "volume-mute",
  KbVolumeUp: "volume-up",
  KbVolumeDown: "volume-down",
  KbMute: "volume-mute",
  MediaPlayPause: "play-pause",
  MediaNextTrack: "next",
  MediaPrevTrack: "previous",
  BrightnessUp: "brightness-up",
  BrightnessDown: "brightness-down",
  VolumeIncrement: "volume-up",
  VolumeDecrement: "volume-down",
  Mute: "volume-mute",
  PlayPause: "play-pause",
  NextTrack: "next",
  PrevTrack: "previous",
};

export const isKeyIcon = (name: string): name is KeyIconName => name in KEY_ICON_DATA;

const withIcon = (parts: FacePart[]) => (parts.some((part) => "icon" in part) ? parts : undefined);

/** The picture face of one action, or undefined when its text reads best. */
export function actionFace(action: Action, ctx: FaceContext): FacePart[] | undefined {
  if (typeof action !== "object") return undefined;
  const mods = modifiersOf(action);
  if (mods) return withIcon(chordLook(mods, ctx.os).map((m) => (m.icon ? icon(m.icon) : text(m.word))));
  if ("Key" in action) {
    const key = action.Key;
    if (typeof key !== "object") return undefined;
    const name = "Hid" in key ? key.Hid : "Consumer" in key ? key.Consumer : undefined;
    // Return is a picture only on the Mac, where the key says so; elsewhere "Enter".
    if (name === "Enter") return ctx.os === "mac" ? [icon("ret")] : undefined;
    const face = name !== undefined ? KEY_FACES[name] : undefined;
    return face ? [icon(face)] : undefined;
  }
  if ("Light" in action) return LIGHT_FACES[action.Light];
  if ("KeyboardControl" in action) return CONTROL_FACES[action.KeyboardControl];
  if ("User" in action) {
    const id = action.User;
    if (id < ctx.bleProfiles) return [icon("bluetooth"), text(String(id))];
    const own = ctx.userIcons?.get(id);
    return own ? [icon(own)] : undefined;
  }
  return undefined;
}

/** A chord key (⌘Z, Ctrl+Z): its modifiers drawn small above the key, as in
 *  GLIDE. One that types a character (⇧2 → "@") shows that character instead. */
function chordFace(action: Action, ctx: FaceContext): { chord: FacePart[]; key: string } | undefined {
  if (typeof action !== "object" || !("KeyWithModifier" in action)) return undefined;
  const [key, mods] = action.KeyWithModifier;
  const looks = chordLook(mods, ctx.os);
  if (looks.length === 0 || characterWithModifiers(key, mods) !== null) return undefined;
  return { chord: looks.map((m) => (m.icon ? icon(m.icon) : text(m.word))), key: hidLabel(key) };
}

const MODIFIER_KEYS: Record<string, keyof ModifierCombination> = {
  LCtrl: "left_ctrl", LShift: "left_shift", LAlt: "left_alt", LGui: "left_gui",
  RCtrl: "right_ctrl", RShift: "right_shift", RAlt: "right_alt", RGui: "right_gui",
};

/** The modifiers an action holds: a Modifier action, or a modifier key (LShift …). */
function modifiersOf(action: Action | undefined): ModifierCombination | undefined {
  if (typeof action !== "object") return undefined;
  if ("Modifier" in action) return action.Modifier;
  if (!("Key" in action) || typeof action.Key !== "object" || !("Hid" in action.Key)) return undefined;
  const held = MODIFIER_KEYS[action.Key.Hid];
  if (!held) return undefined;
  const none = Object.fromEntries(Object.values(MODIFIER_KEYS).map((name) => [name, false]));
  return { ...none, [held]: true } as ModifierCombination;
}

/** keyActionGlyph, with the pictures and per-OS modifiers the canvas draws. */
export function keyFace(action: KeyAction, morse: readonly Morse[], ctx: FaceContext): KeyGlyph {
  const glyph = keyActionGlyph(action, morse, ctx.layerNames);
  // A key that does nothing: GLIDE's faint slash.
  if (action === "No") return { ...glyph, none: true };
  if (typeof action !== "object") return glyph;
  const tap = "Single" in action ? action.Single : "Tap" in action ? action.Tap : "TapHold" in action ? action.TapHold[0] : undefined;
  const hold = "TapHold" in action ? action.TapHold[1] : undefined;
  if (tap === undefined) return glyph;

  const out: KeyGlyph = { ...glyph };
  const tapMods = modifiersOf(tap);
  if (tapMods) out.text = chordText(tapMods, ctx.os);
  const target = layerOf(tap);
  const face = target !== undefined && isMagic(ctx.layerNames, target) ? [icon("magic")] : actionFace(tap, ctx);
  if (face) out.face = face;
  // GLIDE's layer key: the layers mark above the layer's name.
  else if (glyph.layer) out.chord = [icon("layers")];
  const chord = chordFace(tap, ctx);
  if (chord) {
    out.text = chord.key;
    out.chord = chord.chord;
  }
  if (hold !== undefined) {
    const holdMods = modifiersOf(hold);
    if (holdMods) out.sub = chordText(holdMods, ctx.os);
    const subFace = actionFace(hold, ctx);
    if (subFace) out.subFace = subFace;
  }
  if (!out.subFace && glyph.subLayer && glyph.sub) out.subFace = [icon("layers"), text(glyph.sub)];
  return out;
}

/** "Highlight special keys", by GLIDE's rule (core/keycodes/keyIcons.js
 *  defaultKeyColor there): a Bluetooth key, else anything that is not a plain
 *  key press (a layer, a hold, a macro, a lighting or system key). An empty or
 *  transparent key, and a key, chord or modifier press, have none. */
export function specialKind(action: KeyAction, ctx: FaceContext): SpecialKey | undefined {
  if (typeof action !== "object") return undefined;
  const single = "Single" in action ? action.Single : "Tap" in action ? action.Tap : undefined;
  if (single === undefined) return "action";
  if (typeof single !== "object") return single === "No" ? undefined : "action";
  if ("Key" in single || "KeyWithModifier" in single || "Modifier" in single) return undefined;
  if ("User" in single && isBluetoothUser(single.User, ctx)) return "bluetooth";
  return "action";
}

/** RMK's Bluetooth User actions: a profile, then next, previous and clear
 *  (keyboard.rs process_user); and a board's own, by their Bluetooth pictures. */
function isBluetoothUser(id: number, ctx: FaceContext): boolean {
  if (ctx.bleProfiles > 0 && id < ctx.bleProfiles + 3) return true;
  const own = ctx.userIcons?.get(id);
  return own === "bt-clr" || own === "bt-clr-all" || own === "bluetooth";
}
