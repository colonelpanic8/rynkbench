// Read-only resolution of what the device is currently showing, computed
// client-side from the last-known state. Two honest approximations live here,
// both forced by the wire protocol reporting only the *effective* (topmost
// active) layer:
//
// - Key bindings: RMK resolves by layer index (highest active index wins) and
//   Transparent actions fall through downward, stopping at the default layer
//   (the floor — layers below it are never consulted). We can only walk from
//   the effective layer down to the default layer.
// - Scene lighting: the ActiveStack policy composites every active layer by
//   index; we can only composite the default (always-active floor) and the
//   effective (top) layers, plus the overlay.

import type {
  KeyAction,
  LightingEffect,
  LightingLayerPolicy,
  LightingOverlayCell,
  LightingSceneCell,
} from "../../vendor/rynk-wasm/rynk_wasm";

export type LitSource = "overlay" | "effective" | "default" | "background";

export interface LitCell {
  effect: LightingEffect;
  source: LitSource;
}

/**
 * Per-LED composite of the addressable (non-background) lighting the device
 * should show: default-layer scene (ActiveStack only) < effective-layer scene
 * < applied overlay, top wins.
 */
export function compositeScenes(
  scenes: LightingSceneCell[],
  overlay: Record<number, LightingOverlayCell>,
  effectiveLayer: number,
  defaultLayer: number,
  policy: LightingLayerPolicy | null,
): Map<number, LitCell> {
  const out = new Map<number, LitCell>();
  if (policy === "ActiveStack") {
    for (const cell of scenes)
      if (cell.layer === defaultLayer) out.set(cell.led_id, { effect: cell.effect, source: "default" });
  }
  for (const cell of scenes)
    if (cell.layer === effectiveLayer) out.set(cell.led_id, { effect: cell.effect, source: "effective" });
  for (const cell of Object.values(overlay))
    out.set(cell.led_id, { effect: cell.effect, source: "overlay" });
  return out;
}

/**
 * The binding a key resolves to right now. RMK walks every *active* layer from
 * the top index down, but only the effective and default layers are known
 * active here — indices between them are not reported — so the walk consults
 * exactly those two, mirroring what compositeScenes does for lighting.
 */
export function effectiveAction(
  layers: KeyAction[][],
  effectiveLayer: number,
  defaultLayer: number,
  index: number,
): KeyAction {
  const known =
    effectiveLayer > defaultLayer ? [effectiveLayer, defaultLayer] : [Math.max(effectiveLayer, defaultLayer)];
  for (const layer of known) {
    const action = layers[layer]?.[index];
    if (action === undefined) continue;
    // The floor's action stands even when Transparent (nothing lies below it).
    if (action !== "Transparent" || layer === defaultLayer) return action;
  }
  return "No";
}
