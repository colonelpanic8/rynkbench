// Other Behaviors, as GLIDE's tab of that name: the behaviors a key can be
// given, by kind, with a search over their names and descriptions. Your macros
// and tap patterns (from the Behavior Library) and the keyboard's own one-shot
// modifiers. A behavior's tile shows its name and what it does; the one on the
// key is marked. A tap pattern is the whole key; the rest fill the slot being
// picked.

import { useMemo, useState } from "react";

import type { Action, KeyAction } from "../../model/action-types";
import { noModifiers } from "../../model/slots";
import { useOs } from "../preferences";
import { useTerms } from "../terms";
import { MODIFIER_ORDER, modifierLook } from "../keyface/modifiers";
import { LIBRARY_KINDS, libraryRows, searchRows, type LibraryRow } from "../behaviors/library";
import { useLibraryInput } from "../behaviors/useLibrary";
import { cx, Segmented } from "../kit";
import { SearchIcon } from "../icons";
import type { Pick } from "./pickKey";

/** One behavior as a tile: its name, a line under it, and what it puts on the key. */
interface BehaviorTile {
  id: string;
  name: string;
  detail: string;
  pick: Pick;
}

type Kind = "macros" | "morse" | "oneShot";

/** The one-shot modifiers, named as this computer names them: held for the next key only. */
function oneShotTiles(os: ReturnType<typeof useOs>): BehaviorTile[] {
  return MODIFIER_ORDER.map((modifier) => {
    const mods = { ...noModifiers(), [`left_${modifier}`]: true };
    const word = modifierLook(modifier, os).word;
    return { id: `oneshot:${modifier}`, name: `One-shot ${word}`, detail: `${word} for the next key only`, pick: { OneShotModifier: mods } as Action };
  });
}

const rowTile = (row: LibraryRow): BehaviorTile => ({
  id: `${row.kind}:${row.index}`,
  name: row.name,
  detail: row.description || row.detail,
  pick: row.kind === "macros" ? ({ TriggerMacro: row.index } as Action) : { Morse: row.index },
});

/** Whether `current` is (or has, in a slot) what the tile puts on the key. */
function isOn(current: KeyAction | undefined, pick: Pick): boolean {
  if (current === undefined || typeof current !== "object") return false;
  const wanted = JSON.stringify(pick);
  if ("Morse" in current) return wanted === JSON.stringify({ Morse: current.Morse });
  const actions = "Single" in current ? [current.Single] : "Tap" in current ? [current.Tap] : "TapHold" in current ? current.TapHold.slice(0, 2) : [];
  return actions.some((action) => JSON.stringify(action) === wanted);
}

export function OtherBehaviors({
  onPick,
  current,
  wholeKey = true,
}: {
  onPick: (pick: Pick) => void;
  /** What the key does now: its behavior is marked. */
  current?: KeyAction;
  /** Tap patterns are offered only where a whole key is picked. */
  wholeKey?: boolean;
}) {
  const input = useLibraryInput();
  const term = useTerms();
  const os = useOs();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<Kind | "all">("all");

  const groups = useMemo(() => {
    const own = (which: "macros" | "morse") => searchRows(libraryRows(which, input), search).map(rowTile);
    const q = search.trim().toLowerCase();
    const oneShot = oneShotTiles(os).filter((tile) => `${tile.name} ${tile.detail} sticky`.toLowerCase().includes(q));
    const all: Array<{ kind: Kind; title: string; tiles: BehaviorTile[] }> = [
      { kind: "macros", title: term(LIBRARY_KINDS.macros.term), tiles: own("macros") },
      ...(wholeKey ? [{ kind: "morse" as const, title: term(LIBRARY_KINDS.morse.term), tiles: own("morse") }] : []),
      { kind: "oneShot", title: "One-shot modifiers", tiles: oneShot },
    ];
    return all.filter((group) => kind === "all" || group.kind === kind);
  }, [input, search, os, term, kind, wholeKey]);

  const yours = libraryRows("macros", input).length + (wholeKey ? libraryRows("morse", input).length : 0);
  const shown = groups.reduce((count, group) => count + group.tiles.length, 0);
  const kinds: Array<{ value: Kind | "all"; label: string }> = [
    { value: "all", label: "All" },
    { value: "macros", label: term(LIBRARY_KINDS.macros.term) },
    ...(wholeKey ? [{ value: "morse" as const, label: term(LIBRARY_KINDS.morse.term) }] : []),
    { value: "oneShot", label: "One\u2011shot" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-col gap-2 border-b border-line pb-3">
        <div className="relative">
          <SearchIcon size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-mute" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search your behaviors by name or description…"
            aria-label="Search behaviors"
            className="h-[38px] w-full rounded-xl border border-line-strong bg-hover pr-4 pl-10 text-ui text-ink placeholder:text-mute focus:border-accent focus:outline-none"
          />
        </div>
        <Segmented size="sm" className="self-start" items={kinds} value={kind} onChange={setKind} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="flex flex-col gap-5">
          {yours === 0 && !search.trim() && (kind === "all" || kind === "macros" || kind === "morse") && (
            <div className="max-w-md text-body leading-relaxed text-mute">
              <b className="mb-1 block text-ui text-ink">None of your own behaviors yet</b>
              Behaviors are optional, and many people never need one. Make one in the <b>Behavior Library</b> in the side
              panel, and it shows up here.
            </div>
          )}
          {groups
            .filter((group) => group.tiles.length > 0)
            .map((group) => (
              <section key={group.kind} className="flex flex-col gap-2">
                <h3 className="text-small font-semibold tracking-widest text-mute uppercase">
                  {group.title} <span className="opacity-60">{group.tiles.length}</span>
                </h3>
                <div className="flex flex-wrap gap-2">
                  {group.tiles.map((tile) => (
                    <button
                      key={tile.id}
                      type="button"
                      onClick={() => onPick(tile.pick)}
                      title={tile.detail}
                      aria-pressed={isOn(current, tile.pick)}
                      className={cx(
                        "flex h-14 w-52 cursor-pointer flex-col items-start justify-center gap-0.5 overflow-hidden rounded-lg border px-3 text-left transition-all duration-150 hover:-translate-y-px hover:border-line-strong hover:bg-hover",
                        isOn(current, tile.pick) ? "border-accent bg-accent-dim/40" : "border-line bg-raised",
                      )}
                    >
                      <span className="max-w-full truncate font-mono text-body font-semibold text-ink">{tile.name}</span>
                      {tile.detail && <span className="max-w-full truncate text-caption text-mute">{tile.detail}</span>}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          {shown === 0 && search.trim() && <p className="text-body text-mute">No behavior matches “{search}”.</p>}
        </div>
      </div>
    </div>
  );
}
