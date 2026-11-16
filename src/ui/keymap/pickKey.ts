// Pick Key's tiles, as GLIDE groups them for people who are not keyboard
// experts: what most people put on a key first, in words they know (Letters,
// Numbers, Symbols, Navigation, Media …), and everything else under All keys.
// Letters, Numbers and Symbols come from the OS keyboard layout, one tile per
// character (a lilac one needs Shift or AltGr); the tile still binds the key
// as pressed. Searching also finds layers. No React.

import type { Action, HidKeyCode } from "../../model/action-types";
import { characterFor, type KeyboardLocale } from "../locale";
import { hidLabel } from "../labels";
import { noModifiers } from "../../model/slots";
import { pickedHidAction } from "./actions";
import { LIGHT_ACTIONS, SYSTEM_ACTIONS } from "./action-catalog";

export interface Tile {
  /** Unique within the picker. */
  id: string;
  label: string;
  /** What the tile puts in the slot; "Transparent" falls through to the layer below. */
  action: Action | "Transparent";
  /** More words to find it by (lowercase). */
  search: string;
  /** It needs Shift or AltGr to type its character. */
  lilac?: boolean;
  /** The small caption it sits under inside its group. */
  cluster?: string;
}

export interface TileGroup {
  id: string;
  name: string;
  /** The quick link's word, for the groups people look for first. */
  chip?: string;
  tiles: Tile[];
}

const LETTER_CODES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("") as HidKeyCode[];
const DIGIT_CODES: HidKeyCode[] = ["Kc1", "Kc2", "Kc3", "Kc4", "Kc5", "Kc6", "Kc7", "Kc8", "Kc9", "Kc0"];
const PUNCTUATION_CODES: HidKeyCode[] = [
  "Minus",
  "Equal",
  "LeftBracket",
  "RightBracket",
  "Backslash",
  "Semicolon",
  "Quote",
  "Grave",
  "Comma",
  "Dot",
  "Slash",
];
const NON_US: HidKeyCode[] = ["NonusBackslash", "NonusHash"];

// Symbols in small clusters, so the eye finds one without first deciding
// whether it is "punctuation" or "math".
const SYMBOL_CLUSTERS: Array<[string, string]> = [
  ["Punctuation", ".,;:!?¡¿…"],
  ["Quotes & dashes", "'\"`´-_~«»„“”‘’‚‹›¨"],
  ["Brackets", "()[]{}<>"],
  ["Math", "+*/=%^±×÷°·√"],
  ["Other", ""],
];
const clusterOf = (text: string) =>
  (SYMBOL_CLUSTERS.find(([, chars]) => chars.includes(text)) ?? SYMBOL_CLUSTERS[SYMBOL_CLUSTERS.length - 1])[0];

function keyTile(code: HidKeyCode, label?: string, search = ""): Tile {
  return {
    id: `key:${code}`,
    label: label ?? hidLabel(code),
    action: { Key: { Hid: code } } as Action,
    search: `${code} ${label ?? ""} ${hidLabel(code)} ${search}`.toLowerCase(),
  };
}

function actionTile(id: string, label: string, action: Action | "Transparent", search = ""): Tile {
  return { id, label, action, search: `${label} ${search}`.toLowerCase() };
}

/** Every distinct character the layout types (plain, then Shift, then AltGr),
 *  as Letters, Numbers and Symbols. */
function characterGroups(locale: KeyboardLocale): Record<"letters" | "numbers" | "symbols", Tile[]> {
  const seen = new Set<string>();
  const found = { letters: [] as Tile[], numbers: [] as Tile[], symbols: [] as Tile[] };
  const states: Array<[boolean, boolean, HidKeyCode[]]> = [
    [false, false, [...LETTER_CODES, ...DIGIT_CODES, ...PUNCTUATION_CODES]],
    [true, false, [...LETTER_CODES, ...DIGIT_CODES, ...PUNCTUATION_CODES]],
    [false, true, [...LETTER_CODES, ...DIGIT_CODES, ...PUNCTUATION_CODES]],
    [false, false, NON_US],
    [true, false, NON_US],
    [false, true, NON_US],
  ];
  // A letter key is one tile, labelled as its keycap (the capital) and bound to
  // the key itself, as GLIDE shows it: its Shift capital is not a second tile.
  const isLetterKey = (code: HidKeyCode) => {
    const plain = characterFor(locale, code, false);
    return plain !== null && plain.toUpperCase() !== plain && characterFor(locale, code, true) === plain.toUpperCase();
  };
  for (const [shift, altgr, codes] of states) {
    for (const code of codes) {
      const letterKey = isLetterKey(code);
      if (letterKey && shift && !altgr) continue;
      const text =
        letterKey && !altgr ? characterFor(locale, code, true) : characterFor(locale, code, shift, altgr);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      const mods = { ...noModifiers(), left_shift: shift, right_alt: altgr };
      const tile: Tile = {
        id: `char:${text}`,
        label: text,
        action: pickedHidAction(code, mods),
        lilac: shift || altgr,
        search: `${text} ${code}`.toLowerCase(),
      };
      // Letters are letters in any script; a currency sign is a symbol.
      const group = /^[0-9]$/.test(text) ? "numbers" : /\p{L}/u.test(text) && !/\p{Sc}/u.test(text) ? "letters" : "symbols";
      found[group].push(tile);
    }
  }
  found.letters.sort((a, b) => a.label.localeCompare(b.label));
  found.numbers.sort((a, b) => a.label.localeCompare(b.label));
  const rank = (tile: Tile) => SYMBOL_CLUSTERS.findIndex(([name]) => name === clusterOf(tile.label));
  found.symbols = found.symbols
    .map((tile, index) => ({ tile: { ...tile, cluster: clusterOf(tile.label) }, index }))
    .sort((a, b) => rank(a.tile) - rank(b.tile) || a.index - b.index)
    .map(({ tile }) => tile);
  return found;
}

const control = (id: string) => {
  const item = SYSTEM_ACTIONS.find((entry) => entry.id === id);
  return item ? actionTile(`control:${id}`, item.label, { KeyboardControl: item.id } as Action, item.hint) : null;
};
const present = (tiles: Array<Tile | null>) => tiles.filter((tile): tile is Tile => tile !== null);

/** The groups, in the order most people need them, then All keys. */
export function pickKeyGroups(
  locale: KeyboardLocale,
  board: { userActions?: readonly { id: number; label: string; hint?: string }[] } = {},
): { main: TileGroup[]; more: TileGroup[] } {
  const chars = characterGroups(locale);
  const cluster = (name: string, tiles: Tile[]) => tiles.map((tile) => ({ ...tile, cluster: name }));
  const main: TileGroup[] = [
    { id: "letters", name: "Letters", chip: "Letters", tiles: chars.letters },
    { id: "numbers", name: "Numbers", chip: "Numbers", tiles: chars.numbers },
    { id: "symbols", name: "Symbols", chip: "Symbols", tiles: chars.symbols },
    {
      id: "essentials",
      name: "Typing essentials",
      tiles: [
        keyTile("Enter", "Enter", "return newline"),
        keyTile("Space", "Space", "spacebar"),
        keyTile("Tab", "Tab"),
        keyTile("Backspace", "Backspace", "bksp delete back"),
        keyTile("Delete", "Delete", "del forward"),
        keyTile("Escape", "Esc", "escape"),
        keyTile("Insert", "Insert", "ins"),
      ],
    },
    {
      id: "modifiers",
      name: "Modifiers",
      tiles: [
        keyTile("LShift", "Left Shift"),
        keyTile("LCtrl", "Left Ctrl", "control"),
        keyTile("LAlt", "Left Alt", "option"),
        keyTile("LGui", "Left ⌘/Win", "gui super command windows meta"),
        keyTile("RShift", "Right Shift"),
        keyTile("RCtrl", "Right Ctrl", "control"),
        keyTile("RAlt", "Right Alt", "option altgr"),
        keyTile("RGui", "Right ⌘/Win", "gui super command windows meta"),
      ],
    },
    {
      id: "navigation",
      name: "Navigation",
      chip: "Navigation",
      tiles: [
        keyTile("Up", "↑ Up", "arrow"),
        keyTile("Down", "↓ Down", "arrow"),
        keyTile("Left", "← Left", "arrow"),
        keyTile("Right", "→ Right", "arrow"),
        keyTile("Home", "Home"),
        keyTile("End", "End"),
        keyTile("PageUp", "Page Up", "pgup"),
        keyTile("PageDown", "Page Down", "pgdn"),
      ],
    },
    {
      id: "toggles",
      name: "Toggle keys",
      chip: "Toggle",
      tiles: present([
        keyTile("CapsLock", "Caps Lock"),
        keyTile("NumLock", "Num Lock"),
        keyTile("ScrollLock", "Scroll Lock"),
        control("CapsWordToggle"),
      ]),
    },
    {
      id: "media",
      name: "Media",
      chip: "Media",
      tiles: [
        keyTile("MediaPlayPause", "Play/Pause", "music"),
        keyTile("MediaPrevTrack", "Previous", "track"),
        keyTile("MediaNextTrack", "Next", "track skip"),
        keyTile("MediaStop", "Stop"),
        keyTile("AudioMute", "Mute", "volume"),
        keyTile("AudioVolDown", "Volume −", "quieter"),
        keyTile("AudioVolUp", "Volume +", "louder"),
        keyTile("BrightnessDown", "Brightness −", "screen"),
        keyTile("BrightnessUp", "Brightness +", "screen"),
      ],
    },
    {
      id: "fkeys",
      name: "Fn keys",
      chip: "Fn Keys",
      tiles: Array.from({ length: 24 }, (_, i) => keyTile(`F${i + 1}` as HidKeyCode, `F${i + 1}`, "function")),
    },
    {
      id: "mouse",
      name: "Mouse",
      tiles: [
        keyTile("MouseUp", "Move ↑", "mouse"),
        keyTile("MouseDown", "Move ↓", "mouse"),
        keyTile("MouseLeft", "Move ←", "mouse"),
        keyTile("MouseRight", "Move →", "mouse"),
        keyTile("MouseBtn1", "Left Click", "mouse button 1"),
        keyTile("MouseBtn2", "Right Click", "mouse button 2"),
        keyTile("MouseBtn3", "Middle Click", "mouse button 3"),
        keyTile("MouseWheelUp", "Scroll ↑", "mouse wheel"),
        keyTile("MouseWheelDown", "Scroll ↓", "mouse wheel"),
      ],
    },
    {
      id: "device",
      name: "Device",
      chip: "Device",
      tiles: [
        ...cluster(
          "Bluetooth & USB",
          present([control("OutputUsb"), control("OutputBluetooth")]),
        ),
        ...cluster(
          "Lighting",
          LIGHT_ACTIONS.slice(0, 7).map((item) =>
            actionTile(`light:${item.id}`, item.label, { Light: item.id } as Action, `${item.hint} lighting rgb`),
          ),
        ),
        ...cluster(
          "This keyboard",
          (board.userActions ?? []).map((item) =>
            actionTile(`user:${item.id}`, item.label, { User: item.id } as Action, item.hint ?? ""),
          ),
        ),
        ...cluster(
          "System",
          present([
            control("ComboToggle"),
            control("Bootloader"),
            control("Reboot"),
          ]),
        ),
      ],
    },
    {
      id: "special",
      name: "Special",
      tiles: [
        actionTile("transparent", "▽ Same as layer below", "Transparent", "transparent trans"),
        actionTile("none", "∅ Does nothing", "No", "none nothing blank"),
        keyTile("PrintScreen", "Print Screen", "screenshot sysrq"),
        keyTile("Pause", "Pause", "break"),
        keyTile("Application", "Menu", "app context"),
      ],
    },
    {
      id: "numpad",
      name: "Numpad",
      tiles: [
        keyTile("KpSlash", "Num /", "keypad divide"),
        keyTile("KpAsterisk", "Num *", "keypad multiply"),
        keyTile("KpMinus", "Num −", "keypad"),
        keyTile("KpPlus", "Num +", "keypad"),
        keyTile("KpEnter", "Num Enter", "keypad"),
        ...Array.from({ length: 9 }, (_, i) => keyTile(`Kp${i + 1}` as HidKeyCode, `Num ${i + 1}`, "keypad")),
        keyTile("Kp0", "Num 0", "keypad"),
        keyTile("KpDot", "Num .", "keypad decimal"),
        keyTile("KpEqual", "Num =", "keypad"),
      ],
    },
  ].filter((group) => group.tiles.length > 0);

  const more: TileGroup[] = [
    {
      id: "more-system",
      name: "Power & sleep",
      tiles: [
        keyTile("SystemPower", "Power", "off"),
        keyTile("SystemSleep", "Sleep", "suspend"),
        keyTile("SystemWake", "Wake"),
        keyTile("MissionControl", "Mission Control", "mac expose"),
        keyTile("Launchpad", "Launchpad", "mac"),
        keyTile("MediaEject", "Eject"),
      ],
    },
    {
      id: "more-lighting",
      name: "More lighting",
      tiles: LIGHT_ACTIONS.slice(7).map((item) =>
        actionTile(`light:${item.id}`, item.label, { Light: item.id } as Action, `${item.hint} lighting rgb`),
      ),
    },
    {
      id: "more-system-controls",
      name: "More keyboard controls",
      tiles: SYSTEM_ACTIONS.filter(
        (item) => !["OutputUsb", "OutputBluetooth", "CapsWordToggle", "ComboToggle", "Bootloader", "Reboot"].includes(item.id),
      ).map((item) => actionTile(`control:${item.id}`, item.label, { KeyboardControl: item.id } as Action, item.hint)),
    },
    {
      id: "more-keys",
      name: "Other keyboard keys",
      tiles: [...PUNCTUATION_CODES, ...NON_US].map((code) => keyTile(code, undefined, "key")),
    },
  ].filter((group) => group.tiles.length > 0);

  return { main, more };
}

/** Layer tiles for a search: hold, toggle or switch to each layer whose name matches. */
export function layerTiles(layers: Array<{ index: number; name: string }>, query: string): TileGroup | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const tiles = layers
    .filter((layer) => `${layer.name} layer ${layer.index}`.toLowerCase().includes(q))
    .flatMap((layer) => [
      actionTile(`layer-on:${layer.index}`, `While held: ${layer.name}`, { LayerOn: layer.index } as Action, ""),
      actionTile(`layer-toggle:${layer.index}`, `Toggle ${layer.name}`, { LayerToggle: layer.index } as Action, ""),
      actionTile(`layer-to:${layer.index}`, `Switch to ${layer.name}`, { LayerToggleOnly: layer.index } as Action, ""),
    ]);
  return tiles.length > 0 ? { id: "layers", name: "Layers", tiles } : null;
}

/** The groups narrowed to a search: every word must appear; All keys results
 *  are marked as coming from there. */
export function searchTiles(groups: { main: TileGroup[]; more: TileGroup[] }, query: string): TileGroup[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return groups.main;
  const exact = query.trim();
  const match = (tile: Tile) =>
    tile.label === exact || terms.every((term) => tile.search.includes(term) || tile.label.toLowerCase().includes(term));
  const narrowed = (list: TileGroup[]) =>
    list.map((group) => ({ ...group, tiles: group.tiles.filter(match) })).filter((group) => group.tiles.length > 0);
  // A typed character first: the tile that types exactly it.
  const all = [...narrowed(groups.main), ...narrowed(groups.more).map((group) => ({ ...group, name: `All keys · ${group.name}` }))];
  const exactTile = all.flatMap((group) => group.tiles).find((tile) => tile.label === exact);
  return exactTile
    ? [{ id: "exact", name: "Best match", tiles: [exactTile] }, ...all.map((g) => ({ ...g, tiles: g.tiles.filter((t) => t !== exactTile) })).filter((g) => g.tiles.length)]
    : all;
}
