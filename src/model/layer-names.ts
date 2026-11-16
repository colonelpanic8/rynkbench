// How a layer is named to the person: by the name it was given, else by its
// number. Pure, so core code (layer moves, history) can name layers too; the
// screens use it through ui/layer-names.ts and ui/useKeyText.ts.

/** A layer on its own: its name, else "Layer n". An empty or blank stored name is no name. */
export function layerName(metadata: readonly { name: string }[] | null | undefined, layer: number): string {
  return metadata?.[layer]?.name?.trim() || `Layer ${layer}`;
}
