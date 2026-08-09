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
