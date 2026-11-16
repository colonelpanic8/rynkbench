import { macro_storage_size } from "../vendor/moergo-config-wasm/moergo_config_wasm";
import type { Action, HidKeyCode, MacroOp } from "../vendor/rynk-wasm/rynk_wasm";

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
  | { kind: "delay"; ms: number }
  | { kind: "native"; op: MacroOp };

export interface DecodedMacro {
  steps: MacroStep[];
}

/** Characters the firmware's from_ascii understands (en-US). */
const TEXT_OK = /^[0-9a-zA-Z!@#$%^&*()\-_=+[\]{};:'"`~\\|,<.>/? \n\t]*$/;

export function isEncodableText(text: string): boolean {
  return TEXT_OK.test(text);
}

const MAX_DELAY_MS = 65535;

export function clampDelay(ms: number): number {
  return Math.max(0, Math.min(MAX_DELAY_MS, Math.round(ms)));
}

function stepOps(step: MacroStep): MacroOp[] {
  switch (step.kind) {
    case "text": return [...step.text].map((ch) => ({ Char: ch.charCodeAt(0) }));
    case "tap": return [{ Tap: { Key: { Hid: step.code } } }];
    case "press": return [{ Press: { Key: { Hid: step.code } } }];
    case "release": return [{ Release: { Key: { Hid: step.code } } }];
    case "delay": return [{ Delay: clampDelay(step.ms) }];
    case "native": return [structuredClone(step.op)];
  }
}

export function macroByteCost(macro: DecodedMacro): number {
  return macro_storage_size(macro.steps.flatMap(stepOps));
}

export function macroTableSize(macros: MacroOp[][], slots = macros.length): number {
  return macros.reduce((size, ops) => size + macro_storage_size(ops), 0) + Math.max(0, slots - macros.length);
}

export function encodeMacros(macros: DecodedMacro[]): MacroOp[][] {
  return macros.map((macro) => macro.steps.flatMap(stepOps));
}

function actionStep(kind: "tap" | "press" | "release", action: Action, op: MacroOp): MacroStep {
  if (typeof action === "object" && "Key" in action && typeof action.Key === "object" && "Hid" in action.Key) {
    return { kind, code: action.Key.Hid };
  }
  return { kind: "native", op: structuredClone(op) };
}

export function decodeMacros(macros: MacroOp[][]): DecodedMacro[] {
  return macros.map((ops) => {
    const steps: MacroStep[] = [];
    for (const op of ops) {
      if (typeof op === "string") {
        steps.push({ kind: "native", op });
      } else if ("Char" in op) {
        const last = steps.at(-1);
        const text = String.fromCharCode(op.Char);
        if (last?.kind === "text") last.text += text;
        else steps.push({ kind: "text", text });
      } else if ("Delay" in op) {
        steps.push({ kind: "delay", ms: op.Delay });
      } else if ("Tap" in op) {
        steps.push(actionStep("tap", op.Tap, op));
      } else if ("Press" in op) {
        steps.push(actionStep("press", op.Press, op));
      } else {
        steps.push(actionStep("release", op.Release, op));
      }
    }
    return { steps };
  });
}

/** Short human label for a macro: its leading text, else a step summary. */
export function macroPreview(macro: DecodedMacro): string {
  const first = macro.steps[0];
  if (first?.kind === "text") {
    const t = first.text.replace(/\s+/g, " ").trim();
    return t.length > 18 ? `${t.slice(0, 17)}…` : t || "(spaces)";
  }
  if (!first) return "empty";
  if (first.kind === "native") return first.op === "PauseForRelease" ? "wait for release" : "native action";
  if (first.kind === "delay") return `delay ${first.ms}ms…`;
  return `${first.kind} ${first.code}…`;
}
