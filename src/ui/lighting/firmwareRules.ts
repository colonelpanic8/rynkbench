import type {
  BatteryStatus,
  LightingConditionalSceneCell,
  LightingOverlayCell,
  LightingSceneCell,
} from "../../vendor/rynk-wasm/rynk_wasm";

export interface FirmwareLightingPreview {
  activeLayers: ReadonlySet<number>;
  batteries: ReadonlyMap<number, BatteryStatus>;
}

export function conditionalRuleMatches(
  cell: LightingConditionalSceneCell,
  preview: FirmwareLightingPreview,
): boolean {
  const { layer, battery } = cell.conditions;
  if (layer && preview.activeLayers.has(layer.layer) !== layer.active) return false;
  if (!battery) return true;
  const status = preview.batteries.get(battery.node);
  if (!status || status === "Unavailable") return false;
  const { charge_state, level } = status.Available;
  if (battery.charge !== "Any" && battery.charge !== charge_state) return false;
  if (battery.min_level === undefined && battery.max_level === undefined) return true;
  if (level === undefined) return false;
  return (
    (battery.min_level === undefined || level >= battery.min_level) &&
    (battery.max_level === undefined || level <= battery.max_level)
  );
}

/** Compose immutable firmware sources in their device order; later cells win. */
export function firmwarePreviewCells(
  layerScenes: LightingSceneCell[],
  conditionalScenes: LightingConditionalSceneCell[],
  preview: FirmwareLightingPreview,
): Map<number, LightingOverlayCell> {
  const result = new Map<number, LightingOverlayCell>();
  for (const cell of layerScenes) {
    if (preview.activeLayers.has(cell.layer)) {
      result.set(cell.led_id, { led_id: cell.led_id, effect: cell.effect, ttl_ms: undefined });
    }
  }
  for (const cell of conditionalScenes) {
    if (conditionalRuleMatches(cell, preview)) {
      result.set(cell.led_id, { led_id: cell.led_id, effect: cell.effect, ttl_ms: undefined });
    }
  }
  return result;
}

export function describeConditions(cell: LightingConditionalSceneCell): string {
  const parts: string[] = [];
  const { layer, battery } = cell.conditions;
  if (layer) parts.push(`L${layer.layer} ${layer.active ? "active" : "inactive"}`);
  if (battery) {
    let range = "level known";
    if (battery.min_level !== undefined && battery.max_level !== undefined) {
      range = `${battery.min_level}–${battery.max_level}%`;
    } else if (battery.min_level !== undefined) {
      range = `≥${battery.min_level}%`;
    } else if (battery.max_level !== undefined) {
      range = `≤${battery.max_level}%`;
    }
    const charge = battery.charge === "Any" ? "" : `, ${battery.charge.toLowerCase()}`;
    parts.push(`battery ${battery.node} ${range}${charge}`);
  }
  return parts.length > 0 ? parts.join(" + ") : "always";
}
