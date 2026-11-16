import { useRef, useState } from "react";
import type { KeyView } from "../../model/keyboard";
import type { KeyAction } from "../../vendor/rynk-wasm/rynk_wasm";
import { SectionLabel, cx } from "../kit";
import { useCapabilities } from "../use-capabilities";
import { keyAddressLabel } from "../key-address";
import { layerName } from "../layer-names";
import { hasPendingConfigurationWrite } from "../../workbench";
import { useWorkbench } from "../state";
import { hasLayerIndicatorConditions } from "../../session/lighting-features";
import {
  installedLightingKeyKind,
  lightingKeyAction,
  writeLightingKeyPreset,
  type LightingKeyKind,
} from "../../model/lighting/key-presets";
import { maskHasLayer } from "../../model/lighting/wake-layers";

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
export function LightingKeyPresetPanel({
  layer,
  target,
  current,
}: {
  layer: number;
  target: KeyView;
  current: KeyAction;
}) {
  const { bundle, state, io, dispatch } = useWorkbench();
  const [message, setMessage] = useState<string | null>(null);
  const installing = useRef(false);
  const capabilities = useCapabilities();
  const ruleTable = capabilities.get("lighting.rules");
  const busy = hasPendingConfigurationWrite(state);
  const wakes = maskHasLayer(
    state.lightingOutputMode?.wake_layers ?? state.lightingControls.wake_layers,
    layer,
  );
  const led = target.ledId;
  if (!ruleTable || led === undefined) return null;

  const supported = (kind: LightingKeyKind) =>
    kind === "output-mode"
      ? capabilities.has("lighting.output")
      : capabilities.has("lighting.extension") && hasLayerIndicatorConditions(bundle.lightingCaps);

  const install = async (kind: LightingKeyKind) => {
    if (installing.current || busy || state.batchMode || !supported(kind)) return;
    installing.current = true;
    dispatch({ type: "lightingBusy", busy: true, error: null });
    setMessage("Installing key action and indicator…");
    try {
      const result = await writeLightingKeyPreset(
        {
          setKey: (preset, action) =>
            io.setKey(preset.layer, preset.row, preset.col, action),
          applyRules: (rules) => io.applyConditionalScenes(rules),
        },
        state.runtimeConditionalDraft,
        { kind, layer, row: target.row, col: target.col, led },
        ruleTable.slots,
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

  const blocked = state.batchMode || busy || ruleTable.slots === 0;
  const rulesKind = installedLightingKeyKind(state.runtimeConditionalDraft, led, layer);
  const installed = (kind: LightingKeyKind) =>
    rulesKind === kind && JSON.stringify(current) === JSON.stringify(lightingKeyAction(kind));

  return (
    <div>
      <SectionLabel>Key presets</SectionLabel>
      <p className="mt-1 text-small leading-relaxed text-faint">
        One click binds the action and installs its status colors on this key for{" "}
        {layerName(state.layerMetadata, layer)}. Repeating a preset reinstalls its rules.
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
              <div className="flex items-center gap-2 text-ui font-medium text-accent">
                {preset.label}
                {installed(preset.kind) && (
                  <span className="rounded-full border border-ok/40 px-1.5 py-px text-caption font-medium text-ok">
                    installed
                  </span>
                )}
              </div>
              <div className="text-small text-faint">{preset.hint}</div>
            </button>
          );
        })}
      </div>
      {state.batchMode && (
        <p className="mt-2 text-small leading-relaxed text-warn">
          Turn batch mode off first: presets write the action and its lighting immediately.
        </p>
      )}
      {!wakes && (
        <p className="mt-2 text-small leading-relaxed text-faint">
          The indicator lights while {layerName(state.layerMetadata, layer)} is active. To see it
          while the lights are off, let that layer wake them: RGB settings, Advanced.
        </p>
      )}
      {message && (
        <p role="status" className="mt-2 text-small leading-relaxed text-mute">
          {message}
        </p>
      )}
    </div>
  );
}
