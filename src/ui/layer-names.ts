import type { LayerMetadata } from "../session/types";

/** The user-facing name of a layer, falling back to its physical number. */
export function layerName(
  metadata: readonly LayerMetadata[] | null | undefined,
  layer: number,
): string {
  return metadata?.[layer]?.name || `Layer ${layer}`;
}
