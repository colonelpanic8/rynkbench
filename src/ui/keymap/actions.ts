import type {
  Action,
  HidKeyCode,
  ModifierCombination,
} from "../../vendor/rynk-wasm/rynk_wasm";
import { anyModifier } from "../labels";

export function pickedHidAction(code: HidKeyCode, mods: ModifierCombination): Action {
  return anyModifier(mods)
    ? { KeyWithModifier: [code, mods] }
    : { Key: { Hid: code } };
}

/** Union of user-selected modifiers and a character pick's required ones. */
export function mergeModifiers(
  base: ModifierCombination,
  required?: ModifierCombination,
): ModifierCombination {
  if (!required) return base;
  const merged = { ...base };
  for (const key of Object.keys(merged) as Array<keyof ModifierCombination>) {
    merged[key] = merged[key] || required[key];
  }
  return merged;
}
