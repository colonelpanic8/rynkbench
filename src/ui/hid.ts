// Curated HID keycode catalog for the picker. Grouped, searchable.

import type { HidKeyCode } from "../vendor/rynk-wasm/rynk_wasm";
import { hidLabel } from "./labels";

export interface KeycodeEntry {
  code: HidKeyCode;
  /** Compact keycap label. */
  label: string;
  /** Search haystack (lowercase). */
  search: string;
}

export interface KeycodeGroup {
  name: string;
  entries: KeycodeEntry[];
}

function entry(code: HidKeyCode, extra = ""): KeycodeEntry {
  return {
    code,
    label: hidLabel(code),
    search: `${code} ${hidLabel(code)} ${extra}`.toLowerCase(),
  };
}

const LETTERS: HidKeyCode[] = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
];

const DIGITS: HidKeyCode[] = [
  "Kc1", "Kc2", "Kc3", "Kc4", "Kc5", "Kc6", "Kc7", "Kc8", "Kc9", "Kc0",
];

const FKEYS: HidKeyCode[] = [
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
  "F13", "F14", "F15", "F16", "F17", "F18", "F19", "F20", "F21", "F22", "F23", "F24",
];

export const KEYCODE_GROUPS: KeycodeGroup[] = [
  {
    name: "Letters",
    entries: LETTERS.map((c) => entry(c, "letter")),
  },
  {
    name: "Digits",
    entries: DIGITS.map((c, i) => entry(c, `digit number ${(i + 1) % 10}`)),
  },
  {
    name: "Editing",
    entries: [
      entry("Enter", "return newline"),
      entry("Escape", "esc"),
      entry("Backspace", "bksp delete back"),
      entry("Tab", "tabulator"),
      entry("Space", "spacebar"),
      entry("Delete", "del forward"),
      entry("Insert", "ins"),
      entry("CapsLock", "caps lock"),
    ],
  },
  {
    name: "Navigation",
    entries: [
      entry("Left", "arrow"),
      entry("Down", "arrow"),
      entry("Up", "arrow"),
      entry("Right", "arrow"),
      entry("Home", "line start"),
      entry("End", "line end"),
      entry("PageUp", "pgup"),
      entry("PageDown", "pgdn"),
    ],
  },
  {
    name: "Punctuation",
    entries: [
      entry("Minus", "dash hyphen underscore"),
      entry("Equal", "equals plus"),
      entry("LeftBracket", "bracket brace"),
      entry("RightBracket", "bracket brace"),
      entry("Backslash", "pipe"),
      entry("Semicolon", "colon"),
      entry("Quote", "apostrophe double"),
      entry("Grave", "backtick tilde"),
      entry("Comma", "less angle"),
      entry("Dot", "period greater angle"),
      entry("Slash", "question forward"),
      entry("NonusBackslash", "iso nonus"),
      entry("NonusHash", "iso nonus hash"),
    ],
  },
  {
    name: "Function keys",
    entries: FKEYS.map((c) => entry(c, "function")),
  },
  {
    name: "Keypad",
    entries: [
      entry("NumLock", "numlock keypad"),
      entry("KpSlash", "keypad divide"),
      entry("KpAsterisk", "keypad multiply star"),
      entry("KpMinus", "keypad subtract"),
      entry("KpPlus", "keypad add"),
      entry("KpEnter", "keypad enter"),
      entry("Kp1", "keypad"),
      entry("Kp2", "keypad"),
      entry("Kp3", "keypad"),
      entry("Kp4", "keypad"),
      entry("Kp5", "keypad"),
      entry("Kp6", "keypad"),
      entry("Kp7", "keypad"),
      entry("Kp8", "keypad"),
      entry("Kp9", "keypad"),
      entry("Kp0", "keypad"),
      entry("KpDot", "keypad decimal"),
      entry("KpEqual", "keypad equals"),
    ],
  },
  {
    name: "Media",
    entries: [
      entry("MediaPlayPause", "play pause music"),
      entry("MediaNextTrack", "next track skip"),
      entry("MediaPrevTrack", "previous track"),
      entry("MediaStop", "stop music"),
      entry("AudioMute", "mute volume"),
      entry("AudioVolUp", "volume up louder"),
      entry("AudioVolDown", "volume down quieter"),
      entry("BrightnessUp", "brightness screen"),
      entry("BrightnessDown", "brightness screen"),
      entry("MediaEject", "eject"),
    ],
  },
  {
    name: "System",
    entries: [
      entry("PrintScreen", "screenshot sysrq"),
      entry("ScrollLock", "scroll lock"),
      entry("Pause", "break"),
      entry("Application", "menu context"),
      entry("SystemPower", "power off"),
      entry("SystemSleep", "sleep suspend"),
      entry("SystemWake", "wake"),
      entry("MissionControl", "mac expose"),
      entry("Launchpad", "mac launcher"),
    ],
  },
  {
    name: "Modifier keys",
    entries: [
      entry("LCtrl", "left control"),
      entry("LShift", "left shift"),
      entry("LAlt", "left alt option"),
      entry("LGui", "left gui super cmd win meta"),
      entry("RCtrl", "right control"),
      entry("RShift", "right shift"),
      entry("RAlt", "right alt option altgr"),
      entry("RGui", "right gui super cmd win meta"),
    ],
  },
];

export function searchKeycodes(query: string): KeycodeGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return KEYCODE_GROUPS;
  const terms = q.split(/\s+/);
  const out: KeycodeGroup[] = [];
  for (const group of KEYCODE_GROUPS) {
    const entries = group.entries.filter((e) =>
      terms.every((t) => e.search.includes(t)),
    );
    if (entries.length > 0) out.push({ name: group.name, entries });
  }
  return out;
}
