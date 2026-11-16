// The lighting drafts the workbench keeps: the overlay's, and one per layer
// seeded from the stored scene table. Which draft a target edits, what it is
// staged against, and how drafts follow the keyboard while they are clean.

import type { LightingOverlayCell, LightingSceneCell } from "../vendor/rynk-wasm/rynk_wasm";
import type { LightingTarget, WorkbenchState } from "../model/workbench-state";
import { overlaysEqual } from "../model/lighting/compare";

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

/** The draft the given target edits, seeding a layer draft from `scenes` when
 *  the target has not been touched yet. */
function targetDraft(
  state: WorkbenchState,
  target: LightingTarget,
): Record<number, LightingOverlayCell> {
  if (target === "overlay") return state.draft;
  return state.layerDrafts[target] ?? layerSceneCells(state.scenes, target);
}

/** Write a target's draft back, into `draft` or the right `layerDrafts` slot. */
export function setTargetDraft(
  state: WorkbenchState,
  target: LightingTarget,
  draft: Record<number, LightingOverlayCell>,
): Partial<WorkbenchState> {
  return target === "overlay"
    ? { draft }
    : { layerDrafts: { ...state.layerDrafts, [target]: draft } };
}

/** After the scene table changes, re-sync every layer draft that was clean
 *  against the old table (mirrors the overlay's follow-when-clean rule);
 *  drafts with staged edits are left untouched. */
export function reseedLayerDrafts(
  layerDrafts: Record<number, Record<number, LightingOverlayCell>>,
  oldScenes: LightingSceneCell[],
  newScenes: LightingSceneCell[],
): Record<number, Record<number, LightingOverlayCell>> {
  const next = { ...layerDrafts };
  for (const key of Object.keys(layerDrafts)) {
    const layer = Number(key);
    if (overlaysEqual(layerDrafts[layer], layerSceneCells(oldScenes, layer)))
      next[layer] = layerSceneCells(newScenes, layer);
  }
  return next;
}

/** The draft a given target edits (overlay draft, or that layer's). */
export const lightingDraftFor = targetDraft;

/** The baseline a given target stages against: the on-device overlay, or that
 *  layer's stored scene cells. */
export function lightingBaseFor(
  state: WorkbenchState,
  target: LightingTarget,
): Record<number, LightingOverlayCell> {
  return target === "overlay" ? state.applied : layerSceneCells(state.scenes, target);
}

/** The draft the active target edits (overlay draft, or the selected layer's). */
export function activeLightingDraft(state: WorkbenchState): Record<number, LightingOverlayCell> {
  return lightingDraftFor(state, state.lightingTarget);
}

/** The baseline the active target stages against: the on-device overlay, or
 *  the selected layer's stored scene cells. */
export function activeLightingBase(state: WorkbenchState): Record<number, LightingOverlayCell> {
  return lightingBaseFor(state, state.lightingTarget);
}
