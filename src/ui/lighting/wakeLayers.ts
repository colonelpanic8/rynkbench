export function maskHasLayer(mask: number, layer: number): boolean {
  return Math.floor(mask / 2 ** layer) % 2 === 1;
}

export function layersInMask(mask: number, count: number): number[] {
  return Array.from({ length: count }, (_, layer) => layer).filter((layer) =>
    maskHasLayer(mask, layer),
  );
}

export function setLayerInMask(mask: number, layer: number, enabled: boolean): number {
  if (!Number.isSafeInteger(mask) || mask < 0) throw new Error("invalid wake-layer mask");
  if (!Number.isInteger(layer) || layer < 0) {
    throw new Error(`layer ${layer} cannot be represented in the wake-layer mask`);
  }
  const present = maskHasLayer(mask, layer);
  if (present === enabled) return mask;
  const next = enabled ? mask + 2 ** layer : mask - 2 ** layer;
  if (!Number.isSafeInteger(next)) {
    throw new Error(`layer ${layer} cannot be represented in the wake-layer mask`);
  }
  return next;
}
