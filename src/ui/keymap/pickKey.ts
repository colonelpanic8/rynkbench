// Pick Key's tiles, as GLIDE groups them for people who are not keyboard
// experts: what most people put on a key first, in words they know (Letters,
// Numbers, Symbols, Navigation, Media …), and everything else under All keys.
// Letters, Numbers and Symbols come from the OS keyboard layout, one tile per
// character (a lilac one needs Shift or AltGr); the tile still binds the key
// as pressed. Modifiers read as the computer names them. Every other key RMK
// has is under All keys (pickKeyMore.ts); searching (pickSearch.ts) also finds
// layers and your behaviors. No React.

import type { Action, HidKeyCode } from "../../model/action-types";
import {
  DIGIT_CODES,
  LETTER_CODES,
  NON_US,
  PUNCTUATION_CODES,
  actionTile,
  isTapPattern,
  keyTile,
  type Tile,
  type TileGroup,
} from "./pickTiles";
import { characterFor, type KeyboardLocale } from "../locale";
import type { Os } from "../preferences";
import { modifierLook } from "../keyface/modifiers";
import { noModifiers } from "../../model/slots";
import { pickedHidAction } from "./actions";
import { LIGHT_ACTIONS, SYSTEM_ACTIONS } from "./action-catalog";
import { moreGroups } from "./pickKeyMore";

export { isTapPattern, type Pick, type Tile, type TileGroup } from "./pickTiles";
export { behaviorEntries, behaviorTiles, layerTiles, searchTiles, type BehaviorEntry } from "./pickSearch";

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
  board: { userActions?: readonly { id: number; label: string; hint?: string }[]; os?: Os } = {},
): { main: TileGroup[]; more: TileGroup[] } {
  const chars = characterGroups(locale);
  const os = board.os ?? "win";
  const word = (modifier: "ctrl" | "alt" | "gui") => modifierLook(modifier, os).word;
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
        keyTile("LCtrl", `Left ${word("ctrl")}`, "control"),
        keyTile("LAlt", `Left ${word("alt")}`, "alt option"),
        keyTile("LGui", `Left ${word("gui")}`, "gui super command windows meta"),
        keyTile("RShift", "Right Shift"),
        keyTile("RCtrl", `Right ${word("ctrl")}`, "control"),
        keyTile("RAlt", `Right ${word("alt")}`, "alt option altgr"),
        keyTile("RGui", `Right ${word("gui")}`, "gui super command windows meta"),
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
        ...cluster("Move", [
          keyTile("MouseUp", "Move ↑", "mouse"),
          keyTile("MouseDown", "Move ↓", "mouse"),
          keyTile("MouseLeft", "Move ←", "mouse"),
          keyTile("MouseRight", "Move →", "mouse"),
        ]),
        ...cluster("Click", [
          keyTile("MouseBtn1", "Left Click", "mouse button 1"),
          keyTile("MouseBtn2", "Right Click", "mouse button 2"),
          keyTile("MouseBtn3", "Middle Click", "mouse button 3"),
          keyTile("MouseBtn4", "Back", "mouse button 4"),
          keyTile("MouseBtn5", "Forward", "mouse button 5"),
        ]),
        ...cluster("Scroll", [
          keyTile("MouseWheelUp", "Scroll ↑", "mouse wheel"),
          keyTile("MouseWheelDown", "Scroll ↓", "mouse wheel"),
          keyTile("MouseWheelLeft", "Scroll ←", "mouse wheel"),
          keyTile("MouseWheelRight", "Scroll →", "mouse wheel"),
        ]),
        // While held, the pointer and wheel move at a fixed speed: 1 the slowest.
        ...cluster("Speed while held", [
          keyTile("MouseAccel0", "Speed 1", "mouse acceleration accel0 slow"),
          keyTile("MouseAccel1", "Speed 2", "mouse acceleration accel1"),
          keyTile("MouseAccel2", "Speed 3", "mouse acceleration accel2 fast"),
        ]),
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

  return { main, more: moreGroups(main) };
}

/** What a picker is filling: a whole key (the key editor, a combo's output), one
 *  slot of a behavior (a tap-hold slot, a tap pattern's action) or a plain key (a
 *  macro step, a pointing key), which takes no modifiers, characters that need
 *  them, layers or actions. */
export type PickScope = "key" | "slot" | "keycode";

/** The HID key a tile presses on its own, if that is all it does. */
export function plainKey(tile: Tile): HidKeyCode | null {
  const action = tile.action;
  return typeof action === "object" && "Key" in action && typeof action.Key === "object" && "Hid" in action.Key
    ? action.Key.Hid
    : null;
}

/** The tiles a scope offers: "Transparent" and tap patterns are a whole key's. */
export function offeredIn(scope: PickScope): (tile: Tile) => boolean {
  if (scope === "keycode") return (tile) => plainKey(tile) !== null;
  if (scope === "slot") return (tile) => tile.action !== "Transparent" && !isTapPattern(tile.action);
  return () => true;
}

/** The groups with only what a scope offers, empty groups left out. */
export function narrowTo(groups: readonly TileGroup[], scope: PickScope): TileGroup[] {
  const offered = offeredIn(scope);
  return groups.map((group) => ({ ...group, tiles: group.tiles.filter(offered) })).filter((group) => group.tiles.length > 0);
}
