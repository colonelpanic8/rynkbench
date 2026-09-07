import { useRef, useState } from "react";
import type { KeyView } from "../../model/keyboard";
import { SectionLabel, cx } from "../kit";
import { keyAddressLabel } from "../key-address";
import { layerName } from "../layer-names";
import { hasPendingConfigurationWrite, useWorkbench } from "../state";
import { RUNTIME_LAYER_INDICATOR_CONDITIONS, hasLightingFeature } from "../../session/lighting-features";
import { writeLightingKeyPreset, type LightingKeyKind } from "./lightingKeyPresets";
import { maskHasLayer } from "./wakeLayers";

const PRESETS: Array<{ kind: LightingKeyKind; label: string; hint: string }> = [
  {
    kind: "effects",
    label: "Toggle RGB effects · indicator",
    hint: "Press to toggle effects; the key shows green while enabled and dim red while disabled",
  },
  {
    kind: "output-mode",
    label: "Cycle lighting policy · indicator",
    hint: "Press to cycle always on → always off → USB-powered only; the key shows green → red → blue",
  },
];

/**
 * Bind a lighting control action to the inspected key and install the
 * conditional rules that show its state on that key, in one step.
 */
export function LightingKeyPresetPanel({ layer, target }: { layer: number; target: KeyView }) {
  const { bundle, state, io, dispatch } = useWorkbench();
  const [message, setMessage] = useState<string | null>(null);
  const installing = useRef(false);
  const status = bundle.runtimeConditionalStatus;
  const busy = hasPendingConfigurationWrite(state);
  const wakes = maskHasLayer(
    state.lightingOutputMode?.wake_layers ?? state.lightingControls.wake_layers,
    layer,
  );
  const led = target.ledId;
  if (!status || led === undefined) return null;

  const supported = (kind: LightingKeyKind) =>
    kind === "output-mode"
      ? state.lightingOutputMode !== null
      : state.lightingExtension !== null &&
        hasLightingFeature(bundle.lightingCaps, RUNTIME_LAYER_INDICATOR_CONDITIONS);

  const install = async (kind: LightingKeyKind) => {
    if (installing.current || busy || state.batchMode || !supported(kind)) return;
    installing.current = true;
    dispatch({ type: "lightingBusy", busy: true, error: null });
    setMessage("Installing key action and indicator…");
    try {
      const result = await writeLightingKeyPreset(
        {
          setKey: (preset, action) =>
            io.setKey(preset.layer, preset.row, preset.col, action, { history: "invalidate" }),
          applyRules: (rules) => io.applyConditionalScenes(rules),
        },
        state.runtimeConditionalDraft,
        { kind, layer, row: target.row, col: target.col, led },
        status.capacity,
      );
      setMessage(
        result.ok
          ? `Configured ${keyAddressLabel(target)} on ${layerName(state.layerMetadata, layer)}: action and status lighting.`
          : result.message,
      );
    } finally {
      installing.current = false;
      dispatch({ type: "lightingBusy", busy: false });
    }
  };

  const blocked = state.batchMode || busy || status.capacity === 0;

  return (
    <div>
      <SectionLabel>Key presets</SectionLabel>
      <p className="mt-1 text-[11.5px] leading-relaxed text-faint">
        Bind the action and install status colors on this key for{" "}
        {layerName(state.layerMetadata, layer)}. Repeating a preset replaces its rules.
      </p>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {PRESETS.map((preset) => {
          const ok = supported(preset.kind);
          return (
            <button
              key={preset.kind}
              type="button"
              disabled={!ok || blocked}
              title={
                ok
                  ? undefined
                  : preset.kind === "output-mode"
                    ? "This firmware does not report lighting output policy support"
                    : "Needs RGB extension effects and effects-status conditions"
              }
              onClick={() => install(preset.kind)}
              className={cx(
                "rounded-lg border px-3 py-2 text-left transition-colors duration-120",
                ok && !blocked
                  ? "cursor-pointer border-accent-deep/40 bg-accent-dim/15 hover:border-accent-deep"
                  : "cursor-not-allowed border-line opacity-50",
              )}
            >
              <div className="text-[13px] font-medium text-accent">{preset.label}</div>
              <div className="text-[11.5px] text-faint">{preset.hint}</div>
            </button>
          );
        })}
      </div>
      {state.batchMode && (
        <p className="mt-2 text-[11px] leading-relaxed text-warn">
          Turn batch mode off first: presets write the action and its lighting immediately.
        </p>
      )}
      {!wakes && (
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          The indicator lights while {layerName(state.layerMetadata, layer)} is active. To see it
          while lighting is off, enable that layer’s wake setting in Lighting mode.
        </p>
      )}
      {message && (
        <p role="status" className="mt-2 text-[11px] leading-relaxed text-mute">
          {message}
        </p>
      )}
    </div>
  );
}
