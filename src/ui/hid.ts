// Curated HID keycode catalog for the picker. Grouped, searchable, and
// locale-aware: labels and search text follow the active OS locale, and a
// single-character query resolves to the keystroke that types it.

import type { HidKeyCode, ModifierCombination } from "../vendor/rynk-wasm/rynk_wasm";
import { hidLabel, modifierSymbols } from "./labels";
import {
  activeLocale,
  characterFor,
  keystrokeForCharacter,
  keystrokeModifiers,
  type KeyboardLocale,
} from "./locale";

export interface KeycodeEntry {
  code: HidKeyCode;
  /** Compact keycap label. */
  label: string;
  /** Search haystack (lowercase). */
  search: string;
  /** Modifiers this entry requires to type its character (Shift/AltGr). */
  mods?: ModifierCombination;
}

export interface KeycodeGroup {
  name: string;
  entries: KeycodeEntry[];
}

function entry(locale: KeyboardLocale, code: HidKeyCode, extra = ""): KeycodeEntry {
  const characters = [
    characterFor(locale, code, false),
    characterFor(locale, code, true),
    characterFor(locale, code, false, true),
    characterFor(locale, code, true, true),
  ]
    .filter((c): c is string => c !== null)
    .join(" ");
  return {
    code,
    label: hidLabel(code),
    search: `${code} ${hidLabel(code)} ${characters} ${extra}`.toLowerCase(),
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

function buildGroups(locale: KeyboardLocale): KeycodeGroup[] {
  const e = (code: HidKeyCode, extra = "") => entry(locale, code, extra);
  return [
    {
      name: "Letters",
      entries: LETTERS.map((c) => e(c, "letter")),
    },
    {
      name: "Digits",
      entries: DIGITS.map((c, i) => e(c, `digit number ${(i + 1) % 10}`)),
    },
    {
      name: "Editing",
      entries: [
        e("Enter", "return newline"),
        e("Escape", "esc"),
        e("Backspace", "bksp delete back"),
        e("Tab", "tabulator"),
        e("Space", "spacebar"),
        e("Delete", "del forward"),
        e("Insert", "ins"),
        e("CapsLock", "caps lock"),
      ],
    },
    {
      name: "Navigation",
      entries: [
        e("Left", "arrow"),
        e("Down", "arrow"),
        e("Up", "arrow"),
        e("Right", "arrow"),
        e("Home", "line start"),
        e("End", "line end"),
        e("PageUp", "pgup"),
        e("PageDown", "pgdn"),
      ],
    },
    {
      name: "Punctuation",
      entries: [
        e("Minus", "dash hyphen underscore"),
        e("Equal", "equals plus"),
        e("LeftBracket", "bracket brace"),
        e("RightBracket", "bracket brace"),
        e("Backslash", "pipe"),
        e("Semicolon", "colon"),
        e("Quote", "apostrophe double"),
        e("Grave", "backtick tilde"),
        e("Comma", "less angle"),
        e("Dot", "period greater angle"),
        e("Slash", "question forward"),
        e("NonusBackslash", "iso nonus"),
        e("NonusHash", "iso nonus hash"),
      ],
    },
    {
      name: "Function keys",
      entries: FKEYS.map((c) => e(c, "function")),
    },
    {
      name: "Keypad",
      entries: [
        e("NumLock", "numlock keypad"),
        e("KpSlash", "keypad divide"),
        e("KpAsterisk", "keypad multiply star"),
        e("KpMinus", "keypad subtract"),
        e("KpPlus", "keypad add"),
        e("KpEnter", "keypad enter"),
        e("Kp1", "keypad"),
        e("Kp2", "keypad"),
        e("Kp3", "keypad"),
        e("Kp4", "keypad"),
        e("Kp5", "keypad"),
        e("Kp6", "keypad"),
        e("Kp7", "keypad"),
        e("Kp8", "keypad"),
        e("Kp9", "keypad"),
        e("Kp0", "keypad"),
        e("KpDot", "keypad decimal"),
        e("KpEqual", "keypad equals"),
      ],
    },
    {
      name: "Media",
      entries: [
        e("MediaPlayPause", "play pause music"),
        e("MediaNextTrack", "next track skip"),
        e("MediaPrevTrack", "previous track"),
        e("MediaStop", "stop music"),
        e("AudioMute", "mute volume"),
        e("AudioVolUp", "volume up louder"),
        e("AudioVolDown", "volume down quieter"),
        e("BrightnessUp", "brightness screen"),
        e("BrightnessDown", "brightness screen"),
        e("MediaEject", "eject"),
      ],
    },
    {
      name: "System",
      entries: [
        e("PrintScreen", "screenshot sysrq"),
        e("ScrollLock", "scroll lock"),
        e("Pause", "break"),
        e("Application", "menu context"),
        e("SystemPower", "power off"),
        e("SystemSleep", "sleep suspend"),
        e("SystemWake", "wake"),
        e("MissionControl", "mac expose"),
        e("Launchpad", "mac launcher"),
      ],
    },
    {
      name: "Modifier keys",
      entries: [
        e("LCtrl", "left control"),
        e("LShift", "left shift"),
        e("LAlt", "left alt option"),
        e("LGui", "left gui super cmd win meta"),
        e("RCtrl", "right control"),
        e("RShift", "right shift"),
        e("RAlt", "right alt option altgr"),
        e("RGui", "right gui super cmd win meta"),
      ],
    },
  ];
}

let cachedGroups: { localeId: string; groups: KeycodeGroup[] } | null = null;

export function keycodeGroups(): KeycodeGroup[] {
  const locale = activeLocale();
  if (cachedGroups?.localeId !== locale.id) {
    cachedGroups = { localeId: locale.id, groups: buildGroups(locale) };
  }
  return cachedGroups.groups;
}

/** An exact-character match for a one-character query: the keystroke that
 *  types it under the active locale, with any Shift/AltGr it needs. */
function characterMatch(query: string): KeycodeGroup | null {
  const character = query.trim();
  if ([...character].length !== 1) return null;
  const locale = activeLocale();
  const stroke = keystrokeForCharacter(locale, character);
  if (!stroke) return null;
  const mods = keystrokeModifiers(stroke);
  const needsMods = stroke.shift || stroke.altgr;
  return {
    name: `Types “${character}” (${locale.name})`,
    entries: [
      {
        code: stroke.code,
        label: needsMods ? `${modifierSymbols(mods)}${hidLabel(stroke.code)}` : hidLabel(stroke.code),
        search: "",
        mods: needsMods ? mods : undefined,
      },
    ],
  };
}

export function searchKeycodes(query: string): KeycodeGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return keycodeGroups();
  const out: KeycodeGroup[] = [];
  const exact = characterMatch(query);
  if (exact) out.push(exact);
  const terms = q.split(/\s+/);
  for (const group of keycodeGroups()) {
    const entries = group.entries.filter((e) =>
      terms.every((t) => e.search.includes(t)),
    );
    if (entries.length > 0) out.push({ name: group.name, entries });
  }
  return out;
}
