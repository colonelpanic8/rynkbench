// Every HID key RMK has (rmk-types keycode/hid.rs), in its order: what Pick
// Key's All keys draws from, so no key is missing from the picker. The four
// report codes before A (No, ErrorRollover, PostFail, ErrorUndefined) are not
// keys anyone binds. Pure.

import type { HidKeyCode } from "./action-types";

export const HID_CODES = [
  "No", "ErrorRollover", "PostFail", "ErrorUndefined",
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
  "Kc1", "Kc2", "Kc3", "Kc4", "Kc5", "Kc6", "Kc7", "Kc8", "Kc9", "Kc0",
  "Enter", "Escape", "Backspace", "Tab", "Space", "Minus", "Equal",
  "LeftBracket", "RightBracket", "Backslash", "NonusHash", "Semicolon",
  "Quote", "Grave", "Comma", "Dot", "Slash", "CapsLock",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
  "PrintScreen", "ScrollLock", "Pause", "Insert", "Home", "PageUp",
  "Delete", "End", "PageDown", "Right", "Left", "Down", "Up",
  "NumLock", "KpSlash", "KpAsterisk", "KpMinus", "KpPlus", "KpEnter",
  "Kp1", "Kp2", "Kp3", "Kp4", "Kp5", "Kp6", "Kp7", "Kp8", "Kp9", "Kp0",
  "KpDot", "NonusBackslash", "Application", "KbPower", "KpEqual",
  "F13", "F14", "F15", "F16", "F17", "F18", "F19", "F20", "F21", "F22", "F23", "F24",
  "Execute", "Help", "Menu", "Select", "Stop", "Again", "Undo", "Cut",
  "Copy", "Paste", "Find", "KbMute", "KbVolumeUp", "KbVolumeDown",
  "LockingCapsLock", "LockingNumLock", "LockingScrollLock",
  "KpComma", "KpEqualAs400",
  "International1", "International2", "International3", "International4",
  "International5", "International6", "International7", "International8", "International9",
  "Language1", "Language2", "Language3", "Language4", "Language5",
  "Language6", "Language7", "Language8", "Language9",
  "AlternateErase", "SystemRequest", "Cancel", "Clear", "Prior", "Return",
  "Separator", "Out", "Oper", "ClearAgain", "Crsel", "Exsel",
  "SystemPower", "SystemSleep", "SystemWake",
  "AudioMute", "AudioVolUp", "AudioVolDown",
  "MediaNextTrack", "MediaPrevTrack", "MediaStop", "MediaPlayPause",
  "MediaSelect", "MediaEject", "Mail", "Calculator", "MyComputer",
  "WwwSearch", "WwwHome", "WwwBack", "WwwForward", "WwwStop", "WwwRefresh",
  "WwwFavorites", "MediaFastForward", "MediaRewind",
  "BrightnessUp", "BrightnessDown", "ControlPanel", "Assistant",
  "MissionControl", "Launchpad",
  "MouseUp", "MouseDown", "MouseLeft", "MouseRight",
  "MouseBtn1", "MouseBtn2", "MouseBtn3", "MouseBtn4", "MouseBtn5",
  "MouseBtn6", "MouseBtn7", "MouseBtn8",
  "MouseWheelUp", "MouseWheelDown", "MouseWheelLeft", "MouseWheelRight",
  "MouseAccel0", "MouseAccel1", "MouseAccel2",
  "LCtrl", "LShift", "LAlt", "LGui", "RCtrl", "RShift", "RAlt", "RGui",
  "AcRedo", "SnapShot", "MediaPlay", "MediaPause", "MediaRandomPlay", "MediaRepeat", "MediaStopEject",
  "ScreenLock", "AcNew", "AcOpen", "AcClose", "AcExit", "AcSave", "AcPrint", "AcProperties",
  "AcUndo", "AcCopy", "AcCut", "AcPaste", "AcFind", "NextKeyboardLayoutSelect",
  "BrightnessMinimum", "BrightnessMaximum", "BrightnessAuto",
] as const satisfies readonly HidKeyCode[];

// A key RMK adds and this list lacks fails the typecheck here.
type Missing = Exclude<HidKeyCode, (typeof HID_CODES)[number]>;
const complete: [Missing] extends [never] ? true : Missing = true;
void complete;

/** The report codes that are not keys. */
export const NOT_KEYS: ReadonlySet<HidKeyCode> = new Set<HidKeyCode>(["No", "ErrorRollover", "PostFail", "ErrorUndefined"]);
