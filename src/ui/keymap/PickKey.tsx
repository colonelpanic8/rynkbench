// Pick Key, as in GLIDE: modifier chips (L/R, ⌘ ⌥ ⇧ ⌃) that go with the next
// key, a search that also finds layers (Enter picks the first result), quick
// links to the groups, and every key in its group (pickKey.ts).

import { useMemo, useRef, useState, useSyncExternalStore } from "react";

import type { Action, ModifierCombination } from "../../model/action-types";
import { modifierSymbols, anyModifier } from "../labels";

import { useWorkbench } from "../state";

import { layerName } from "../layer-names";
import { LOCALES, activeLocale, getLocaleId, subscribeLocale } from "../locale";
import { cx } from "../kit";
import { SearchIcon } from "../icons";

import { noModifiers } from "../../model/slots";

import { mergeModifiers } from "./actions";
import { layerTiles, pickKeyGroups, searchTiles, type Tile, type TileGroup } from "./pickKey";

/* ------------------------------------------------------------------ */
/* Pick Key                                                            */
/* ------------------------------------------------------------------ */

const MODIFIER_CHIPS: Array<{ id: "ctrl" | "alt" | "shift" | "gui"; symbol: string; name: string }> = [
  { id: "ctrl", symbol: "⌃", name: "Ctrl" },
  { id: "alt", symbol: "⌥", name: "Alt / Option" },
  { id: "shift", symbol: "⇧", name: "Shift" },
  { id: "gui", symbol: "⌘", name: "Command / Windows" },
];

function armedModifiers(side: "left" | "right", armed: Set<string>): ModifierCombination {
  const mods = noModifiers();
  for (const id of armed) (mods as unknown as Record<string, boolean>)[`${side}_${id}`] = true;
  return mods;
}

/** A tile's action with the armed modifiers added; they go with keys only. */
function withArmed(action: Action, mods: ModifierCombination): Action {
  if (!anyModifier(mods) || typeof action !== "object") return action;
  if ("Key" in action && typeof action.Key === "object" && "Hid" in action.Key) {
    return { KeyWithModifier: [action.Key.Hid, mods] } as Action;
  }
  if ("KeyWithModifier" in action) {
    const [code, own] = action.KeyWithModifier;
    return { KeyWithModifier: [code, mergeModifiers(mods, own)] } as Action;
  }
  return action;
}

function TileButton({ tile, onPick }: { tile: Tile; onPick: (tile: Tile) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(tile)}
      title={tile.lilac ? `${tile.label} (needs Shift or AltGr)` : tile.label}
      className={cx(
        "flex h-12 min-w-12 cursor-pointer items-center justify-center rounded-lg border px-3 text-body font-semibold transition-all duration-150 hover:-translate-y-px hover:border-line-strong hover:bg-hover hover:shadow-md",
        tile.lilac ? "border-accent-deep/40 bg-accent-dim/30 text-ink" : "border-line bg-raised text-ink",
      )}
    >
      {tile.label}
    </button>
  );
}

function GroupTiles({ group, onPick }: { group: TileGroup; onPick: (tile: Tile) => void }) {
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
          <div className="flex flex-wrap gap-2">
            {tiles.map((tile) => (
              <TileButton key={tile.id} tile={tile} onPick={onPick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PickKey({ onPick, disabled }: { onPick: (action: Action | "Transparent") => void; disabled: boolean }) {
  const { bundle, state } = useWorkbench();
  const localeId = useSyncExternalStore(subscribeLocale, getLocaleId, getLocaleId);
  const groups = useMemo(
    () =>
      pickKeyGroups(LOCALES.find((locale) => locale.id === localeId) ?? activeLocale(), {
        userActions: bundle.boardProfile?.userActions,
      }),
    [localeId, bundle.boardProfile],
  );
  const [query, setQuery] = useState("");
  const [side, setSide] = useState<"left" | "right">("left");
  const [armed, setArmed] = useState<Set<string>>(new Set());
  const [showMore, setShowMore] = useState(false);
  const [lit, setLit] = useState<string | null>(null);
  // The group at the top of the list: its chip is filled, as in GLIDE.
  const [inView, setInView] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const followScroll = () => {
    const list = scroller.current;
    if (!list) return;
    const sections = [...list.querySelectorAll<HTMLElement>("[data-group]")];
    const top = sections.filter((section) => section.offsetTop - 8 <= list.scrollTop).at(-1) ?? sections[0];
    setInView(top?.dataset.group ?? null);
  };

  const layers = (state.layerMetadata ?? [])
    .map((metadata, index) => ({ index, occupied: metadata.occupied, name: layerName(state.layerMetadata, index) }))
    .filter((layer) => layer.occupied);
  const found = query.trim()
    ? [layerTiles(layers, query), ...searchTiles(groups, query)].filter((g): g is TileGroup => g !== null)
    : [...groups.main, ...(showMore ? groups.more.map((g) => ({ ...g, name: `All keys · ${g.name}` })) : [])];
  const first = found[0]?.tiles[0];
  const mods = armedModifiers(side, armed);

  const pick = (tile: Tile) => {
    onPick(tile.action === "Transparent" ? "Transparent" : withArmed(tile.action, mods));
    setArmed(new Set());
  };
  const jump = (id: string) => {
    const target = scroller.current?.querySelector<HTMLElement>(`[data-group="${id}"]`);
    if (!target || !scroller.current) return;
    scroller.current.scrollTo({ top: target.offsetTop - 4, behavior: "smooth" });
    setLit(id);
    window.setTimeout(() => setLit(null), 900);
  };

  return (
    <div className={cx("flex min-h-0 flex-1 flex-col gap-2.5", disabled && "pointer-events-none opacity-40")}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-col rounded-lg border border-line bg-raised p-0.5" title="Which side's modifiers">
          {(["left", "right"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSide(value)}
              className={cx(
                "cursor-pointer rounded-md px-2 py-0.5 text-small font-semibold uppercase",
                side === value ? "bg-hover text-ink" : "text-faint hover:text-mute",
              )}
            >
              {value === "left" ? "L" : "R"}
            </button>
          ))}
        </div>
        {MODIFIER_CHIPS.map((chip) => {
          const on = armed.has(chip.id);
          return (
            <button
              key={chip.id}
              type="button"
              aria-pressed={on}
              title={`${chip.name}: click it, then a key`}
              onClick={() => {
                const next = new Set(armed);
                if (on) next.delete(chip.id);
                else next.add(chip.id);
                setArmed(next);
              }}
              className={cx(
                "flex size-12 cursor-pointer items-center justify-center rounded-lg border text-ui font-bold transition-colors",
                on ? "border-accent bg-accent-dim/40 text-accent" : "border-line bg-raised text-mute hover:text-ink",
              )}
            >
              {chip.symbol}
            </button>
          );
        })}
        <div className="relative min-w-48 flex-1">
          <SearchIcon size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-mute" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && first) {
                event.preventDefault();
                pick(first);
              }
            }}
            placeholder="Search keys, symbols, layers…"
            aria-label="Search keys"
            className="h-[38px] w-full rounded-xl border border-line-strong bg-hover pr-4 pl-10 text-ui text-ink placeholder:text-mute focus:border-accent focus:outline-none"
          />
          {query.trim() && first && (
            <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-caption text-faint">
              ↵ {first.label}
            </span>
          )}
        </div>
      </div>
      <p className="text-small text-mute">
        {armed.size > 0
          ? `Now click a key: ${modifierSymbols(mods)} goes with it (not with layers or actions).`
          : "For combinations like Shift+A: click a modifier first, then the key."}
      </p>
      {!query.trim() && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-line pb-4">
          {groups.main
            .filter((group) => group.chip)
            .map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => jump(group.id)}
                aria-current={(inView ?? groups.main[0]?.id) === group.id ? "true" : undefined}
                className={cx(
                  "flex h-6 shrink-0 cursor-pointer items-center rounded-full border px-2.5 text-small font-semibold transition-colors",
                  (inView ?? groups.main[0]?.id) === group.id
                    ? "border-accent bg-accent-fill text-on-accent"
                    : "border-line-strong bg-hover text-mute hover:text-ink",
                )}
              >
                {group.chip}
              </button>
            ))}
        </div>
      )}
      <div ref={scroller} onScroll={followScroll} className="relative min-h-0 flex-1 overflow-y-auto pr-1">
        {found.length === 0 && (
          <p className="py-6 text-center text-body text-faint">Nothing matches “{query}”.</p>
        )}
        <div className="flex flex-col gap-4">
          {found.map((group) => (
            <section key={group.id + group.name} data-group={group.id} className="flex flex-col gap-2">
              <h3
                className={cx(
                  "text-small font-semibold uppercase tracking-widest transition-colors duration-300",
                  lit === group.id ? "text-accent" : "text-mute",
                )}
              >
                {group.name}
              </h3>
              <GroupTiles group={group} onPick={pick} />
            </section>
          ))}
          {!query.trim() && !showMore && (
            <button
              type="button"
              onClick={() => setShowMore(true)}
              className="self-start cursor-pointer rounded-lg border border-dashed border-line-strong px-3 py-1.5 text-body font-semibold text-mute hover:text-ink"
            >
              All keys…
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

