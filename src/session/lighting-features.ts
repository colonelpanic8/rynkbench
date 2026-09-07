// LightingFeatureFlags (rmk-types). The generated .d.ts erases the bitflag
// constants to a plain number, so the values are mirrored here — once. Every
// backend and every UI gate reads this file rather than re-deriving `1 << n`.

import type { LightingCapabilities } from "../vendor/rynk-wasm/rynk_wasm";

export const LAYER_SCENES = 1 << 6;
export const COMPILED_LAYER_SCENES = 1 << 8;
export const COMPILED_CONDITIONAL_SCENES = 1 << 9;
export const OUTPUT_MODE = 1 << 10;
export const EXTENSION_EFFECTS = 1 << 11;
export const RUNTIME_CONDITIONAL_SCENES = 1 << 12;
export const EXTENSION_LAYERING = 1 << 13;
export const RUNTIME_CONNECTION_CONDITIONS = 1 << 14;
/** Describes the extended conditional cell's *encoding*, not just an extra
 *  predicate: firmware advertising only RUNTIME_CONNECTION_CONDITIONS speaks
 *  an earlier extended cell, so gating on that bit instead would risk a
 *  misparse. Anything short of this bit uses the legacy endpoints. */
export const RUNTIME_EFFECTS_CONDITIONS = 1 << 15;
/** Advanced endpoints add layer-set and lock-indicator predicates while
 * preserving the original extended endpoint encoding. */
export const RUNTIME_LAYER_INDICATOR_CONDITIONS = 1 << 16;

export function hasLightingFeature(
  caps: Pick<LightingCapabilities, "features"> | null | undefined,
  flag: number,
): boolean {
  return ((caps?.features ?? 0) & flag) !== 0;
}
