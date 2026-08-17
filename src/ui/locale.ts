// OS keyboard-locale character mapping. The HID codes a keyboard sends are
// position codes; what they type depends on the host's layout. Each locale
// table maps HID code → [base, shift, altgr, shift+altgr] characters, and a
// reverse index resolves a character back to the keystroke that produces it.
// A tiny subscribable store holds the active locale (persisted per browser).

import type { HidKeyCode, ModifierCombination } from "../vendor/rynk-wasm/rynk_wasm";

/** [base, shift?, altgr?, shiftAltgr?]. A single-letter base with no explicit
 *  shift entry derives its shifted character by uppercasing. */
type KeyChars = [string, string?, string?, string?];

type CharTable = Partial<Record<HidKeyCode, KeyChars>>;

export interface KeyboardLocale {
  id: string;
  name: string;
  /** Overrides on top of the US table (which itself sits on top of derived
   *  a–z letters). A locale entry replaces the US entry for that key whole. */
  keys: CharTable;
}

/** US ANSI — the identity layout every other table overrides. */
const US_KEYS: CharTable = {
  Kc1: ["1", "!"],
  Kc2: ["2", "@"],
  Kc3: ["3", "#"],
  Kc4: ["4", "$"],
  Kc5: ["5", "%"],
  Kc6: ["6", "^"],
  Kc7: ["7", "&"],
  Kc8: ["8", "*"],
  Kc9: ["9", "("],
  Kc0: ["0", ")"],
  Minus: ["-", "_"],
  Equal: ["=", "+"],
  LeftBracket: ["[", "{"],
  RightBracket: ["]", "}"],
  Backslash: ["\\", "|"],
  NonusHash: ["#", "~"],
  Semicolon: [";", ":"],
  Quote: ["'", '"'],
  Grave: ["`", "~"],
  Comma: [",", "<"],
  Dot: [".", ">"],
  Slash: ["/", "?"],
  NonusBackslash: ["\\", "|"],
};

export const LOCALES: KeyboardLocale[] = [
  { id: "us", name: "English (US)", keys: {} },
  {
    id: "uk",
    name: "English (UK)",
    keys: {
      Kc2: ["2", '"'],
      Kc3: ["3", "£"],
      Kc4: ["4", "$", "€"],
      Quote: ["'", "@"],
      Backslash: ["#", "~"],
      NonusHash: ["#", "~"],
      Grave: ["`", "¬", "¦"],
      NonusBackslash: ["\\", "|"],
    },
  },
  {
    id: "de",
    name: "German (QWERTZ)",
    keys: {
      Y: ["z"],
      Z: ["y"],
      Q: ["q", "Q", "@"],
      E: ["e", "E", "€"],
      M: ["m", "M", "µ"],
      Kc2: ["2", '"', "²"],
      Kc3: ["3", "§", "³"],
      Kc6: ["6", "&"],
      Kc7: ["7", "/", "{"],
      Kc8: ["8", "(", "["],
      Kc9: ["9", ")", "]"],
      Kc0: ["0", "=", "}"],
      Minus: ["ß", "?", "\\"],
      Equal: ["´", "`"],
      LeftBracket: ["ü", "Ü"],
      RightBracket: ["+", "*", "~"],
      Backslash: ["#", "'"],
      NonusHash: ["#", "'"],
      Semicolon: ["ö", "Ö"],
      Quote: ["ä", "Ä"],
      Grave: ["^", "°"],
      Comma: [",", ";"],
      Dot: [".", ":"],
      Slash: ["-", "_"],
      NonusBackslash: ["<", ">", "|"],
    },
  },
  {
    id: "fr",
    name: "French (AZERTY)",
    keys: {
      Q: ["a"],
      W: ["z"],
      A: ["q"],
      Z: ["w"],
      E: ["e", "E", "€"],
      M: [",", "?"],
      Kc1: ["&", "1"],
      Kc2: ["é", "2", "~"],
      Kc3: ['"', "3", "#"],
      Kc4: ["'", "4", "{"],
      Kc5: ["(", "5", "["],
      Kc6: ["-", "6", "|"],
      Kc7: ["è", "7", "`"],
      Kc8: ["_", "8", "\\"],
      Kc9: ["ç", "9", "^"],
      Kc0: ["à", "0", "@"],
      Minus: [")", "°", "]"],
      Equal: ["=", "+", "}"],
      LeftBracket: ["^", "¨"],
      RightBracket: ["$", "£", "¤"],
      Backslash: ["*", "µ"],
      NonusHash: ["*", "µ"],
      Semicolon: ["m"],
      Quote: ["ù", "%"],
      Grave: ["²"],
      Comma: [";", "."],
      Dot: [":", "/"],
      Slash: ["!", "§"],
      NonusBackslash: ["<", ">"],
    },
  },
  {
    id: "es",
    name: "Spanish (ES)",
    keys: {
      E: ["e", "E", "€"],
      Kc1: ["1", "!", "|"],
      Kc2: ["2", '"', "@"],
      Kc3: ["3", "·", "#"],
      Kc4: ["4", "$", "~"],
      Kc6: ["6", "&", "¬"],
      Kc7: ["7", "/"],
      Kc8: ["8", "("],
      Kc9: ["9", ")"],
      Kc0: ["0", "="],
      Minus: ["'", "?"],
      Equal: ["¡", "¿"],
      LeftBracket: ["`", "^", "["],
      RightBracket: ["+", "*", "]"],
      Backslash: ["ç", "Ç", "}"],
      NonusHash: ["ç", "Ç", "}"],
      Semicolon: ["ñ", "Ñ"],
      Quote: ["´", "¨", "{"],
      Grave: ["º", "ª", "\\"],
      Comma: [",", ";"],
      Dot: [".", ":"],
      Slash: ["-", "_"],
      NonusBackslash: ["<", ">"],
    },
  },
  {
    id: "sefi",
    name: "Swedish / Finnish",
    keys: {
      E: ["e", "E", "€"],
      M: ["m", "M", "µ"],
      Kc2: ["2", '"', "@"],
      Kc3: ["3", "#", "£"],
      Kc4: ["4", "¤", "$"],
      Kc5: ["5", "%", "€"],
      Kc6: ["6", "&"],
      Kc7: ["7", "/", "{"],
      Kc8: ["8", "(", "["],
      Kc9: ["9", ")", "]"],
      Kc0: ["0", "=", "}"],
      Minus: ["+", "?", "\\"],
      Equal: ["´", "`"],
      LeftBracket: ["å", "Å"],
      RightBracket: ["¨", "^", "~"],
      Backslash: ["'", "*"],
      NonusHash: ["'", "*"],
      Semicolon: ["ö", "Ö"],
      Quote: ["ä", "Ä"],
      Grave: ["§", "½"],
      Comma: [",", ";"],
      Dot: [".", ":"],
      Slash: ["-", "_"],
      NonusBackslash: ["<", ">", "|"],
    },
  },
];

export const DEFAULT_LOCALE_ID = "us";

const isLetterCode = (code: HidKeyCode): boolean => /^[A-Z]$/.test(code);

function keyChars(locale: KeyboardLocale, code: HidKeyCode): KeyChars | null {
  const entry = locale.keys[code] ?? US_KEYS[code];
  if (entry) return entry;
  if (isLetterCode(code)) return [code.toLowerCase()];
  return null;
}

/** The character a keystroke produces under this locale, or null for
 *  non-character keys and modifier combinations the locale doesn't define. */
export function characterFor(
  locale: KeyboardLocale,
  code: HidKeyCode,
  shift: boolean,
  altgr = false,
): string | null {
  const entry = keyChars(locale, code);
  if (!entry) return null;
  const [base, shifted, alt, shiftAlt] = entry;
  if (altgr) return (shift ? shiftAlt : alt) ?? null;
  if (!shift) return base;
  if (shifted !== undefined) return shifted;
  // Single-letter base with no explicit shift entry: shift uppercases.
  const upper = base.toUpperCase();
  return base.length === 1 && upper !== base ? upper : null;
}

/** Keycap-style label: the base character, uppercased when the key behaves
 *  like a letter key (its shift character is just the uppercase base). */
export function keycapCharacter(locale: KeyboardLocale, code: HidKeyCode): string | null {
  const base = characterFor(locale, code, false);
  if (base === null) return null;
  const shifted = characterFor(locale, code, true);
  const upper = base.toUpperCase();
  return shifted === upper && upper !== base ? upper : base;
}

export interface Keystroke {
  code: HidKeyCode;
  shift: boolean;
  altgr: boolean;
}

const reverseCache = new Map<string, Map<string, Keystroke>>();

function reverseIndex(locale: KeyboardLocale): Map<string, Keystroke> {
  const cached = reverseCache.get(locale.id);
  if (cached) return cached;
  const index = new Map<string, Keystroke>();
  const codes = new Set<HidKeyCode>([
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
    ...Object.keys(US_KEYS),
    ...Object.keys(locale.keys),
  ] as HidKeyCode[]);
  // Simpler keystrokes win: base, then shift, then AltGr layers.
  const layers: Array<[boolean, boolean]> = [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ];
  for (const [shift, altgr] of layers) {
    for (const code of codes) {
      const character = characterFor(locale, code, shift, altgr);
      if (character !== null && !index.has(character)) {
        index.set(character, { code, shift, altgr });
      }
    }
  }
  reverseCache.set(locale.id, index);
  return index;
}

/** Resolve a character to the keystroke that types it under this locale. */
export function keystrokeForCharacter(
  locale: KeyboardLocale,
  character: string,
): Keystroke | null {
  return reverseIndex(locale).get(character) ?? null;
}

/** The modifier combination a keystroke's shift/AltGr layers require. */
export function keystrokeModifiers(stroke: Keystroke): ModifierCombination {
  return {
    left_ctrl: false,
    left_shift: stroke.shift,
    left_alt: false,
    left_gui: false,
    right_ctrl: false,
    right_shift: false,
    right_alt: stroke.altgr,
    right_gui: false,
  };
}

// --- Active-locale store -----------------------------------------------------

const STORAGE_KEY = "rynk:locale";

function storedLocaleId(): string {
  try {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored !== null && LOCALES.some((locale) => locale.id === stored)) return stored;
  } catch {
    // Storage access can throw in privacy modes; fall through to the default.
  }
  return DEFAULT_LOCALE_ID;
}

let activeId = storedLocaleId();
const listeners = new Set<() => void>();

export function getLocaleId(): string {
  return activeId;
}

export function activeLocale(): KeyboardLocale {
  return LOCALES.find((locale) => locale.id === activeId) ?? LOCALES[0];
}

export function setLocaleId(id: string): void {
  if (id === activeId || !LOCALES.some((locale) => locale.id === id)) return;
  activeId = id;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Best-effort persistence only.
  }
  for (const listener of listeners) listener();
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
