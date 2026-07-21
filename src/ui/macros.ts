// RMK macro byte-region codec. Pure functions, no React.
//
// Format (rmk/src/keyboard_macros.rs): the flat region is a series of
// 0x00-terminated op sequences packed back-to-back; macro n is the nth
// sequence. Ops:
//   0x00            — end of macro
//   0x01 0x01 kc    — Tap    (kc = low byte of the HID keycode)
//   0x01 0x02 kc    — Press
//   0x01 0x03 kc    — Release
//   0x01 0x04 b1 b2 — Delay; the firmware decodes
//                     ms = (max(b1,1)-1) + (max(b2,1)-1)*255
//   anything else   — one ASCII character, typed via from_ascii (en-US)
//
// Note: RMK's own `serialize` writes Delay as a big-endian u16, which its
// decoder would misread; we encode to match the *decoder*, since that is
// what executes at runtime (and it matches Vial's encoding).

import type { HidKeyCode } from "../vendor/rynk-wasm/rynk_wasm";

/* ------------------------------------------------------------------ */
/* HID keycode numeric values (rmk-types keycode/hid.rs)               */
/* ------------------------------------------------------------------ */

// 0x00..0xC2 are contiguous in declaration order; mouse block resumes at 0xCD.
const HID_ORDER_LOW: HidKeyCode[] = [
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
];

const HID_ORDER_HIGH: HidKeyCode[] = [
  "MouseUp", "MouseDown", "MouseLeft", "MouseRight",
  "MouseBtn1", "MouseBtn2", "MouseBtn3", "MouseBtn4", "MouseBtn5",
  "MouseBtn6", "MouseBtn7", "MouseBtn8",
  "MouseWheelUp", "MouseWheelDown", "MouseWheelLeft", "MouseWheelRight",
  "MouseAccel0", "MouseAccel1", "MouseAccel2",
  "LCtrl", "LShift", "LAlt", "LGui", "RCtrl", "RShift", "RAlt", "RGui",
];

const HID_VALUE = new Map<HidKeyCode, number>();
const HID_NAME = new Map<number, HidKeyCode>();
HID_ORDER_LOW.forEach((name, i) => {
  HID_VALUE.set(name, i);
  HID_NAME.set(i, name);
});
HID_ORDER_HIGH.forEach((name, i) => {
  HID_VALUE.set(name, 0xcd + i);
  HID_NAME.set(0xcd + i, name);
});

export function hidValue(code: HidKeyCode): number {
  return HID_VALUE.get(code) ?? 0;
}

export function hidFromValue(value: number): HidKeyCode {
  return HID_NAME.get(value) ?? "No";
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

export type MacroStep =
  | { kind: "text"; text: string }
  | { kind: "tap"; code: HidKeyCode }
  | { kind: "press"; code: HidKeyCode }
  | { kind: "release"; code: HidKeyCode }
  | { kind: "delay"; ms: number };

export interface DecodedMacro {
  steps: MacroStep[];
}

/** Characters the firmware's from_ascii understands (en-US). */
const TEXT_OK = /^[0-9a-zA-Z!@#$%^&*()\-_=+[\]{};:'"`~\\|,<.>/? \n\t]*$/;

export function isEncodableText(text: string): boolean {
  return TEXT_OK.test(text);
}

const MAX_DELAY_MS = 254 + 254 * 255; // what the two-byte scheme can carry

export function clampDelay(ms: number): number {
  return Math.max(0, Math.min(MAX_DELAY_MS, Math.round(ms)));
}

function stepBytes(step: MacroStep): number[] {
  switch (step.kind) {
    case "text":
      return [...step.text].map((ch) => {
        const b = ch.charCodeAt(0);
        // 0x00/0x01 would collide with op-codes; from_ascii maps them to No
        // anyway, so refuse them here (isEncodableText already excludes them).
        return b > 1 && b < 128 ? b : 0x20;
      });
    case "tap":
      return [0x01, 0x01, hidValue(step.code) & 0xff];
    case "press":
      return [0x01, 0x02, hidValue(step.code) & 0xff];
    case "release":
      return [0x01, 0x03, hidValue(step.code) & 0xff];
    case "delay": {
      const ms = clampDelay(step.ms);
      return [0x01, 0x04, (ms % 255) + 1, Math.floor(ms / 255) + 1];
    }
  }
}

export function macroByteCost(macro: DecodedMacro): number {
  // steps + the 0x00 terminator
  return macro.steps.reduce((n, s) => n + stepBytes(s).length, 0) + 1;
}

export function encodeMacros(macros: DecodedMacro[]): Uint8Array {
  const out: number[] = [];
  for (const macro of macros) {
    for (const step of macro.steps) out.push(...stepBytes(step));
    out.push(0x00);
  }
  return new Uint8Array(out);
}

/**
 * Decode the flat region into macros. Sequences are read until the rest of
 * the region is zero padding; consecutive Text bytes fold into one step.
 */
export function decodeMacros(bytes: Uint8Array): DecodedMacro[] {
  const macros: DecodedMacro[] = [];
  let i = 0;
  const restIsZero = (from: number): boolean => {
    for (let j = from; j < bytes.length; j++) if (bytes[j] !== 0) return false;
    return true;
  };
  while (i < bytes.length && !restIsZero(i)) {
    const steps: MacroStep[] = [];
    let text = "";
    const flushText = () => {
      if (text) steps.push({ kind: "text", text });
      text = "";
    };
    while (i < bytes.length && bytes[i] !== 0x00) {
      const b = bytes[i];
      if (b === 0x01 && i + 1 < bytes.length && bytes[i + 1] >= 1 && bytes[i + 1] <= 4) {
        flushText();
        const op = bytes[i + 1];
        if (op === 4) {
          const b1 = Math.max(bytes[i + 2] ?? 1, 1);
          const b2 = Math.max(bytes[i + 3] ?? 1, 1);
          steps.push({ kind: "delay", ms: b1 - 1 + (b2 - 1) * 255 });
          i += 4;
        } else {
          const code = hidFromValue(bytes[i + 2] ?? 0);
          const kind = op === 1 ? "tap" : op === 2 ? "press" : "release";
          steps.push({ kind, code });
          i += 3;
        }
      } else {
        text += String.fromCharCode(b);
        i += 1;
      }
    }
    flushText();
    i += 1; // the 0x00 terminator
    macros.push({ steps });
  }
  return macros;
}

/** Short human label for a macro: its leading text, else a step summary. */
export function macroPreview(macro: DecodedMacro): string {
  const first = macro.steps[0];
  if (first?.kind === "text") {
    const t = first.text.replace(/\s+/g, " ").trim();
    return t.length > 18 ? `${t.slice(0, 17)}…` : t || "(spaces)";
  }
  if (!first) return "empty";
  if (first.kind === "delay") return `delay ${first.ms}ms…`;
  return `${first.kind} ${first.code}…`;
}
