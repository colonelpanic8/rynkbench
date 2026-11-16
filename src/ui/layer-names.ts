import { useMemo } from "react";
import type { LayerMetadata } from "../session/types";
import type { LayerNames } from "./labels";
import { useWorkbench } from "./state";

export { layerName } from "../model/layer-names";

/** The layout's layer names, by layer ("" when unnamed), for the label functions. */
export function layerNamesOf(metadata: readonly LayerMetadata[] | null | undefined): LayerNames {
  return (metadata ?? []).map((layer) => layer?.name?.trim() || undefined);
}

/** The open layout's layer names: every key and line names layers by them, as GLIDE does. */
export function useLayerNames(): LayerNames {
  const { state } = useWorkbench();
  return useMemo(() => layerNamesOf(state.layerMetadata), [state.layerMetadata]);
}
