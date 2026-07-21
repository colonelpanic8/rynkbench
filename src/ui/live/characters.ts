import type {
  Action,
  HidKeyCode,
  KeyAction,
  ModifierCombination,
} from "../../vendor/rynk-wasm/rynk_wasm";
import { actionLabel, keyActionGlyph, modifierSymbols, type KeyGlyph } from "../labels";

const UNSHIFTED: Partial<Record<HidKeyCode, string>> = {
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
  NonusBackslash: "\\",
};

const SHIFTED: Partial<Record<HidKeyCode, string>> = {
  Kc1: "!",
  Kc2: "@",
  Kc3: "#",
  Kc4: "$",
  Kc5: "%",
  Kc6: "^",
  Kc7: "&",
  Kc8: "*",
  Kc9: "(",
  Kc0: ")",
  Minus: "_",
  Equal: "+",
  LeftBracket: "{",
  RightBracket: "}",
  Backslash: "|",
  NonusHash: "~",
  Semicolon: ":",
  Quote: '"',
  Grave: "~",
  Comma: "<",
  Dot: ">",
  Slash: "?",
  NonusBackslash: "|",
};

function shifted(mods: ModifierCombination): boolean {
  return mods.left_shift || mods.right_shift;
}

/** Authoritative Shift state, or null when the firmware cannot report it. */
export function reportedShiftState(mods: ModifierCombination | null): boolean | null {
  return mods === null ? null : shifted(mods);
}

function printableCharacter(code: HidKeyCode, shift: boolean): string | null {
  if (/^[A-Z]$/.test(code)) return shift ? code : code.toLowerCase();
  return (shift ? SHIFTED[code] : UNSHIFTED[code]) ?? null;
}

function printableActionLabel(action: Action, shift: boolean): string | null {
  if (typeof action === "string") return null;
  if ("Key" in action && "Hid" in action.Key) {
    return printableCharacter(action.Key.Hid, shift);
  }
  if ("KeyWithModifier" in action) {
    const [code, mods] = action.KeyWithModifier;
    const character = printableCharacter(code, shift || shifted(mods));
    if (character === null) return null;
    const nonShiftModifiers = modifierSymbols({
      ...mods,
      left_shift: false,
      right_shift: false,
    });
    return nonShiftModifiers + character;
  }
  return null;
}

/** Live-only key glyph that displays the character produced under Shift. */
export function liveKeyActionGlyph(action: KeyAction, shift: boolean): KeyGlyph {
  if (action === "No" || action === "Transparent" || "Morse" in action) {
    return keyActionGlyph(action);
  }
  if ("Single" in action) {
    return { text: printableActionLabel(action.Single, shift) ?? actionLabel(action.Single) };
  }
  if ("Tap" in action) {
    return { text: printableActionLabel(action.Tap, shift) ?? actionLabel(action.Tap) };
  }
  const [tap, hold] = action.TapHold;
  return {
    text: printableActionLabel(tap, shift) ?? actionLabel(tap),
    sub: printableActionLabel(hold, shift) ?? actionLabel(hold),
  };
}

function actionHoldsShift(action: Action): boolean {
  if (typeof action === "string") return false;
  if ("Key" in action && "Hid" in action.Key) {
    return action.Key.Hid === "LShift" || action.Key.Hid === "RShift";
  }
  if ("Modifier" in action) return shifted(action.Modifier);
  if ("LayerOnWithModifier" in action) return shifted(action.LayerOnWithModifier[1]);
  return false;
}

/** Whether holding this resolved binding contributes a Shift modifier. */
export function keyActionHoldsShift(action: KeyAction): boolean {
  if (action === "No" || action === "Transparent" || "Morse" in action) return false;
  if ("Single" in action) return actionHoldsShift(action.Single);
  if ("TapHold" in action) return actionHoldsShift(action.TapHold[1]);
  return false;
}

/** Decode RMK's row-padded matrix bitmap into row-major key indices. */
export function pressedMatrixIndices(bitmap: number[], rows: number, cols: number): number[] {
  const bytesPerRow = Math.ceil(cols / 8);
  const pressed: number[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const byte = bitmap[row * bytesPerRow + (col >> 3)] ?? 0;
      if ((byte & (1 << (col & 7))) !== 0) pressed.push(row * cols + col);
    }
  }
  return pressed;
}
