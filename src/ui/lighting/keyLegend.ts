import type { KeyView } from "../../model/keyboard";
import type { KeyAction } from "../../vendor/rynk-wasm/rynk_wasm";
import { keyActionGlyph } from "../labels";
import { effectiveAction } from "../live/compositor";

export function lightingKeyLegend(
  key: KeyView,
  layers: KeyAction[][],
  cols: number,
  target: "overlay" | number,
  activeLayers: number[],
  defaultLayer: number,
): string {
  return keyActionGlyph(effectiveAction(
    layers,
    target === "overlay" ? activeLayers : [target],
    defaultLayer,
    key.row * cols + key.col,
  )).text;
}
