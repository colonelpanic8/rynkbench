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

export type LitSource =
  | "overlay"
  | "runtime-effective"
  | "runtime-default"
  | "compiled-effective"
  | "compiled-default"
  | "background";

export interface LitCell {
  effect: LightingEffect;
  source: LitSource;
}

/**
 * Per-LED composite of the addressable (non-background) lighting the device
 * should show: compiled scenes < runtime scene overrides < applied overlay.
 * Each scene source independently chooses EffectiveOnly or ActiveStack.
 */
export function compositeScenes(
  compiledScenes: LightingSceneCell[],
  scenes: LightingSceneCell[],
  overlay: Record<number, LightingOverlayCell>,
  effectiveLayer: number,
  defaultLayer: number,
  compiledPolicy: LightingLayerPolicy | null,
  runtimePolicy: LightingLayerPolicy | null,
): Map<number, LitCell> {
  const out = new Map<number, LitCell>();

  const applySource = (
    cells: LightingSceneCell[],
    policy: LightingLayerPolicy | null,
    source: "compiled" | "runtime",
  ) => {
    if (policy === "ActiveStack") {
      for (const cell of cells)
        if (cell.layer === defaultLayer)
          out.set(cell.led_id, { effect: cell.effect, source: `${source}-default` });
    }
    for (const cell of cells)
      if (cell.layer === effectiveLayer)
        out.set(cell.led_id, { effect: cell.effect, source: `${source}-effective` });
  };

  applySource(compiledScenes, compiledPolicy, "compiled");
  applySource(scenes, runtimePolicy, "runtime");
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
