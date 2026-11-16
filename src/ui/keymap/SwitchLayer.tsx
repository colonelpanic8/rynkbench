// Switch Layer, as in GLIDE: how the key switches (while held, hold layer and
// tap a key, next key only, toggle, switch to, make default), then which layer.

import { useState } from "react";

import { useWorkbench } from "../state";

import { layerName } from "../layer-names";

import { cx } from "../kit";

/* ------------------------------------------------------------------ */
/* Switch Layer                                                        */
/* ------------------------------------------------------------------ */

export type LayerKind = "LayerOn" | "HoldTap" | "OneShotLayer" | "LayerToggle" | "LayerToggleOnly" | "DefaultLayer";

const LAYER_KINDS: Array<{ id: LayerKind; label: string; hint: string }> = [
  { id: "LayerOn", label: "While held", hint: "The layer is on while the key is held" },
  { id: "HoldTap", label: "Hold layer, tap key", hint: "Held: the layer. Tapped: a key you pick next" },
  { id: "OneShotLayer", label: "Next key only", hint: "The layer is on for the next key press" },
  { id: "LayerToggle", label: "Toggle", hint: "Each press turns the layer on or off" },
  { id: "LayerToggleOnly", label: "Switch to", hint: "Turns the layer on and every other off" },
  { id: "DefaultLayer", label: "Make default", hint: "The keyboard starts on this layer from now on" },
];

export function SwitchLayer({ onPick, disabled }: { onPick: (kind: LayerKind, layer: number) => void; disabled: boolean }) {
  const { state } = useWorkbench();
  const [kind, setKind] = useState<LayerKind>("LayerOn");
  const layers = (state.layerMetadata ?? [])
    .map((metadata, index) => ({ index, occupied: metadata.occupied }))
    .filter((layer) => layer.occupied);
  return (
    <div className={cx("flex flex-col gap-3", disabled && "pointer-events-none opacity-40")}>
      <div className="flex flex-wrap gap-1.5">
        {LAYER_KINDS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setKind(option.id)}
            className={cx(
              "cursor-pointer rounded-full border px-3 py-1 text-small font-semibold transition-colors",
              kind === option.id ? "border-accent bg-accent-dim/40 text-accent" : "border-line text-mute hover:text-ink",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-small text-faint">{LAYER_KINDS.find((option) => option.id === kind)?.hint}</p>
      <div className="flex flex-wrap gap-1.5">
        {layers.map((layer) => (
          <button
            key={layer.index}
            type="button"
            onClick={() => onPick(kind, layer.index)}
            className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line bg-raised px-3 text-body font-semibold text-ink transition-all hover:-translate-y-px hover:border-line-strong hover:bg-hover"
          >
            <span className="font-mono text-caption text-faint">{layer.index}</span>
            {layerName(state.layerMetadata, layer.index)}
          </button>
        ))}
      </div>
    </div>
  );
}

