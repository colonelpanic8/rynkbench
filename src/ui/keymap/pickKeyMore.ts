// Pick Key's All keys: every key RMK has (model/hid-codes.ts) that the main
// groups do not show, in groups by what it is for, then the lighting and
// keyboard controls the Device group leaves out. A key RMK adds lands in Other
// keys until it is given a group, so the picker never misses one. No React.

import type { Action, HidKeyCode } from "../../model/action-types";
import { HID_CODES, NOT_KEYS } from "../../model/hid-codes";
import { LIGHT_ACTIONS, SYSTEM_ACTIONS } from "./action-catalog";
import { actionTile, keyTile, type Tile, type TileGroup } from "./pickTiles";

const numbered = (prefix: string, label: string, count: number) =>
  Array.from({ length: count }, (_, i): [HidKeyCode, string] => [`${prefix}${i + 1}` as HidKeyCode, `${label} ${i + 1}`]);

/** [id, name, [code, label, more words to find it by]…], in the order shown. */
const GROUPS: Array<[string, string, Array<[HidKeyCode, string, string?]>]> = [
  ["apps", "Apps & browser", [
    ["Calculator", "Calculator"], ["Mail", "Mail", "email"], ["MyComputer", "My Computer", "files explorer finder"],
    ["ControlPanel", "Control Panel", "settings"], ["Assistant", "Assistant", "siri cortana voice"],
    ["MissionControl", "Mission Control", "mac expose"], ["Launchpad", "Launchpad", "mac"],
    ["WwwSearch", "Browser Search", "www web"], ["WwwHome", "Browser Home", "www web"], ["WwwBack", "Browser Back", "www web"],
    ["WwwForward", "Browser Forward", "www web"], ["WwwRefresh", "Browser Refresh", "www web reload"],
    ["WwwStop", "Browser Stop", "www web"], ["WwwFavorites", "Browser Favorites", "www web bookmarks"],
  ]],
  // The app commands computers act on today (consumer page); the old keyboard-page keys below them.
  ["editing", "Editing & files", [
    ["AcUndo", "Undo"], ["AcRedo", "Redo"], ["AcCut", "Cut"], ["AcCopy", "Copy"], ["AcPaste", "Paste"],
    ["AcFind", "Find", "search"], ["AcNew", "New"], ["AcOpen", "Open"], ["AcSave", "Save"], ["AcPrint", "Print"],
    ["AcClose", "Close"], ["AcExit", "Quit", "exit"], ["AcProperties", "Properties"],
  ]],
  ["old-editing", "Keyboard editing keys", [
    ["Undo", "Undo key"], ["Cut", "Cut key"], ["Copy", "Copy key"], ["Paste", "Paste key"], ["Find", "Find key", "search"],
    ["Again", "Again", "redo repeat"], ["Help", "Help"], ["Menu", "Menu key"], ["Select", "Select"],
    ["Execute", "Execute"], ["Stop", "Stop"],
  ]],
  ["more-media", "More media & system", [
    ["MediaPlay", "Play"], ["MediaPause", "Pause media", "music"], ["MediaFastForward", "Fast Forward"], ["MediaRewind", "Rewind"],
    ["MediaRepeat", "Repeat"], ["MediaRandomPlay", "Shuffle", "random"], ["MediaStopEject", "Stop/Eject"],
    ["MediaSelect", "Media Select"], ["MediaEject", "Eject"],
    ["SnapShot", "Screenshot", "snapshot print screen"], ["ScreenLock", "Lock Screen", "lock"],
    ["NextKeyboardLayoutSelect", "Next Keyboard Layout", "language input switch"],
    ["BrightnessMinimum", "Brightness Min", "screen"], ["BrightnessMaximum", "Brightness Max", "screen"],
    ["BrightnessAuto", "Brightness Auto", "screen"],
    ["KbMute", "Mute (keyboard)", "volume"], ["KbVolumeDown", "Volume − (keyboard)"], ["KbVolumeUp", "Volume + (keyboard)"],
    ["SystemPower", "Power", "off"], ["SystemSleep", "Sleep", "suspend"], ["SystemWake", "Wake"], ["KbPower", "Power (keyboard)"],
  ]],
  ["mouse-buttons", "More mouse buttons", numbered("MouseBtn", "Mouse Button", 8).slice(5).map(([code, label]) => [code, label, "mouse click"])],
  ["international", "International & Language", [
    ...numbered("International", "International", 9).map(([code, label]): [HidKeyCode, string, string] => [code, label, "intl ro yen henkan japanese"]),
    ...numbered("Language", "Language", 9).map(([code, label]): [HidKeyCode, string, string] => [code, label, "lang hangul hanja ime korean"]),
  ]],
  ["more-numpad", "More numpad keys", [["KpComma", "Num ,", "keypad"], ["KpEqualAs400", "Num = (AS/400)", "keypad"]]],
  ["locking", "Locking keys", [
    ["LockingCapsLock", "Locking Caps Lock"], ["LockingNumLock", "Locking Num Lock"], ["LockingScrollLock", "Locking Scroll Lock"],
  ]],
];

/** "SystemRequest" → "System Request": a readable name for a key without a label of its own. */
const spaced = (code: string) => code.replace(/([a-z])([A-Z0-9])/g, "$1 $2");

const tileOf = ([code, label, search]: [HidKeyCode, string, string?]) => keyTile(code, label, search);

/** What a tile is, for telling whether it is already shown: the key it presses (a
 *  character's key with or without Shift), else its id. */
function identity(tile: Tile): string {
  const action = tile.action;
  if (typeof action === "object" && "Key" in action && typeof action.Key === "object" && "Hid" in action.Key) return `key:${action.Key.Hid}`;
  if (typeof action === "object" && "KeyWithModifier" in action) return `key:${action.KeyWithModifier[0]}`;
  return tile.id;
}

/** All keys: what the main groups leave out. */
export function moreGroups(main: readonly TileGroup[]): TileGroup[] {
  const shown = new Set(main.flatMap((group) => group.tiles).map(identity));
  const fresh = (tiles: Tile[]) =>
    tiles.filter((tile) => {
      if (shown.has(identity(tile))) return false;
      shown.add(identity(tile));
      return true;
    });
  const groups: TileGroup[] = GROUPS.map(([id, name, keys]) => ({ id: `more-${id}`, name, tiles: fresh(keys.map(tileOf)) }));
  // Every other key, by its name.
  const rest = HID_CODES.filter((code) => !NOT_KEYS.has(code)).map((code) => keyTile(code, spaced(code), "key"));
  groups.push({ id: "more-keys", name: "Other keys", tiles: fresh(rest) });
  groups.push({
    id: "more-lighting",
    name: "More lighting",
    tiles: fresh(LIGHT_ACTIONS.map((item) => actionTile(`light:${item.id}`, item.label, { Light: item.id } as Action, `${item.hint} lighting rgb`))),
  });
  groups.push({
    id: "more-controls",
    name: "More keyboard controls",
    tiles: fresh(SYSTEM_ACTIONS.map((item) => actionTile(`control:${item.id}`, item.label, { KeyboardControl: item.id } as Action, item.hint))),
  });
  return groups.filter((group) => group.tiles.length > 0);
}
