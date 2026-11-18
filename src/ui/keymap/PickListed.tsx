// What GLIDE's small picker lists above the keys, for a caller that turns it
// on (PickOffer): the layers, with how the step or slot switches them, and
// your behaviors, each under the word for its kind.

import { useState } from "react";

import { cx } from "../kit";
import { LAYER_ACTION_KINDS, layerAction, type LayerActionKind } from "./layer-kinds";
import { actionTile, type Tile, type TileGroup } from "./pickTiles";
import { TileButton } from "./TileButtons";

/** How many behaviors show before "Show all". */
const FIRST_BEHAVIORS = 8;

function Caption({ children }: { children: string }) {
  return <h3 className="text-caption font-semibold uppercase tracking-widest text-mute">{children}</h3>;
}

export function ListedLayers({
  layers,
  offered,
  onPick,
}: {
  layers: ReadonlyArray<{ index: number; name: string }>;
  /** Whether the caller takes this layer action. */
  offered: (tile: Tile) => boolean;
  onPick: (tile: Tile) => void;
}) {
  const [kind, setKind] = useState<LayerActionKind>("LayerOn");
  const how = LAYER_ACTION_KINDS.find((option) => option.id === kind);
  const tiles = layers
    .map((layer) => actionTile(`layer:${kind}:${layer.index}`, layer.name, layerAction(kind, layer.index)))
    .filter(offered);
  if (layers.length === 0) return null;
  return (
    <section data-group="layers" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Caption>Layers</Caption>
        <div role="radiogroup" aria-label="How it switches" className="flex flex-wrap rounded-lg border border-line bg-raised p-0.5">
          {LAYER_ACTION_KINDS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={kind === option.id}
              title={option.hint}
              onClick={() => setKind(option.id)}
              className={cx(
                "cursor-pointer rounded-md px-2 py-0.5 text-small font-semibold transition-colors",
                kind === option.id ? "bg-accent-fill text-on-accent" : "text-mute hover:text-ink",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5" title={how?.hint}>
        {tiles.map((tile) => (
          <TileButton key={tile.id} tile={tile} compact onPick={onPick} />
        ))}
      </div>
    </section>
  );
}

export function ListedBehaviors({ group, onPick }: { group: TileGroup | null; onPick: (tile: Tile) => void }) {
  const [all, setAll] = useState(false);
  if (!group || group.tiles.length === 0) return null;
  const shown = all ? group.tiles : group.tiles.slice(0, FIRST_BEHAVIORS);
  return (
    <section data-group="behaviors" className="flex flex-col gap-2">
      <Caption>Your behaviors</Caption>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((tile) => (
          <TileButton key={tile.id} tile={tile} compact onPick={onPick} />
        ))}
      </div>
      {group.tiles.length > FIRST_BEHAVIORS && (
        <button type="button" onClick={() => setAll(!all)} className="cursor-pointer self-start text-small font-semibold text-accent hover:underline">
          {all ? "Show fewer" : `Show all ${group.tiles.length}`}
        </button>
      )}
    </section>
  );
}
