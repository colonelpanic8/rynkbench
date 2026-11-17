// The lighting drafts the workbench keeps, one per layer seeded from the
// stored scene table: which draft a layer edits and what it is staged against.
// How they follow the keyboard is in draft/want.ts.

import type { LightingOverlayCell, LightingSceneCell } from "../vendor/rynk-wasm/rynk_wasm";
import type { WorkbenchState } from "../model/workbench-state";

/** The effects whose parameters are in play, base first and deduplicated —
 *  both slots may point at the same effect, which has one parameter set. */
export function paramEffects(base: number, overlay: number | undefined): number[] {
  return overlay === undefined || overlay === base ? [base] : [base, overlay];
}

export function cellsToRecord(cells: LightingOverlayCell[]): Record<number, LightingOverlayCell> {
  const out: Record<number, LightingOverlayCell> = {};
  for (const cell of cells) out[cell.led_id] = cell;
  return out;
}

/** One layer's stored scene cells, as an overlay-shaped draft (scenes have no
 *  TTL, so the ttl_ms slot is always empty). This is a layer draft's baseline. */
export function layerSceneCells(
  scenes: LightingSceneCell[],
  layer: number,
): Record<number, LightingOverlayCell> {
  const out: Record<number, LightingOverlayCell> = {};
  for (const cell of scenes) {
    if (cell.layer === layer)
      out[cell.led_id] = { led_id: cell.led_id, effect: cell.effect, ttl_ms: undefined };
  }
  return out;
}

/** The draft a layer's lights are edited in, seeded from `scenes` until the
 *  layer is first touched. */
export function lightingDraftFor(state: WorkbenchState, layer: number): Record<number, LightingOverlayCell> {
  return state.layerDrafts[layer] ?? layerSceneCells(state.scenes, layer);
}

/** A layer's draft written back into `layerDrafts`. */
export function withLayerDraft(
  state: WorkbenchState,
  layer: number,
  draft: Record<number, LightingOverlayCell>,
): Partial<WorkbenchState> {
  return { layerDrafts: { ...state.layerDrafts, [layer]: draft } };
}

/** What a layer's draft is staged against: its stored scene cells. */
export function lightingBaseFor(state: WorkbenchState, layer: number): Record<number, LightingOverlayCell> {
  return layerSceneCells(state.scenes, layer);
}
