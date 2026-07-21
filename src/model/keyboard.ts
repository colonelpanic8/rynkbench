// KeyboardModel: the render-ready view of a device, assembled entirely from
// what the device reports — LayoutInfo (key outlines, rotation, encoders) and
// the lighting topology (LED identity/routes/zones). Rynkbench has no
// board-specific code above this module; a "Glove80" is just whatever a
// session reports. Optional enrichment (static labels, display names) may be
// layered on top when known, but must never be required to render.

import type { Key, LayoutInfo, Variant } from "../vendor/rynk-wasm/rynk_wasm";
import type { LightingLedId } from "../vendor/rynk-wasm/rynk_wasm";
import type { LightingTopology } from "../session/types";

export interface KeyView {
  /** Matrix identity — the stable address for keymap operations. */
  row: number;
  col: number;
  /** Outline in key-units: center rect, clockwise rotation in degrees about
   *  the main rect's center, optional second rect for L-shaped keys. Straight
   *  from the device layout. */
  shape: Key;
  /** Stable LED identity for lighting operations, when this key has one. */
  ledId?: LightingLedId;
  /** Zone ids this key's LED belongs to. */
  zoneIds: number[];
  /** Optional static label (enrichment); UI falls back to keymap-derived. */
  label?: string;
}

export interface KeyboardModel {
  name: string;
  variantIndex: number;
  /** Bounding box of all key outlines, in key-units. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  keys: KeyView[];
  encoders: Variant["encoders"];
  zones: LightingTopology["zones"];
  topologyRevision: number;
}

/** Optional per-board enrichment, keyed by "row,col". */
export interface BoardEnrichment {
  displayName?: string;
  labels?: Record<string, string>;
  /**
   * Known-good physical placement overriding what the device reports —
   * for boards whose firmware still serves a flat schematic layout.
   * Centers in key-units, r in clockwise degrees about the key's center
   * (the wire semantics). Device w/h are kept.
   */
  geometry?: Record<string, { x: number; y: number; r: number }>;
}

// Wire semantics (rmk-config layout.rs walk()): rect.x/y is the key's final
// visual center; `r` is clockwise degrees rotating the whole key — rect2
// included — about the main rect's center.
function keyCorners(key: Key): Array<[number, number]> {
  const rects = key.rect2 ? [key.rect, key.rect2] : [key.rect];
  const rad = key.r * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const px = key.rect.x;
  const py = key.rect.y;
  const corners: Array<[number, number]> = [];
  for (const rect of rects) {
    for (const [sx, sy] of [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ]) {
      const dx = rect.x + sx * rect.w - px;
      const dy = rect.y + sy * rect.h - py;
      corners.push([px + dx * cos - dy * sin, py + dx * sin + dy * cos]);
    }
  }
  return corners;
}

export function buildKeyboardModel(
  layout: LayoutInfo,
  topology: LightingTopology,
  options?: { variantIndex?: number; enrichment?: BoardEnrichment; fallbackName?: string },
): KeyboardModel {
  const variantIndex = options?.variantIndex ?? layout.default_variant;
  const variant = layout.variants[variantIndex];
  if (!variant) {
    throw new Error(`layout has no variant ${variantIndex}`);
  }

  // Index LED identity and zone membership by matrix position.
  const ledByMatrix = new Map<string, { ledId: LightingLedId; zoneIds: number[] }>();
  for (const led of topology.leds) {
    if (!led.key) continue;
    const zoneIds = topology.zoneMemberships
      .slice(led.zone_start, led.zone_start + led.zone_len)
      .map((z) => z);
    ledByMatrix.set(`${led.key.row},${led.key.col}`, { ledId: led.id, zoneIds });
  }

  const labels = options?.enrichment?.labels ?? {};
  const geometry = options?.enrichment?.geometry;
  const keys: KeyView[] = variant.keys.map((deviceShape) => {
    const at = `${deviceShape.row},${deviceShape.col}`;
    const led = ledByMatrix.get(at);
    const place = geometry?.[at];
    const shape = place
      ? {
          ...deviceShape,
          rect: { ...deviceShape.rect, x: place.x, y: place.y },
          r: place.r,
          rect2: undefined,
        }
      : deviceShape;
    return {
      row: deviceShape.row,
      col: deviceShape.col,
      shape,
      ledId: led?.ledId,
      zoneIds: led?.zoneIds ?? [],
      label: labels[at],
    };
  });

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const key of keys) {
    for (const [x, y] of keyCorners(key.shape)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (keys.length === 0) {
    minX = minY = 0;
    maxX = maxY = 1;
  }

  return {
    name: options?.enrichment?.displayName ?? variant.name ?? options?.fallbackName ?? "Keyboard",
    variantIndex,
    bounds: { minX, minY, maxX, maxY },
    keys,
    encoders: variant.encoders,
    zones: topology.zones,
    topologyRevision: topology.revision,
  };
}
