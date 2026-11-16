import type { KeyView } from "../../model/keyboard";
import type { KeyAction } from "../../model/action-types";
import { keyActionGlyph, type LayerNames } from "../labels";
import { effectiveAction } from "../live/compositor";

/** What a key does where the lighting view looks: on the overlay, what the
 *  active layers resolve to; on one layer, its own binding, or the base
 *  layer's where it is transparent. */
export function lightingKeyAction(
  key: KeyView,
  layers: KeyAction[][],
  cols: number,
  target: "overlay" | number,
  activeLayers: number[],
  defaultLayer: number,
): KeyAction {
  const index = key.row * cols + key.col;
  if (target === "overlay") return effectiveAction(layers, activeLayers, defaultLayer, index);
  const action = layers[target]?.[index];
  return action === undefined || action === "Transparent" ? effectiveAction(layers, [], defaultLayer, index) : action;
}

export function lightingKeyLegend(
  names: LayerNames,
  ...args: Parameters<typeof lightingKeyAction>
): string {
  return keyActionGlyph(lightingKeyAction(...args), [], names).text;
}
