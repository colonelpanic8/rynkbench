import type { KeyAction, LightingOutputMode } from "../../vendor/rynk-wasm/rynk_wasm";
import type { StatusRule, StatusSetupResult } from "./statusPresets";

export type LightingKeyKind = "output-mode" | "effects";

export interface LightingKeyPreset {
  kind: LightingKeyKind;
  layer: number;
  row: number;
  col: number;
  led: number;
}

export function lightingKeyAction(kind: LightingKeyKind): KeyAction {
  return { Single: { Light: kind === "output-mode" ? "OutputModeCycle" : "RgbTog" } };
}

export function lightingKeyRules(preset: LightingKeyPreset): StatusRule[] {
  const states: Array<{ mode?: LightingOutputMode; enabled?: boolean; color: [number, number, number] }> =
    preset.kind === "output-mode"
      ? [
          { mode: "AlwaysOn", color: [0, 128, 0] },
          { mode: "AlwaysOff", color: [128, 0, 0] },
          { mode: "PoweredOnly", color: [0, 64, 160] },
        ]
      : [
          { enabled: true, color: [0, 128, 0] },
          { enabled: false, color: [128, 0, 0] },
        ];
  return states.map(({ mode, enabled, color: [r, g, b] }) => ({
    cell: {
      led_id: preset.led,
      conditions: {
        layer: { layer: preset.layer, active: true },
        battery: undefined,
        output_mode: mode,
      },
      effect: { Solid: { color: { r, g, b } } },
    },
    connection: undefined,
    effects: enabled === undefined ? undefined : { enabled },
    layers: undefined,
    indicators: undefined,
  }));
}

/** The preset whose indicator rules are already installed on this key and layer. */
export function installedLightingKeyKind(
  current: StatusRule[],
  led: number,
  layer: number,
): LightingKeyKind | null {
  const own = current.filter(
    (entry) => entry.cell.led_id === led && entry.cell.conditions.layer?.layer === layer,
  );
  if (own.some((entry) => entry.effects !== undefined)) return "effects";
  if (own.some((entry) => entry.cell.conditions.output_mode !== undefined)) return "output-mode";
  return null;
}

export function replaceLightingKeyRules(current: StatusRule[], preset: LightingKeyPreset): StatusRule[] {
  const kept = current.filter((entry) =>
    entry.cell.led_id !== preset.led ||
    entry.cell.conditions.layer?.layer !== preset.layer ||
    (entry.cell.conditions.output_mode === undefined && entry.effects === undefined),
  );
  return [...kept, ...lightingKeyRules(preset)];
}

export async function writeLightingKeyPreset(
  writer: {
    setKey(preset: LightingKeyPreset, action: KeyAction): Promise<StatusSetupResult>;
    applyRules(rules: StatusRule[]): Promise<StatusSetupResult>;
  },
  current: StatusRule[],
  preset: LightingKeyPreset,
  capacity: number,
): Promise<StatusSetupResult> {
  const rules = replaceLightingKeyRules(current, preset);
  if (rules.length > capacity) {
    return { ok: false, message: `This setup needs ${rules.length} rules; the keyboard holds ${capacity}.` };
  }
  let keyWritten = false;
  try {
    const keyResult = await writer.setKey(preset, lightingKeyAction(preset.kind));
    if (!keyResult.ok) return keyResult;
    keyWritten = true;
    const result = await writer.applyRules(rules);
    return result.ok ? result : {
      ok: false,
      message: `The key action was written, but its lighting setup failed: ${result.message}. Retry to finish.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: keyWritten ? `The key action was written, but its lighting setup failed: ${message}. Retry to finish.` : message,
    };
  }
}
