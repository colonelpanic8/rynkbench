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
  const index = key.row * cols + key.col;
  if (target === "overlay") {
    return keyActionGlyph(effectiveAction(layers, activeLayers, defaultLayer, index)).text;
  }

  const action = layers[target]?.[index];
  return keyActionGlyph(
    action === undefined || action === "Transparent"
      ? effectiveAction(layers, [], defaultLayer, index)
      : action,
  ).text;
}
