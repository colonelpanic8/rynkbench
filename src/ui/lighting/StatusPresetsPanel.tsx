// Status setups, in Layout properties' RGB Lighting tab under Advanced: a
// layer's status lights installed together with the keys that switch what
// they show. On a Glove80, the Magic status cluster (a battery bar per half,
// Bluetooth 1–3 and USB) and MoErgo's stock Magic layer. One key's status
// light is set on the key itself (its RGB Lighting tab). The rules join the
// draft (sent with Review & send; in Live, once you pause), as every light does.

import { useState } from "react";
import type { KeyView } from "../../model/keyboard";
import { Button, SectionLabel } from "../kit";
import { useCapability } from "../use-capabilities";
import { layerName } from "../layer-names";
import { useWorkbench } from "../state";
import { StockMagicLayerPanel } from "./StockMagicLayerPanel";
import { stockMagicIndicatorKeys } from "../../model/lighting/stock-magic-layer";
import { GLOVE80_BAR_LAYOUTS, glove80ConnectionKeys, installGlove80StatusRules, writeGlove80StatusSetup } from "../../model/lighting/status-presets";
import type { Glove80BarLayout } from "../../model/lighting/status-presets";
import { layersInMask } from "../../model/lighting/wake-layers";
import { hasConnectionEffectsConditions, hasLayerIndicatorConditions } from "../../session/lighting-features";

const selectClass = "mt-1 w-full rounded-md border border-line bg-raised px-2 py-1.5 text-body text-ink";

function keyAt(keys: KeyView[], row: number, col: number): KeyView | undefined {
  return keys.find((key) => key.row === row && key.col === col);
}

export function StatusPresetsPanel() {
  const { bundle, state, dispatch, io } = useWorkbench();
  const ruleTable = useCapability("lighting.rules");
  const numLayers = bundle.caps.num_layers;
  const wakeLayers = state.lightingOutputMode?.wake_layers ?? state.lightingControls.wake_layers;
  const [wakeLayer] = layersInMask(wakeLayers, numLayers);
  const preferredLayer = bundle.boardProfile?.defaultStatusLayer;
  const defaultLayer = wakeLayer ?? (preferredLayer !== undefined && preferredLayer < numLayers ? preferredLayer : state.currentLayer);
  // Follow the current wake policy until a layer is chosen.
  const [chosenLayer, setChosenLayer] = useState<number | null>(null);
  const layer = chosenLayer !== null && chosenLayer < numLayers ? chosenLayer : defaultLayer;
  const [layout, setLayout] = useState<Glove80BarLayout>("outer-columns");
  const [message, setMessage] = useState<string | null>(null);

  if (ruleTable === undefined) return null;

  const nameOf = (n: number) => layerName(state.layerMetadata, n);
  const predicatesSupported = hasConnectionEffectsConditions(bundle.lightingCaps);
  // The tagged rule API carries the layer and lock-indicator predicates the
  // stock Magic layer needs, so firmware shipping RULES alone qualifies.
  const magicSupported = hasLayerIndicatorConditions(bundle.lightingCaps);
  const glove80Available =
    bundle.boardProfile?.presets.includes("glove80-status") &&
    numLayers > 2 &&
    bundle.caps.num_split_peripherals > 0 &&
    bundle.caps.num_ble_profiles >= 3 &&
    glove80ConnectionKeys(layer).every((preset) => keyAt(bundle.model.keys, preset.row, preset.col)?.ledId === preset.led);
  const stockMagicAvailable =
    glove80Available &&
    bundle.boardProfile?.presets.includes("glove80-stock-magic") &&
    stockMagicIndicatorKeys().every((indicator) => keyAt(bundle.model.keys, indicator.row, indicator.col)?.ledId === indicator.led);
  if (!glove80Available) return null;

  const installGlove80 = async () => {
    const rules = installGlove80StatusRules(state.runtimeConditionalDraft, layer, layout);
    if (rules.length > ruleTable.slots) {
      setMessage(`The complete Glove80 setup needs ${rules.length} rules; this keyboard holds ${ruleTable.slots}.`);
      return;
    }
    const result = await writeGlove80StatusSetup(
      {
        setKey: (preset, action) => io.setKey(preset.layer, preset.row, preset.col, action),
        applyRules: async (next) => {
          dispatch({ type: "conditionalDraft", cells: next });
          return { ok: true };
        },
      },
      state.runtimeConditionalDraft,
      layer,
      layout,
    );
    setMessage(
      result.ok
        ? `${nameOf(layer)} has ${layout === "stock" ? "MoErgo-style" : "outer-column"} battery bars, three Bluetooth profile keys and the USB status key.`
        : `Not installed: ${result.message}`,
    );
  };

  return (
    <div>
      <SectionLabel>Status setup</SectionLabel>
      <label className="mt-2 block text-small text-faint">
        On the layer
        <select value={layer} onChange={(event) => setChosenLayer(Number(event.target.value))} className={selectClass}>
          {Array.from({ length: numLayers }, (_, index) => (
            <option key={index} value={index}>
              {nameOf(index)}
              {index === wakeLayer ? " · wakes the lights" : ""}
            </option>
          ))}
        </select>
      </label>

      {predicatesSupported ? (
        <div className="mt-2 rounded-lg border border-accent-deep/40 bg-accent-dim/15 p-3">
          <div className="text-body font-medium text-ink">Glove80 Magic status cluster</div>
          <p className="mt-1 text-small leading-relaxed text-faint">
            A battery bar per half, Bluetooth 1–3 on the lower left thumb arc and USB on the upper thumb key. Running it again
            replaces it.
          </p>
          <label className="mt-2 block text-small text-faint">
            Battery bars
            <select value={layout} onChange={(event) => setLayout(event.target.value as Glove80BarLayout)} className={selectClass}>
              {GLOVE80_BAR_LAYOUTS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label} · {entry.hint}
                </option>
              ))}
            </select>
          </label>
          <Button variant="primary" className="mt-2 w-full" disabled={state.lightingBusy} onClick={installGlove80}>
            Install complete Glove80 setup on {nameOf(layer)}
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-small leading-relaxed text-warn">Update firmware to install Bluetooth and USB status keys.</p>
      )}

      {stockMagicAvailable && magicSupported && <StockMagicLayerPanel layer={layer} />}
      {stockMagicAvailable && !magicSupported && (
        <p className="mt-2 text-small leading-relaxed text-warn">
          Update firmware to install the stock Magic layer with layer and lock indicators.
        </p>
      )}
      {message && <p className="mt-2 text-small leading-relaxed text-mute">{message}</p>}
    </div>
  );
}
