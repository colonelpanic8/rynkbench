// The label functions (labels.ts) bound to the open layout: its layer names
// (a layer key reads as its layer's name, as in GLIDE) and its morse table.
// Screens print keys through this; labels.ts stays pure.

import { useMemo } from "react";
import type { Action, KeyAction } from "../model/action-types";
import { actionDescription, actionLabel, keyActionDescription, keyActionGlyph, layerRef } from "./labels";
import { useLayerNames } from "./layer-names";
import { useWorkbench } from "./state";

export function useKeyText() {
  const { state } = useWorkbench();
  const names = useLayerNames();
  const morse = state.morse;
  return useMemo(
    () => ({
      names,
      /** A key's face as text (`.text`), with its hold below. */
      glyph: (action: KeyAction) => keyActionGlyph(action, morse, names),
      /** A key in a sentence. */
      describe: (action: KeyAction) => keyActionDescription(action, names),
      /** One action (a slot's), short. */
      label: (action: Action) => actionLabel(action, names),
      /** One action (a slot's), in a sentence. */
      describeAction: (action: Action) => actionDescription(action, names),
      /** A layer by its name, else "Layer n". */
      layer: (layer: number) => layerRef(names, layer, `Layer ${layer}`),
    }),
    [names, morse],
  );
}
