// Overlay + per-layer edit targets, styled like Keymap mode's layer tabs.
// Only rendered when the firmware supports on-device scenes.

import { useMemo } from "react";
import { layerName } from "../layer-names";
import type { LightingTarget } from "../state";
import { useWorkbench } from "../state";
import { UnderlineTabs } from "../kit";

export function LightingTargets() {
  const { bundle, state, dispatch } = useWorkbench();
  const numLayers = bundle.caps.num_layers;
  const target = state.lightingTarget;

  const layersWithCells = useMemo(() => {
    const set = new Set<number>();
    for (const cell of state.compiledScenes) set.add(cell.layer);
    for (const cell of state.scenes) set.add(cell.layer);
    return set;
  }, [state.compiledScenes, state.scenes]);

  // Mirror Keymap mode's tabs: occupied layers by name, plus any layer that
  // already carries scene cells so nothing lit is hidden.
  const layers = useMemo(() => {
    const set = new Set(layersWithCells);
    if (state.layerMetadata) {
      state.layerMetadata.forEach((metadata, layer) => {
        if (metadata.occupied) set.add(layer);
      });
    } else {
      for (let layer = 0; layer < numLayers; layer++) set.add(layer);
    }
    if (target !== "overlay") set.add(target);
    return [...set].filter((layer) => layer < numLayers).sort((a, b) => a - b);
  }, [layersWithCells, state.layerMetadata, numLayers, target]);

  const items = (["overlay", ...layers] as LightingTarget[]).map((t) => {
    const isLayer = t !== "overlay";
    const live = isLayer && t === state.currentLayer;
    const hasContent = isLayer && layersWithCells.has(t);
    return {
      id: t === "overlay" ? "overlay" : `L${t}`,
      title: isLayer
        ? `${layerName(state.layerMetadata, t)} · physical layer ${t} · scene ${
            hasContent ? "lit" : "unlit"
          }${live ? " · effective layer" : ""}`
        : "Transient overlay — cleared on reboot",
      label: (
        <>
          <span>{isLayer ? layerName(state.layerMetadata, t) : "Overlay"}</span>
          {hasContent && <span className="size-1 rounded-full bg-accent" />}
          {live && <span title="Effective layer" className="size-1.5 rounded-full bg-ok" />}
        </>
      ),
    };
  });

  return (
    <div className="flex items-center gap-3 px-1">
      <UnderlineTabs
        items={items}
        value={target === "overlay" ? "overlay" : `L${target}`}
        onChange={(id) =>
          dispatch({
            type: "lightingTarget",
            target: id === "overlay" ? "overlay" : Number(id.slice(1)),
          })
        }
      />
    </div>
  );
}
