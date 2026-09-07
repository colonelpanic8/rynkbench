import { useRef, useState } from "react";
import type { KeyView } from "../../model/keyboard";
import { Button } from "../kit";
import { keyAddressLabel } from "../key-address";
import { hasPendingConfigurationWrite, useWorkbench } from "../state";
import { writeLightingKeyPreset, type LightingKeyKind } from "./lightingKeyPresets";
import { KeyChoice } from "./KeyChoice";
import { BATTERY_BAR_PICK, LIGHTING_KEY_PICK } from "./keyPick";
import type { KeyPick } from "./keyPick";
import { maskHasLayer } from "./wakeLayers";

const RUNTIME_EFFECTS_CONDITIONS = 1 << 15;

export function LightingKeyPresetPanel({
  selectedKey,
  selectedKeys,
  pick,
  onPick,
  layer,
  onLayerChange,
}: {
  selectedKey: KeyView | null;
  selectedKeys: KeyView[];
  pick: KeyPick | null;
  onPick: (pick: KeyPick | null) => void;
  layer: number;
  onLayerChange(layer: number): void;
}) {
  const { bundle, state, io, dispatch } = useWorkbench();
  const [kind, setKind] = useState<LightingKeyKind>("output-mode");
  const [message, setMessage] = useState<string | null>(null);
  const installing = useRef(false);
  const status = bundle.runtimeConditionalStatus;
  const supported = kind === "output-mode"
    ? state.lightingOutputMode !== null
    : state.lightingExtension !== null && ((bundle.lightingCaps?.features ?? 0) & RUNTIME_EFFECTS_CONDITIONS) !== 0;
  const busy = hasPendingConfigurationWrite(state);
  const wakes = maskHasLayer(
    state.lightingOutputMode?.wake_layers ?? state.lightingControls.wake_layers,
    layer,
  );

  const install = async () => {
    if (installing.current || busy || state.batchMode || !supported || !status || selectedKey?.ledId === undefined) return;
    installing.current = true;
    dispatch({ type: "lightingBusy", busy: true, error: null });
    setMessage("Installing key action and indicator…");
    try {
      const result = await writeLightingKeyPreset(
        {
          setKey: (preset, action) => io.setKey(preset.layer, preset.row, preset.col, action, { history: "invalidate" }),
          applyRules: (rules) => io.applyConditionalScenes(rules),
        },
        state.runtimeConditionalDraft,
        { kind, layer, row: selectedKey.row, col: selectedKey.col, led: selectedKey.ledId },
        status.capacity,
      );
      setMessage(result.ok ? `Configured ${keyAddressLabel(selectedKey)} on layer ${layer}: action and status lighting.` : result.message);
      if (result.ok) {
        onPick(null);
        dispatch({ type: "lightingSelect", leds: [] });
      }
    } finally {
      installing.current = false;
      dispatch({ type: "lightingBusy", busy: false });
    }
  };

  if (!status) return null;
  return (
    <div className="mt-3 rounded-lg border border-line-soft bg-well p-3">
      <div className="text-[12.5px] font-medium text-ink">Lighting control key</div>
      <p className="mt-1 text-[11px] leading-relaxed text-faint">
        Pick one key, then install its behavior and status colors together.
      </p>
      <KeyChoice
        pick={LIGHTING_KEY_PICK}
        active={pick === LIGHTING_KEY_PICK}
        keys={selectedKeys}
        problem={
          selectedKeys.length > 1 && pick !== BATTERY_BAR_PICK
            ? `${selectedKeys.length} keys are chosen; a lighting control key needs exactly one.`
            : undefined
        }
        onPick={onPick}
      />
      <div className="mt-2 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2">
        <label className="text-[11px] text-faint">
          Preset
          <select value={kind} onChange={(event) => setKind(event.target.value as LightingKeyKind)}
            disabled={busy} className="mt-1 w-full rounded-md border border-line bg-raised px-2 py-1.5 text-[12px] text-ink">
            <option value="output-mode">Cycle lighting policy</option>
            <option value="effects">Toggle RGB effects</option>
          </select>
        </label>
        <label className="text-[11px] text-faint">
          Layer
          <select value={layer} onChange={(event) => onLayerChange(Number(event.target.value))}
            disabled={busy} className="mt-1 w-full rounded-md border border-line bg-raised px-2 py-1.5 text-[12px] text-ink">
            {Array.from({ length: bundle.caps.num_layers }, (_, index) => (
              <option key={index} value={index}>Layer {index}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-mute">
        {kind === "output-mode"
          ? "Press to cycle always on → always off → USB-powered only. The key shows green → red → blue."
          : "Press to toggle RGB effects. The key shows green when effects are enabled and dim red when disabled."}
        {" "}The indicator appears while this layer is active.
      </p>
      {!wakes && <p className="mt-2 text-[11px] leading-relaxed text-faint">
        To see the indicator while lighting is off, select this layer above the board and use
        “MoErgo Magic Layer” below. Its lighting will wake whenever that layer is active.
      </p>}
      {!supported && <p className="mt-2 text-[11px] text-warn">
        {kind === "output-mode" ? "This firmware does not report lighting output policy support." : "This preset needs RGB extension effects and effects-status conditions."}
      </p>}
      {state.batchMode && <p className="mt-2 text-[11px] text-warn">
        Finish batch editing and turn batch mode off to install the action and lighting together.
      </p>}
      <Button variant="outline" className="mt-2 w-full"
        disabled={!selectedKey || !supported || busy || state.batchMode || status.capacity === 0}
        onClick={install}>
        {selectedKey ? `Configure ${keyAddressLabel(selectedKey)} · action + lighting` : "Choose a key first"}
      </Button>
      {message && <p role="status" className="mt-2 text-[11px] leading-relaxed text-mute">{message}</p>}
    </div>
  );
}
