// Pick Key's search: the key groups narrowed to what you type, with the layers
// and your own behaviors whose names match, as in GLIDE. A typed character's
// own tile comes first. No React.

import type { Action, Morse } from "../../model/action-types";
import { morseIsEmpty } from "../../model/slots";
import { actionTile, type Tile, type TileGroup } from "./pickTiles";

/** One of your behaviors as the search sees it: its name (its own, or the kind
 *  and number), what it does in short, and what binding it would be. */
export interface BehaviorEntry {
  kind: "macros" | "morse";
  index: number;
  name: string;
  /** Its description and what it does, to find it by. */
  detail: string;
}

/** Your macros and tap patterns, for the search: the filled slots, in order. */
export function behaviorEntries(input: {
  /** Each macro slot's steps in short; null for a free slot. */
  macros: readonly (string | null)[];
  morse: readonly Morse[];
  title: (kind: "macros" | "morse", index: number) => string;
  describe: (kind: "macros" | "morse", index: number) => string;
}): BehaviorEntry[] {
  const entry = (kind: "macros" | "morse", index: number, does: string): BehaviorEntry => ({
    kind,
    index,
    name: input.title(kind, index),
    detail: `${input.describe(kind, index)} ${does}`,
  });
  return [
    ...input.macros.flatMap((preview, index) => (preview === null ? [] : [entry("macros", index, preview)])),
    ...input.morse.flatMap((morse, index) => (morseIsEmpty(morse) ? [] : [entry("morse", index, "tap pattern tap dance hold")])),
  ];
}

/** Behavior tiles for a search: each macro and tap pattern whose name or detail
 *  holds every word (a tap pattern is a whole key; narrowTo drops it for a slot). */
export function behaviorTiles(entries: readonly BehaviorEntry[], query: string): TileGroup | null {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return null;
  const tiles = entries
    .filter((entry) => terms.every((term) => `${entry.name} ${entry.detail}`.toLowerCase().includes(term)))
    .map((entry) =>
      entry.kind === "macros"
        ? actionTile(`macro:${entry.index}`, entry.name, { TriggerMacro: entry.index } as Action)
        : actionTile(`morse:${entry.index}`, entry.name, { Morse: entry.index }),
    );
  return tiles.length > 0 ? { id: "behaviors", name: "Your behaviors", tiles } : null;
}

/** Layer tiles for a search: hold, toggle or switch to each layer whose name matches. */
export function layerTiles(layers: Array<{ index: number; name: string }>, query: string): TileGroup | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const tiles = layers
    .filter((layer) => `${layer.name} layer ${layer.index}`.toLowerCase().includes(q))
    .flatMap((layer) => [
      actionTile(`layer-on:${layer.index}`, `While held: ${layer.name}`, { LayerOn: layer.index } as Action, ""),
      actionTile(`layer-toggle:${layer.index}`, `Toggle ${layer.name}`, { LayerToggle: layer.index } as Action, ""),
      actionTile(`layer-to:${layer.index}`, `Switch to ${layer.name}`, { LayerToggleOnly: layer.index } as Action, ""),
    ]);
  return tiles.length > 0 ? { id: "layers", name: "Layers", tiles } : null;
}

/** The groups narrowed to a search: every word must appear; All keys results
 *  are marked as coming from there. */
export function searchTiles(groups: { main: TileGroup[]; more: TileGroup[] }, query: string): TileGroup[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return groups.main;
  const exact = query.trim();
  const match = (tile: Tile) =>
    tile.label === exact || terms.every((term) => tile.search.includes(term) || tile.label.toLowerCase().includes(term));
  const narrowed = (list: TileGroup[]) =>
    list.map((group) => ({ ...group, tiles: group.tiles.filter(match) })).filter((group) => group.tiles.length > 0);
  // A typed character first: the tile that types exactly it.
  const all = [...narrowed(groups.main), ...narrowed(groups.more).map((group) => ({ ...group, name: `All keys · ${group.name}` }))];
  const exactTile = all.flatMap((group) => group.tiles).find((tile) => tile.label === exact);
  return exactTile
    ? [{ id: "exact", name: "Best match", tiles: [exactTile] }, ...all.map((g) => ({ ...g, tiles: g.tiles.filter((t) => t !== exactTile) })).filter((g) => g.tiles.length)]
    : all;
}
