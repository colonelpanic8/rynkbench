import type {
  LightingEffect,
  LightingOverlayCell,
  LightingSceneCell,
} from "../../vendor/rynk-wasm/rynk_wasm";
import type { LightingTarget } from "../state";

/** Effects shown by the lighting editor for one isolated edit target.
 * Overlay never includes layer scenes; numeric targets show that layer's
 * compiled defaults underneath its editable runtime draft. */
export function targetPreviewEffects(
  target: LightingTarget,
  draft: Record<number, LightingOverlayCell>,
  compiledScenes: LightingSceneCell[],
): Map<number, LightingEffect> {
  const visible = new Map<number, LightingEffect>();
  if (target !== "overlay") {
    for (const cell of compiledScenes) {
      if (cell.layer === target) visible.set(cell.led_id, cell.effect);
    }
  }
  for (const cell of Object.values(draft)) visible.set(cell.led_id, cell.effect);
  return visible;
}
