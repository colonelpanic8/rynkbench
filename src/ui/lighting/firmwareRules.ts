import type {
  BatteryStatus,
  ConnectionStatus,
  ConnectionType,
  LightingConditionalSceneCell,
  LightingExtendedConditionalSceneCell,
  LightingOverlayCell,
  LightingOutputMode,
  LightingRuntimeConditionalSceneStatus,
  LightingSceneCell,
} from "../../vendor/rynk-wasm/rynk_wasm";

/** Whether this firmware has a mutable ordered conditional table at all.
 *  Firmware without one reports no table (the status read is rejected, which
 *  the connect flow records as null), and the rules editor is hidden
 *  entirely — that is distinct from a supported table that happens to be
 *  empty, which shows an editor with no rules yet. */
export function runtimeConditionalSupported(
  status: LightingRuntimeConditionalSceneStatus | null,
): boolean {
  return status !== null && status.capacity > 0;
}

export interface FirmwareLightingPreview {
  activeLayers: ReadonlySet<number>;
  batteries: ReadonlyMap<number, BatteryStatus>;
  outputMode: LightingOutputMode | undefined;
  /** Live transport and BLE state, when the firmware reports it. */
  connection?: ConnectionStatus;
  /** Whether the extension band is rendering — its value is non-zero. */
  effectsEnabled?: boolean;
  /** Profile slots known to hold a bond. The firmware evaluates `bonded`
   *  against its own bond table and does not publish it over Rynk, so this is
   *  normally absent and such rules preview as unsatisfiable. */
  bondedSlots?: ReadonlySet<number>;
}

/** Mirror of `ConnectionStatus::usb_ready`: plugged and routable, whether or
 *  not USB is the transport actually carrying output. */
function usbReady(status: ConnectionStatus): boolean {
  return status.usb === "Configured" || status.usb === "Suspended";
}

/** Mirror of `ConnectionStatus::decide_active`. */
function activeTransport(status: ConnectionStatus): ConnectionType | undefined {
  const usb = usbReady(status);
  const ble = status.ble.state === "Connected";
  if (usb && ble) return status.preferred;
  if (usb) return "Usb";
  if (ble) return "Ble";
  return undefined;
}

/** Predicates the host cannot evaluate are unsatisfiable rather than true —
 *  the same rule the firmware applies to a source that cannot see the state.
 *  Lighting a rule we cannot actually verify would be the worse error. */
function connectionMatches(
  cell: LightingExtendedConditionalSceneCell,
  preview: FirmwareLightingPreview,
): boolean {
  if (cell.effects !== undefined) {
    if (preview.effectsEnabled === undefined) return false;
    if (preview.effectsEnabled !== cell.effects.enabled) return false;
  }
  const condition = cell.connection;
  if (condition === undefined) return true;
  const status = preview.connection;
  if (status === undefined) return false;
  if (condition.transport !== undefined) {
    const active = activeTransport(status);
    const named = active === undefined ? "NoneActive" : active === "Usb" ? "Usb" : "Ble";
    if (named !== condition.transport) return false;
  }
  if (condition.profile !== undefined && status.ble.profile !== condition.profile) return false;
  if (condition.ble_state !== undefined && status.ble.state !== condition.ble_state) return false;
  if (condition.usb_connected !== undefined && usbReady(status) !== condition.usb_connected) {
    return false;
  }
  if (condition.bonded !== undefined) {
    if (preview.bondedSlots === undefined) return false;
    if (preview.bondedSlots.has(condition.bonded.slot) !== condition.bonded.bonded) return false;
  }
  return true;
}

export function conditionalRuleMatches(
  cell: LightingConditionalSceneCell,
  preview: FirmwareLightingPreview,
): boolean {
  const { layer, battery, output_mode } = cell.conditions;
  if (output_mode !== undefined && preview.outputMode !== output_mode) return false;
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

/** Whether a runtime rule matches: the base conditions plus the connection and
 *  effects predicates only the extended cell carries. */
export function runtimeConditionalRuleMatches(
  rule: LightingExtendedConditionalSceneCell,
  preview: FirmwareLightingPreview,
): boolean {
  return conditionalRuleMatches(rule.cell, preview) && connectionMatches(rule, preview);
}

/** Compose immutable firmware sources in their device order; later cells win.
 *  Compiled rules come before runtime ones because that is the order the
 *  firmware composes them, and runtime cells override the slots they share. */
export function firmwarePreviewCells(
  layerScenes: LightingSceneCell[],
  conditionalScenes: LightingConditionalSceneCell[],
  runtimeConditionalScenes: LightingExtendedConditionalSceneCell[],
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
  for (const rule of runtimeConditionalScenes) {
    if (runtimeConditionalRuleMatches(rule, preview)) {
      const { led_id, effect } = rule.cell;
      result.set(led_id, { led_id, effect, ttl_ms: undefined });
    }
  }
  return result;
}

/** Human summary of a runtime rule, including the predicates only the
 *  extended cell carries. */
export function describeRuleConditions(
  rule: LightingExtendedConditionalSceneCell,
  layerLabel?: (layer: number) => string,
): string {
  const parts: string[] = [];
  const base = describeConditions(rule.cell, layerLabel);
  if (base !== "always") parts.push(base);
  if (rule.effects !== undefined) {
    parts.push(rule.effects.enabled ? "effects on" : "effects off");
  }
  const connection = rule.connection;
  if (connection !== undefined) {
    if (connection.transport !== undefined) {
      parts.push(
        connection.transport === "NoneActive"
          ? "no active transport"
          : `${connection.transport.toLowerCase()} active`,
      );
    }
    if (connection.profile !== undefined) parts.push(`profile ${connection.profile}`);
    if (connection.ble_state !== undefined) parts.push(connection.ble_state.toLowerCase());
    if (connection.usb_connected !== undefined) {
      parts.push(connection.usb_connected ? "usb connected" : "usb disconnected");
    }
    if (connection.bonded !== undefined) {
      parts.push(
        `slot ${connection.bonded.slot} ${connection.bonded.bonded ? "bonded" : "unbonded"}`,
      );
    }
  }
  return parts.length > 0 ? parts.join(" + ") : "always";
}

export function describeConditions(
  cell: LightingConditionalSceneCell,
  layerLabel: (layer: number) => string = (layer) => `L${layer}`,
): string {
  const parts: string[] = [];
  const { layer, battery, output_mode } = cell.conditions;
  if (layer) parts.push(`${layerLabel(layer.layer)} ${layer.active ? "active" : "inactive"}`);
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
  if (output_mode !== undefined) {
    parts.push(
      output_mode === "AlwaysOn"
        ? "output always on"
        : output_mode === "AlwaysOff"
          ? "output always off"
          : "output plugged-in only",
    );
  }
  return parts.length > 0 ? parts.join(" + ") : "always";
}
