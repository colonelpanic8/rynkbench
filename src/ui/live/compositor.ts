// Read-only resolution of what the device is currently showing, computed
// client-side from the last-known state. GetLayerState supplies every layer
// participating in resolution, so bindings and ActiveStack lighting can use
// the same complete set as the firmware.

import type {
  BatteryStatus,
  KeyAction,
  LightingConditionalSceneCell,
  LightingEffect,
  LightingLayerPolicy,
  LightingOverlayCell,
  LightingOutputModeState,
  LightingSceneCell,
} from "../../vendor/rynk-wasm/rynk_wasm";
import { conditionalRuleMatches } from "../lighting/firmwareRules";

export type LitSource =
  | "overlay"
  | "runtime-effective"
  | "runtime-active"
  | "runtime-default"
  | "compiled-effective"
  | "compiled-active"
  | "compiled-default"
  | "conditional"
  | "output-mode"
  | "background";

export interface LitCell {
  effect: LightingEffect;
  source: LitSource;
}

function contributingLayers(
  activeLayers: number[],
  defaultLayer: number,
  policy: LightingLayerPolicy | null,
): number[] {
  const active = [...new Set([defaultLayer, ...activeLayers])].sort((a, b) => a - b);
  const effective = active.at(-1) ?? defaultLayer;
  if (policy !== "ActiveStack") return [effective];

  // This deliberately mirrors RMK's LayerScenes iterator: default first,
  // every other active layer in ascending precedence, effective last. A
  // non-zero default therefore must not be sorted among the active layers.
  return [
    defaultLayer,
    ...active.filter((layer) => layer !== defaultLayer && layer !== effective),
    ...(effective === defaultLayer ? [] : [effective]),
  ];
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
  activeLayers: number[],
  defaultLayer: number,
  compiledPolicy: LightingLayerPolicy | null,
  runtimePolicy: LightingLayerPolicy | null,
  conditionalScenes: LightingConditionalSceneCell[] = [],
  batteries: ReadonlyMap<number, BatteryStatus> = new Map(),
  outputMode: LightingOutputModeState | null = null,
): Map<number, LitCell> {
  const out = new Map<number, LitCell>();

  const applySource = (
    cells: LightingSceneCell[],
    policy: LightingLayerPolicy | null,
    source: "compiled" | "runtime",
  ) => {
    const layers = contributingLayers(activeLayers, defaultLayer, policy);
    const effectiveLayer = Math.max(defaultLayer, ...activeLayers);
    for (const layer of layers) {
      const suffix =
        layer === effectiveLayer ? "effective" : layer === defaultLayer ? "default" : "active";
      for (const cell of cells)
        if (cell.layer === layer)
          out.set(cell.led_id, {
            effect: cell.effect,
            source: `${source}-${suffix}`,
          });
    }
  };

  applySource(compiledScenes, compiledPolicy, "compiled");
  applySource(scenes, runtimePolicy, "runtime");
  for (const cell of Object.values(overlay))
    out.set(cell.led_id, { effect: cell.effect, source: "overlay" });
  const activeLayerSet = new Set([defaultLayer, ...activeLayers]);
  for (const cell of conditionalScenes) {
    if (
      conditionalRuleMatches(cell, {
        activeLayers: activeLayerSet,
        batteries,
        outputMode: outputMode?.mode,
      })
    ) {
      out.set(cell.led_id, { effect: cell.effect, source: "conditional" });
    }
  }
  if (outputMode?.wake_active && outputMode.indicator) {
    const effect =
      outputMode.mode === "AlwaysOn"
        ? outputMode.indicator.always_on
        : outputMode.mode === "AlwaysOff"
          ? outputMode.indicator.always_off
          : outputMode.indicator.powered_only;
    out.set(outputMode.indicator.led_id, { effect, source: "output-mode" });
  }
  return out;
}

/**
 * The binding a key resolves to right now. RMK walks every active layer from
 * the highest index down and Transparent continues through that active set.
 */
export function effectiveAction(
  layers: KeyAction[][],
  activeLayers: number[],
  defaultLayer: number,
  index: number,
): KeyAction {
  const active = [...new Set([defaultLayer, ...activeLayers])].sort((a, b) => b - a);
  for (const layer of active) {
    const action = layers[layer]?.[index];
    if (action !== undefined && action !== "Transparent") return action;
  }
  return "No";
}
