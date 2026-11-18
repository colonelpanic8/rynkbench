// A Pick Key tile as a button, and a group of them under their small captions.

import { cx } from "../kit";
import type { Tile, TileGroup } from "./pickKey";

export function TileButton({ tile, compact, onPick }: { tile: Tile; compact: boolean; onPick: (tile: Tile) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(tile)}
      title={tile.lilac ? `${tile.label} (needs Shift or AltGr)` : tile.label}
      className={cx(
        "flex cursor-pointer items-center justify-center rounded-lg border font-semibold transition-all duration-150 hover:-translate-y-px hover:border-line-strong hover:bg-hover hover:shadow-md",
        compact ? (tile.caption ? "min-h-8 min-w-8 px-2.5 py-1 text-body" : "h-8 min-w-8 px-2 text-body") : "h-12 min-w-12 px-3 text-body",
        tile.lilac ? "border-accent-deep/40 bg-accent-dim/30 text-ink" : "border-line bg-raised text-ink",
      )}
    >
      {tile.caption ? (
        <span className="flex flex-col items-center leading-tight">
          <span className="text-caption font-semibold uppercase tracking-widest text-faint">{tile.caption}</span>
          <span className="font-mono">{tile.label}</span>
        </span>
      ) : (
        tile.label
      )}
    </button>
  );
}

export function GroupTiles({ group, compact, onPick }: { group: TileGroup; compact: boolean; onPick: (tile: Tile) => void }) {
  // Tiles under their small captions, in the order the captions first appear.
  const clusters: Array<[string | undefined, Tile[]]> = [];
  for (const tile of group.tiles) {
    const last = clusters.at(-1);
    if (last && last[0] === tile.cluster) last[1].push(tile);
    else clusters.push([tile.cluster, [tile]]);
  }
  return (
    <div className="flex flex-col gap-2">
      {clusters.map(([cluster, tiles], index) => (
        <div key={index} className="flex flex-col gap-1.5">
          {cluster && <span className="text-caption text-faint">{cluster}</span>}
          <div className={cx("flex flex-wrap", compact ? "gap-1.5" : "gap-2")}>
            {tiles.map((tile) => (
              <TileButton key={tile.id} tile={tile} compact={compact} onPick={onPick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
