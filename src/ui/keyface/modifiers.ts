// How the four modifiers read on each computer, as in GLIDE
// (core/keycodes/modifiers.js there), in the order a chord is read: Ctrl, Alt,
// Shift, then the GUI key. Per OS a word, the symbol text uses, and the picture
// key faces draw: every Mac modifier and the Windows key; none on Linux
// ("Super"). Right Alt is AltGr off the Mac; all four together read "Hyper". Pure.

import type { ModifierCombination } from "../../model/action-types";
import type { Os } from "../preferences";
import type { KeyIconName } from "./keyIconData";

type Modifier = "ctrl" | "alt" | "shift" | "gui";
export interface ModifierLook {
  word: string;
  symbol: string;
  icon?: KeyIconName;
}

const MODIFIERS: Record<Modifier, Record<Os, ModifierLook>> = {
  ctrl: {
    mac: { word: "Control", symbol: "⌃", icon: "macos-ctrl" },
    win: { word: "Ctrl", symbol: "Ctrl" },
    linux: { word: "Ctrl", symbol: "Ctrl" },
  },
  alt: {
    mac: { word: "Option", symbol: "⌥", icon: "macos-alt" },
    win: { word: "Alt", symbol: "Alt" },
    linux: { word: "Alt", symbol: "Alt" },
  },
  shift: {
    mac: { word: "Shift", symbol: "⇧", icon: "shift" },
    win: { word: "Shift", symbol: "Shift" },
    linux: { word: "Shift", symbol: "Shift" },
  },
  gui: {
    mac: { word: "Command", symbol: "⌘", icon: "command" },
    win: { word: "Windows", symbol: "⊞", icon: "windows" },
    linux: { word: "Super", symbol: "❖" },
  },
};
const ORDER: readonly Modifier[] = ["ctrl", "alt", "shift", "gui"];
const ALT_GR: ModifierLook = { word: "AltGr", symbol: "AltGr" };
const HYPER: ModifierLook = { word: "Hyper", symbol: "Hyper" };

/** The modifiers held in `mods`, each once, in chord order. */
export function chordLook(mods: ModifierCombination, os: Os): ModifierLook[] {
  const held = (m: Modifier) => [mods[`left_${m}`], mods[`right_${m}`]];
  const present = ORDER.filter((m) => held(m).some(Boolean));
  if (present.length === ORDER.length) return [HYPER];
  return present.map((m) => {
    const [left, right] = held(m);
    return m === "alt" && right && !left && os !== "mac" ? ALT_GR : MODIFIERS[m][os];
  });
}

/** A chord as text: "⌃⇧" on the Mac, words elsewhere ("Ctrl+Shift", "Super"). */
export function chordText(mods: ModifierCombination, os: Os): string {
  const looks = chordLook(mods, os);
  return os === "mac" ? looks.map((look) => look.symbol).join("") : looks.map((look) => look.word).join("+");
}
