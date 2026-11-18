// Pick Key, as in GLIDE: modifier chips (L/R, named as the computer names
// them) that go with the next key, a search that also finds layers and your
// behaviors (Enter picks the first result), quick links to the groups, and
// every key RMK has in its group (pickKey.ts). The same picker, compact, fills
// a behavior's slot, a macro step or a pointing key (`scope`).

import { useMemo, useRef, useState, useSyncExternalStore } from "react";

import type { Action, HidKeyCode, ModifierCombination } from "../../model/action-types";
import { decodeMacros, macroPreview } from "../../model/macros";
import { labelAt } from "../../model/behavior-labels";
import { noModifiers } from "../../model/slots";

import { useWorkbench } from "../state";
import { layerName } from "../layer-names";
import { LOCALES, activeLocale, getLocaleId, subscribeLocale } from "../locale";
import { useOs } from "../preferences";
import { useWording } from "../terms";
import { MODIFIER_ORDER, chordText, modifierLook, type Modifier } from "../keyface/modifiers";
import { behaviorTitle } from "../behaviors/library";
import { cx } from "../kit";
import { SearchIcon } from "../icons";

import { anyModifier } from "../labels";
import { mergeModifiers } from "./actions";
import {
  behaviorEntries,
  behaviorTiles,
  layerTiles,
  narrowTo,
  pickKeyGroups,
  searchTiles,
  type Pick,
  type PickScope,
  type Tile,
  type TileGroup,
} from "./pickKey";

function armedModifiers(side: "left" | "right", armed: ReadonlySet<Modifier>): ModifierCombination {
  const mods = noModifiers();
  for (const id of armed) mods[`${side}_${id}`] = true;
  return mods;
}

/** A tile's action with the armed modifiers added; they go with keys only. */
function withArmed(action: Pick, mods: ModifierCombination): Pick {
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

function TileButton({ tile, compact, onPick }: { tile: Tile; compact: boolean; onPick: (tile: Tile) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(tile)}
      title={tile.lilac ? `${tile.label} (needs Shift or AltGr)` : tile.label}
      className={cx(
        "flex cursor-pointer items-center justify-center rounded-lg border font-semibold transition-all duration-150 hover:-translate-y-px hover:border-line-strong hover:bg-hover hover:shadow-md",
        compact ? "h-8 min-w-8 px-2 text-body" : "h-12 min-w-12 px-3 text-body",
        tile.lilac ? "border-accent-deep/40 bg-accent-dim/30 text-ink" : "border-line bg-raised text-ink",
      )}
    >
      {tile.label}
    </button>
  );
}

function GroupTiles({ group, compact, onPick }: { group: TileGroup; compact: boolean; onPick: (tile: Tile) => void }) {
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

/** The modifier chips: which side, then one chip per modifier as this computer names it. */
function ModifierChips({
  side,
  onSide,
  armed,
  onArmed,
  compact,
}: {
  side: "left" | "right";
  onSide: (side: "left" | "right") => void;
  armed: ReadonlySet<Modifier>;
  onArmed: (armed: Set<Modifier>) => void;
  compact: boolean;
}) {
  const os = useOs();
  return (
    <>
      <div className="flex flex-col rounded-lg border border-line bg-raised p-0.5" title="Which side's modifiers">
        {(["left", "right"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onSide(value)}
            className={cx(
              "cursor-pointer rounded-md px-2 text-small font-semibold uppercase",
              compact ? "py-0" : "py-0.5",
              side === value ? "bg-hover text-ink" : "text-faint hover:text-mute",
            )}
          >
            {value === "left" ? "L" : "R"}
          </button>
        ))}
      </div>
      {MODIFIER_ORDER.map((id) => {
        const on = armed.has(id);
        const look = modifierLook(id, os);
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            title={`${look.word}: click it, then a key`}
            onClick={() => {
              const next = new Set(armed);
              if (on) next.delete(id);
              else next.add(id);
              onArmed(next);
            }}
            className={cx(
              "flex min-w-12 cursor-pointer items-center justify-center rounded-lg border px-2 font-bold transition-colors",
              compact ? "h-8 min-w-8 text-body" : "h-12 text-ui",
              on ? "border-accent bg-accent-dim/40 text-accent" : "border-line bg-raised text-mute hover:text-ink",
            )}
          >
            {look.symbol}
          </button>
        );
      })}
    </>
  );
}

/** Your macros and tap patterns, by name, for the search. */
function useBehaviorEntries() {
  const { state } = useWorkbench();
  const wording = useWording();
  const { macroOps, morse, labels, morseProfiles } = state;
  return useMemo(() => {
    const decoded = decodeMacros(macroOps);
    return behaviorEntries({
      macros: macroOps.map((ops, index) => (ops.length > 0 ? macroPreview(decoded[index]) : null)),
      morse,
      title: (kind, index) => behaviorTitle(kind, index, { labels, profiles: morseProfiles, wording }),
      describe: (kind, index) => labelAt(labels, kind, index)?.description ?? "",
    });
  }, [macroOps, morse, labels, morseProfiles, wording]);
}

export function PickKey({
  onPick,
  disabled = false,
  scope = "key",
  compact = false,
}: {
  onPick: (pick: Pick) => void;
  disabled?: boolean;
  /** What it fills: a whole key, one slot of a behavior or a plain key (pickKey.ts PickScope). */
  scope?: PickScope;
  /** The small picker inside a behavior's editor. */
  compact?: boolean;
}) {
  const { bundle, state } = useWorkbench();
  const os = useOs();
  const localeId = useSyncExternalStore(subscribeLocale, getLocaleId, getLocaleId);
  const groups = useMemo(() => {
    const all = pickKeyGroups(LOCALES.find((locale) => locale.id === localeId) ?? activeLocale(), {
      userActions: bundle.boardProfile?.userActions,
      os,
    });
    return { main: narrowTo(all.main, scope), more: narrowTo(all.more, scope) };
  }, [localeId, bundle.boardProfile, os, scope]);
  const behaviors = useBehaviorEntries();
  const [query, setQuery] = useState("");
  const [side, setSide] = useState<"left" | "right">("left");
  const [armed, setArmed] = useState<Set<Modifier>>(new Set());
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
  const searching = query.trim() !== "";
  const found = searching
    ? narrowTo(
        [layerTiles(layers, query), behaviorTiles(behaviors, query), ...searchTiles(groups, query)].filter(
          (group): group is TileGroup => group !== null,
        ),
        scope,
      )
    : [...groups.main, ...(showMore ? groups.more.map((group) => ({ ...group, name: `All keys · ${group.name}` })) : [])];
  const moreCount = groups.more.reduce((count, group) => count + group.tiles.length, 0);
  const first = found[0]?.tiles[0];
  const withModifiers = scope !== "keycode";
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
    <div
      inert={disabled}
      className={cx(
        "flex min-h-0 flex-col",
        compact ? "max-h-80 gap-2" : "flex-1 gap-2.5",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {withModifiers && <ModifierChips side={side} onSide={setSide} armed={armed} onArmed={setArmed} compact={compact} />}
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
            placeholder={scope === "keycode" ? "Search keys…" : "Search keys, symbols, layers, behaviors…"}
            aria-label="Search keys"
            className={cx(
              "w-full rounded-xl border border-line-strong bg-hover pr-4 pl-10 text-ui text-ink placeholder:text-mute focus:border-accent focus:outline-none",
              compact ? "h-8" : "h-[38px]",
            )}
          />
          {searching && first && (
            <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-caption text-faint">
              ↵ {first.label}
            </span>
          )}
        </div>
      </div>
      {withModifiers && !compact && (
        <p className="text-small text-mute">
          {armed.size > 0
            ? `Now click a key: ${chordText(mods, os)} goes with it (not with layers or actions).`
            : "For combinations like Shift+A: click a modifier first, then the key."}
        </p>
      )}
      {!searching && (
        <div className={cx("flex gap-1.5 overflow-x-auto border-b border-line", compact ? "pb-2" : "pb-4")}>
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
        {found.length === 0 && <p className="py-6 text-center text-body text-faint">Nothing matches “{query}”.</p>}
        <div className={cx("flex flex-col", compact ? "gap-3" : "gap-4")}>
          {found.map((group) => (
            <section key={group.id + group.name} data-group={group.id} className="flex flex-col gap-2">
              <h3
                className={cx(
                  "font-semibold uppercase tracking-widest transition-colors duration-300",
                  compact ? "text-caption" : "text-small",
                  lit === group.id ? "text-accent" : "text-mute",
                )}
              >
                {group.name}
              </h3>
              <GroupTiles group={group} compact={compact} onPick={pick} />
            </section>
          ))}
          {!searching && moreCount > 0 && (
            <button
              type="button"
              onClick={() => setShowMore(!showMore)}
              className="self-start cursor-pointer rounded-lg border border-dashed border-line-strong px-3 py-1.5 text-body font-semibold text-mute hover:text-ink"
            >
              {showMore ? "Fewer keys" : `All keys: ${moreCount} more`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The compact picker for a plain key (a macro step, a pointing key). */
export function PickKeycode({ onPick }: { onPick: (code: HidKeyCode) => void }) {
  return (
    <PickKey
      compact
      scope="keycode"
      onPick={(pick) => {
        const code = typeof pick === "object" && "Key" in pick && typeof pick.Key === "object" && "Hid" in pick.Key ? pick.Key.Hid : null;
        if (code) onPick(code);
      }}
    />
  );
}
