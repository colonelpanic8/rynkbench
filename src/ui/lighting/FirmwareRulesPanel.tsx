// The compiled, read-only half of the lighting story: what keyboard.toml put
// on the board, grouped by rule, plus the output-mode policy it ships with.

import { useCallback, useMemo } from "react";
import { keyAddressWithLegend } from "../key-address";
import { layerName } from "../layer-names";
import { useWorkbench } from "../state";
import { SectionLabel } from "../kit";
import { effectColor } from "./decor";
import { firmwareRuleGroups } from "./firmwareRules";
import { previewActiveLayers } from "./preview";
import { layersInMask } from "./wakeLayers";

export function FirmwareRulesPanel() {
  const { bundle, state } = useWorkbench();
  const total = state.compiledScenes.length + state.conditionalScenes.length;
  const activeLayers = useMemo(
    () => previewActiveLayers(state.lightingTarget, state.activeLayers, state.defaultLayer),
    [state.activeLayers, state.defaultLayer, state.lightingTarget],
  );
  const batteries = useMemo(
    () => new Map([[0, state.battery], [1, state.peripheralBattery]]),
    [state.battery, state.peripheralBattery],
  );
  const labels = useMemo(() => {
    const result = new Map<number, string>();
    for (const key of bundle.model.keys) {
      if (key.ledId !== undefined) result.set(key.ledId, keyAddressWithLegend(key));
    }
    return result;
  }, [bundle.model]);
  const nameOf = useCallback(
    (layer: number) => layerName(state.layerMetadata, layer),
    [state.layerMetadata],
  );
  const groups = useMemo(
    () =>
      firmwareRuleGroups(
        state.compiledScenes,
        state.conditionalScenes,
        { activeLayers, batteries, outputMode: state.lightingOutputMode?.mode },
        nameOf,
      ),
    [
      activeLayers,
      batteries,
      state.compiledScenes,
      state.conditionalScenes,
      state.lightingOutputMode,
      nameOf,
    ],
  );

  const activeCount = groups.reduce(
    (count, group) => count + (group.active ? group.leds.length : 0),
    0,
  );

  const outputMode = state.lightingOutputMode;
  if (total === 0 && outputMode === null) return null;
  const { output_toggle_user_action: toggleAction } = state.lightingControls;
  const wakeLayers = state.lightingOutputMode?.wake_layers ?? state.lightingControls.wake_layers;
  const wakeLayerList = layersInMask(wakeLayers, bundle.caps.num_layers);
  return (
    <div>
      <SectionLabel>Configured firmware rules</SectionLabel>
      <p className="mt-1 text-[11.5px] leading-relaxed text-faint">
        Read-only from keyboard.toml · {total} cells · {activeCount} active in this preview
      </p>
      {(toggleAction !== undefined || wakeLayerList.length > 0) && (
        <p className="mt-1 text-[11.5px] leading-relaxed text-mute">
          {toggleAction !== undefined && `User${toggleAction} toggles all lighting`}
          {toggleAction !== undefined && wakeLayerList.length > 0 && " · "}
          {wakeLayerList.length > 0 &&
            `${wakeLayerList.map(nameOf).join(", ")} ${
              wakeLayerList.length === 1 ? "wakes" : "wake"
            } lighting and presents status`}
        </p>
      )}
      {outputMode !== null && (
        <p className="mt-1 text-[11.5px] leading-relaxed text-mute">
          {outputMode.cycle_user_action !== undefined &&
            `User${outputMode.cycle_user_action} cycles always on → always off → plugged-in only · `}
          Current: {outputMode.mode === "AlwaysOn"
            ? "always on"
            : outputMode.mode === "AlwaysOff"
              ? "always off"
              : "plugged-in only"}
          {` · ${outputMode.effective_enabled ? "lights on" : "lights off"}`}
          {` · ${outputMode.powered ? "USB powered" : "on battery"}`}
          {outputMode.powered_only_scope === "Local" && " · power evaluated per half"}
        </p>
      )}
      {groups.length > 0 && (
        <details className="mt-2 rounded-lg border border-line-soft bg-well px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-medium text-mute">
            Show {groups.length} rule groups
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {groups.map((group) => {
              const names = group.leds.map((id) => labels.get(id) ?? `LED ${id}`).join(", ");
              return (
                <div key={group.id} className="flex items-start gap-2 text-[11.5px]">
                  <span
                    className="mt-1 size-2 shrink-0 rounded-full"
                    style={{ background: effectColor(group.effect) }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-mute">{group.description}</span>
                      <span className={group.active ? "text-ok" : "text-faint"}>
                        {group.active ? "active" : "inactive"}
                      </span>
                    </div>
                    <div className="truncate text-faint" title={names}>
                      {names}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
