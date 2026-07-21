// KeyAction → display label derivation. Pure functions, no React.

import type {
  Action,
  HidKeyCode,
  KeyAction,
  KeyCode,
  ModifierCombination,
} from "../vendor/rynk-wasm/rynk_wasm";

/** Compact keycap symbols for HID codes that deserve better than their name. */
const HID_SYMBOLS: Partial<Record<HidKeyCode, string>> = {
  Kc1: "1",
  Kc2: "2",
  Kc3: "3",
  Kc4: "4",
  Kc5: "5",
  Kc6: "6",
  Kc7: "7",
  Kc8: "8",
  Kc9: "9",
  Kc0: "0",
  Enter: "↵",
  Escape: "Esc",
  Backspace: "⌫",
  Tab: "⇥",
  Space: "␣",
  Minus: "-",
  Equal: "=",
  LeftBracket: "[",
  RightBracket: "]",
  Backslash: "\\",
  NonusHash: "#",
  Semicolon: ";",
  Quote: "'",
  Grave: "`",
  Comma: ",",
  Dot: ".",
  Slash: "/",
  CapsLock: "Caps",
  PrintScreen: "PrtSc",
  ScrollLock: "ScrLk",
  Pause: "Pause",
  Insert: "Ins",
  Home: "Home",
  PageUp: "PgUp",
  Delete: "Del",
  End: "End",
  PageDown: "PgDn",
  Right: "→",
  Left: "←",
  Down: "↓",
  Up: "↑",
  NumLock: "Num",
  KpSlash: "/",
  KpAsterisk: "*",
  KpMinus: "-",
  KpPlus: "+",
  KpEnter: "↵",
  Kp1: "1",
  Kp2: "2",
  Kp3: "3",
  Kp4: "4",
  Kp5: "5",
  Kp6: "6",
  Kp7: "7",
  Kp8: "8",
  Kp9: "9",
  Kp0: "0",
  KpDot: ".",
  NonusBackslash: "\\",
  Application: "Menu",
  AudioMute: "Mute",
  AudioVolUp: "Vol+",
  AudioVolDown: "Vol−",
  MediaNextTrack: "⏭",
  MediaPrevTrack: "⏮",
  MediaStop: "⏹",
  MediaPlayPause: "⏯",
  MediaEject: "⏏",
  MediaFastForward: "⏩",
  MediaRewind: "⏪",
  BrightnessUp: "Brt+",
  BrightnessDown: "Brt−",
  KbMute: "Mute",
  KbVolumeUp: "Vol+",
  KbVolumeDown: "Vol−",
  LCtrl: "L⌃",
  LShift: "L⇧",
  LAlt: "L⌥",
  LGui: "L⌘",
  RCtrl: "R⌃",
  RShift: "R⇧",
  RAlt: "R⌥",
  RGui: "R⌘",
  MouseUp: "🖱↑",
  MouseDown: "🖱↓",
  MouseLeft: "🖱←",
  MouseRight: "🖱→",
  MouseBtn1: "MB1",
  MouseBtn2: "MB2",
  MouseBtn3: "MB3",
  MouseWheelUp: "Whl↑",
  MouseWheelDown: "Whl↓",
};

export function hidLabel(code: HidKeyCode): string {
  const sym = HID_SYMBOLS[code];
  if (sym) return sym;
  // Letters and F-keys already read well; otherwise fall back to the name.
  return code;
}

/** A longer human name for pickers and tooltips. */
export function hidName(code: HidKeyCode): string {
  const sym = HID_SYMBOLS[code];
  if (sym && sym !== code) return `${code} (${sym})`;
  return code;
}

export function modifierSymbols(mods: ModifierCombination): string {
  let out = "";
  if (mods.left_ctrl) out += "L⌃";
  if (mods.right_ctrl) out += "R⌃";
  if (mods.left_alt) out += "L⌥";
  if (mods.right_alt) out += "R⌥";
  if (mods.left_shift) out += "L⇧";
  if (mods.right_shift) out += "R⇧";
  if (mods.left_gui) out += "L⌘";
  if (mods.right_gui) out += "R⌘";
  return out;
}

export function anyModifier(mods: ModifierCombination): boolean {
  return (
    mods.left_ctrl ||
    mods.left_shift ||
    mods.left_alt ||
    mods.left_gui ||
    mods.right_ctrl ||
    mods.right_shift ||
    mods.right_alt ||
    mods.right_gui
  );
}

export const EMPTY_MODS: ModifierCombination = {
  left_ctrl: false,
  left_shift: false,
  left_alt: false,
  left_gui: false,
  right_ctrl: false,
  right_shift: false,
  right_alt: false,
  right_gui: false,
};

function keyCodeLabel(code: KeyCode): string {
  if (typeof code === "object") {
    if ("Hid" in code) return hidLabel(code.Hid);
    if ("Consumer" in code) return code.Consumer;
    if ("SystemControl" in code) return code.SystemControl;
  }
  return String(code);
}

const LIGHT_LABELS: Record<string, string> = {
  BacklightOn: "BL On",
  BacklightOff: "BL Off",
  BacklightToggle: "BL",
  BacklightDown: "BL−",
  BacklightUp: "BL+",
  BacklightStep: "BL Step",
  BacklightToggleBreathing: "BL Br",
  RgbTog: "RGB",
  RgbModeForward: "RGB→",
  RgbModeReverse: "RGB←",
  RgbHui: "Hue+",
  RgbHud: "Hue−",
  RgbSai: "Sat+",
  RgbSad: "Sat−",
  RgbVai: "Val+",
  RgbVad: "Val−",
  RgbSpi: "Spd+",
  RgbSpd: "Spd−",
};

const CONTROL_LABELS: Record<string, string> = {
  Bootloader: "Boot",
  Reboot: "Reset",
  DebugToggle: "Debug",
  ClearEeprom: "ClrEE",
  OutputAuto: "OutAuto",
  OutputUsb: "OutUSB",
  OutputBluetooth: "OutBLE",
  ComboOn: "CmbOn",
  ComboOff: "CmbOff",
  ComboToggle: "Combo",
  CapsWordToggle: "CapsWd",
};

export function actionLabel(action: Action): string {
  if (action === "No") return "";
  if (action === "TriLayerLower") return "TriL";
  if (action === "TriLayerUpper") return "TriU";
  if (typeof action === "string") return action;
  if ("Key" in action) return keyCodeLabel(action.Key);
  if ("Modifier" in action) return modifierSymbols(action.Modifier) || "Mod";
  if ("KeyWithModifier" in action) {
    const [key, mods] = action.KeyWithModifier;
    return modifierSymbols(mods) + hidLabel(key);
  }
  if ("LayerOn" in action) return `L${action.LayerOn}`;
  if ("LayerOnWithModifier" in action) {
    const [layer, mods] = action.LayerOnWithModifier;
    return `L${layer}${modifierSymbols(mods)}`;
  }
  if ("LayerOff" in action) return `L${action.LayerOff}·off`;
  if ("LayerToggle" in action) return `TG${action.LayerToggle}`;
  if ("DefaultLayer" in action) return `DF${action.DefaultLayer}`;
  if ("LayerToggleOnly" in action) return `TO${action.LayerToggleOnly}`;
  if ("TriggerMacro" in action) return `M${action.TriggerMacro}`;
  if ("OneShotLayer" in action) return `OSL${action.OneShotLayer}`;
  if ("OneShotModifier" in action) return `OS${modifierSymbols(action.OneShotModifier)}`;
  if ("OneShotKey" in action) return `OS·${hidLabel(action.OneShotKey)}`;
  if ("Light" in action) return LIGHT_LABELS[action.Light] ?? action.Light;
  if ("KeyboardControl" in action)
    return CONTROL_LABELS[action.KeyboardControl] ?? action.KeyboardControl;
  if ("Special" in action) return action.Special === "GraveEscape" ? "`Esc" : "Rpt";
  if ("User" in action) return `U${action.User}`;
  if ("PersistentDefaultLayer" in action) return `PDF${action.PersistentDefaultLayer}`;
  if ("Steno" in action) return `St${action.Steno}`;
  return "?";
}

export interface KeyGlyph {
  /** Primary keycap text. Empty string means a blank cap. */
  text: string;
  /** Secondary line (hold action for tap-holds). */
  sub?: string;
  /** Render dimmed (Transparent). */
  dim?: boolean;
}

export function keyActionGlyph(action: KeyAction): KeyGlyph {
  if (action === "No") return { text: "" };
  if (action === "Transparent") return { text: "▽", dim: true };
  if ("Single" in action) return { text: actionLabel(action.Single) };
  if ("Tap" in action) return { text: actionLabel(action.Tap) };
  if ("TapHold" in action) {
    const [tap, hold] = action.TapHold;
    return { text: actionLabel(tap), sub: actionLabel(hold) };
  }
  if ("Morse" in action) return { text: `Mo${action.Morse}` };
  return { text: "?" };
}

/** One-line description for the inspector header. */
export function keyActionDescription(action: KeyAction): string {
  if (action === "No") return "No action";
  if (action === "Transparent") return "Transparent — falls through to lower layer";
  if ("Single" in action) return actionDescription(action.Single);
  if ("Tap" in action) return `Tap: ${actionDescription(action.Tap)}`;
  if ("TapHold" in action) {
    const [tap, hold, timeout] = action.TapHold;
    return `Tap ${actionLabel(tap) || "·"} / hold ${actionLabel(hold) || "·"} · ${timeout}ms`;
  }
  if ("Morse" in action) return `Morse pattern slot ${action.Morse}`;
  return "Unknown action";
}

export function actionDescription(action: Action): string {
  if (action === "No") return "No action";
  if (typeof action === "string") return action;
  if ("Key" in action) return `Key · ${keyCodeLabel(action.Key)}`;
  if ("Modifier" in action) return `Modifier · ${modifierSymbols(action.Modifier)}`;
  if ("KeyWithModifier" in action) {
    const [key, mods] = action.KeyWithModifier;
    return `Key · ${modifierSymbols(mods)}${hidLabel(key)}`;
  }
  if ("LayerOn" in action) return `Momentary layer ${action.LayerOn}`;
  if ("LayerToggle" in action) return `Toggle layer ${action.LayerToggle}`;
  if ("DefaultLayer" in action) return `Default layer ${action.DefaultLayer}`;
  if ("OneShotLayer" in action) return `One-shot layer ${action.OneShotLayer}`;
  if ("OneShotModifier" in action)
    return `One-shot ${modifierSymbols(action.OneShotModifier)}`;
  if ("TriggerMacro" in action) return `Trigger macro ${action.TriggerMacro}`;
  if ("Light" in action) return `Lighting · ${action.Light}`;
  if ("KeyboardControl" in action) return `Control · ${action.KeyboardControl}`;
  return actionLabel(action);
}
