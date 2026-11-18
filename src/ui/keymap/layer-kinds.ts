// How a key or step switches a layer, in the words GLIDE uses: shared by
// Switch Layer and the layers Pick Key lists. No React.

import type { Action } from "../../model/action-types";

export type LayerKind = "LayerOn" | "HoldTap" | "OneShotLayer" | "LayerToggle" | "LayerToggleOnly" | "DefaultLayer";

/** A way of switching that is one action (not "hold layer, tap key", which is a whole key). */
export type LayerActionKind = Exclude<LayerKind, "HoldTap">;

export const LAYER_KINDS: ReadonlyArray<{ id: LayerKind; label: string; hint: string }> = [
  { id: "LayerOn", label: "While held", hint: "The layer is on while the key is held" },
  { id: "HoldTap", label: "Hold layer, tap key", hint: "Held: the layer. Tapped: a key you pick next" },
  { id: "OneShotLayer", label: "Next key only", hint: "The layer is on for the next key press" },
  { id: "LayerToggle", label: "Toggle", hint: "Each press turns the layer on or off" },
  { id: "LayerToggleOnly", label: "Switch to", hint: "Turns the layer on and every other off" },
  { id: "DefaultLayer", label: "Make default", hint: "The keyboard starts on this layer from now on" },
];

/** The ways a single action can switch a layer: for a behavior's slot or a macro step. */
export const LAYER_ACTION_KINDS = LAYER_KINDS.filter(
  (kind): kind is { id: LayerActionKind; label: string; hint: string } => kind.id !== "HoldTap",
);

export function layerAction(kind: LayerActionKind, layer: number): Action {
  return { [kind]: layer } as Record<LayerActionKind, number> as Action;
}
