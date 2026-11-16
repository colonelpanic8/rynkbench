// How layers light up, in Layout properties' RGB Lighting tab under Advanced:
// how many scene cells the keyboard holds and how many are used, whether only
// the top layer lights or every active one (top wins), and which layers wake
// the lights while they are off. Lights a pre-scene Rynkbench kept in this
// browser can be added to the layout (into the draft).

import { useState } from "react";
import type { LightingLayerPolicy } from "../../model/lighting-types";
import { SETTING_KEYS, readSetting } from "../settings";
import { layerName } from "../layer-names";
import { useWorkbench } from "../state";
import { useCapabilities, useCapability } from "../use-capabilities";
import { Button, SectionLabel, Segmented, cx } from "../kit";
import { maskHasLayer, setLayerInMask } from "../../model/lighting/wake-layers";
import { layerLightingActions } from "../../workbench/draft/changes";
import type { LightingOverlayCell } from "../../model/lighting-types";

const POLICIES: Array<{ id: LightingLayerPolicy; label: string; hint: string }> = [
  { id: "EffectiveOnly", label: "Top layer only", hint: "Only the topmost active layer lights" },
  { id: "ActiveStack", label: "Every active layer", hint: "Every active layer lights, the top one wins" },
];

/** What a pre-scene Rynkbench kept in this browser: each layer's lights. */
function localPresets(serial: string): Record<number, { cells: LightingOverlayCell[] }> {
  try {
    const raw = readSetting(SETTING_KEYS.layerLighting(serial));
    return raw ? ((JSON.parse(raw) as { presets?: Record<number, { cells: LightingOverlayCell[] }> }).presets ?? {}) : {};
  } catch {
    return {};
  }
}

export function LayerLightingSettings() {
  const { bundle, state, dispatch, io } = useWorkbench();
  const scenes = useCapability("lighting.scenes");
  const wakes = useCapabilities().has("lighting.output");
  const serial = bundle.info.serial_number;
  const [kept, setKept] = useState(() => localPresets(serial));
  if (!scenes) return null;

  const numLayers = bundle.caps.num_layers;
  const wakeLayers = state.lightingOutputMode?.wake_layers ?? state.lightingControls.wake_layers;
  const keptLayers = Object.keys(kept).map(Number).filter((layer) => layer >= 0 && layer < numLayers);

  /** Each kept layer's lights replace that layer's, in the draft; the browser keeps its copy. */
  const copyKept = () => {
    for (const layer of keptLayers) {
      const cells = kept[layer].cells.map((cell) => ({ ...cell, ttl_ms: undefined }));
      for (const action of layerLightingActions(state, layer, cells)) dispatch(action);
    }
    setKept({});
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <SectionLabel>Layers</SectionLabel>
        <span className="tnum text-small text-faint">
          {state.scenes.length}/{scenes.slots} lit keys stored
        </span>
      </div>
      <div>
        <div className="text-small text-faint">When several layers are on</div>
        <Segmented
          className="mt-1"
          items={POLICIES.map((policy) => ({ value: policy.id, label: policy.label, title: policy.hint, disabled: state.lightingBusy }))}
          value={state.scenePolicy}
          onChange={(policy) => io.setScenePolicy(policy)}
        />
      </div>
      {wakes && (
        <div>
          <div className="text-small text-faint">Wake the lights while they are off</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {Array.from({ length: numLayers }, (_, layer) => {
              const on = maskHasLayer(wakeLayers, layer);
              return (
                <button
                  key={layer}
                  type="button"
                  aria-pressed={on}
                  disabled={state.lightingBusy}
                  onClick={() => io.setWakeLayers(setLayerInMask(wakeLayers, layer, !on))}
                  className={cx(
                    "h-7 cursor-pointer rounded-md border px-2 text-small transition-colors disabled:cursor-not-allowed",
                    on ? "border-accent bg-accent-dim text-accent" : "border-line bg-raised text-mute hover:border-line-strong",
                  )}
                >
                  {layerName(state.layerMetadata, layer)}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {keptLayers.length > 0 && (
        <Button variant="outline" className="py-1" disabled={state.lightingBusy} onClick={copyKept}>
          Add the lights kept in this browser for {keptLayers.length} layer{keptLayers.length === 1 ? "" : "s"}
        </Button>
      )}
    </div>
  );
}
