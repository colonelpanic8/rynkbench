import type {
  LightingConditionalSceneCell,
  LightingEffect,
  LightingExtendedConditionalSceneCell,
  LightingOutputModeState,
  LightingOverlayCell,
  LightingSceneCell,
} from "../../vendor/rynk-wasm/rynk_wasm";
import type { LightingTarget } from "../state";
import type { FirmwareLightingPreview } from "./firmwareRules";
import { firmwarePreviewCells } from "./firmwareRules";
import { maskHasLayer } from "./wakeLayers";

/** Black, the only way to hide a compiled cell: dropping the runtime cell that
 *  covers it would reveal the firmware default instead of turning the key off. */
export const BLACK_EFFECT: LightingEffect = { Solid: { color: { r: 0, g: 0, b: 0 } } };

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

/** The scene table with one layer's cells replaced by `draft`. Every other
 *  layer passes through untouched — an applied layer is a whole-table write. */
export function sceneTableWithLayer(
  scenes: LightingSceneCell[],
  layer: number,
  draft: Record<number, LightingOverlayCell>,
): LightingSceneCell[] {
  return [
    ...scenes.filter((cell) => cell.layer !== layer),
    ...Object.values(draft).map(
      (cell): LightingSceneCell => ({ layer, led_id: cell.led_id, effect: cell.effect }),
    ),
  ];
}

/** Which layers a preview should treat as on: the board's live stack for the
 *  overlay, or the edited layer over the default layer for a layer target. */
export function previewActiveLayers(
  target: LightingTarget,
  activeLayers: number[],
  defaultLayer: number,
): Set<number> {
  return target === "overlay" ? new Set(activeLayers) : new Set([defaultLayer, target]);
}

/** The conditional cells that match, compiled first and the staged runtime
 *  table last: composition follows table order and later cells win, which is
 *  how the firmware lets runtime cells override compiled ones on shared slots.
 *  Previewing the *draft* makes the rules editor WYSIWYG before Apply. */
export function conditionalPreviewCells(
  conditionalScenes: LightingConditionalSceneCell[],
  runtimeConditionalDraft: LightingExtendedConditionalSceneCell[],
  preview: FirmwareLightingPreview,
): Map<number, LightingOverlayCell> {
  return firmwarePreviewCells([], conditionalScenes, runtimeConditionalDraft, preview);
}

/** The output-mode indicator cell, which the firmware paints only while a wake
 *  layer is active. Absent when the firmware advertises no indicator. */
export function indicatorPreviewCell(
  outputMode: LightingOutputModeState | null,
  activeLayers: ReadonlySet<number>,
): { ledId: number; effect: LightingEffect } | undefined {
  const indicator = outputMode?.indicator;
  if (outputMode === null || indicator === undefined) return undefined;
  if (![...activeLayers].some((layer) => maskHasLayer(outputMode.wake_layers, layer))) {
    return undefined;
  }
  const effect =
    outputMode.mode === "AlwaysOn"
      ? indicator.always_on
      : outputMode.mode === "AlwaysOff"
        ? indicator.always_off
        : indicator.powered_only;
  return { ledId: indicator.led_id, effect };
}

/** Everything the canvas shows for one target, in firmware composition order:
 *  the target's own cells, then matching conditional rules, then the indicator. */
export function composePreviewEffects(
  targetEffects: Map<number, LightingEffect>,
  conditional: Map<number, LightingOverlayCell>,
  indicator: { ledId: number; effect: LightingEffect } | undefined,
): Map<number, LightingEffect> {
  const result = new Map(targetEffects);
  for (const cell of conditional.values()) result.set(cell.led_id, cell.effect);
  if (indicator) result.set(indicator.ledId, indicator.effect);
  return result;
}
