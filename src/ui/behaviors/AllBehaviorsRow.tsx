// One row of All your behaviors (ADR 0020): a box to select it, its kind, name
// and description, how it is used, and the ⋮ menu. Open, it shows its
// description to edit, where it is used (click to go there) and what it uses.

import { useState } from "react";
import type { MouseEvent } from "react";
import { useTerms } from "../terms";
import { TextInput, cx } from "../kit";
import { ChevronDownIcon, ChevronRightIcon, MoreIcon } from "../icons";
import { LIBRARY_KINDS, usageBadge, type LibraryRow, type UsedThing } from "./library";
import type { SiteRef } from "../../workbench/usage";

export interface RowHandlers {
  onSelect: () => void;
  onMenu: (event: MouseEvent<HTMLElement>) => void;
  onDescription: (description: string) => void;
  onPlace: (place: SiteRef) => void;
  onThing: (thing: UsedThing) => void;
}

const LINK = "cursor-pointer underline decoration-dotted underline-offset-2 hover:text-ink";

function Places({ places, onPlace }: { places: SiteRef[]; onPlace: (place: SiteRef) => void }) {
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5">
      {places.map((place, index) =>
        place.target ? (
          <button key={`${place.label}-${index}`} type="button" className={LINK} onClick={() => onPlace(place)}>
            {place.label}
          </button>
        ) : (
          <span key={`${place.label}-${index}`}>{place.label}</span>
        ),
      )}
    </span>
  );
}

function Details({ row, onDescription, onPlace, onThing }: { row: LibraryRow } & Pick<RowHandlers, "onDescription" | "onPlace" | "onThing">) {
  const [description, setDescription] = useState(row.description);
  const commit = () => {
    if (description.trim() !== row.description) onDescription(description);
  };
  return (
    <div className="flex flex-col gap-2 border-t border-line-soft px-3 py-2.5 pl-10 text-small text-faint">
      <label className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-mute">Description</span>
        <TextInput
          value={description}
          placeholder="What it is for"
          onChange={(event) => setDescription(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          className="py-1 text-body"
        />
      </label>
      {row.places.length > 0 && (
        <div className="flex gap-2">
          <span className="w-16 shrink-0 text-mute">Used by</span>
          <Places places={row.places} onPlace={onPlace} />
        </div>
      )}
      {row.refersTo.length > 0 && (
        <div className="flex gap-2">
          <span className="w-16 shrink-0 text-mute">Uses</span>
          <span className="flex flex-wrap gap-x-2 gap-y-0.5">
            {row.refersTo.map((thing) =>
              thing.behavior ? (
                <button key={thing.label} type="button" className={LINK} onClick={() => onThing(thing)}>
                  {thing.label}
                </button>
              ) : (
                <span key={thing.label}>{thing.label}</span>
              ),
            )}
          </span>
        </div>
      )}
    </div>
  );
}

export function AllBehaviorsRow({
  row,
  selected,
  menuOpen,
  ...handlers
}: { row: LibraryRow; selected: boolean; menuOpen: boolean } & RowHandlers) {
  const term = useTerms();
  const [open, setOpen] = useState(false);
  const badge = usageBadge(row);
  return (
    <div className={cx("group rounded-lg border bg-raised", selected ? "border-accent-deep" : "border-line hover:border-line-strong")}>
      <div className="flex items-center gap-2 px-3 py-2">
        <input type="checkbox" checked={selected} onChange={handlers.onSelect} aria-label={`Select ${row.name}`} className="size-4 shrink-0 cursor-pointer accent-[var(--color-accent)]" />
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
          <span className="w-24 shrink-0 truncate text-small text-faint max-sm:hidden">{term(LIBRARY_KINDS[row.kind].term)}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={cx("truncate text-body font-semibold", row.named ? "text-ink" : "text-mute")}>{row.name}</span>
            {(row.description || row.detail) && <span className="truncate text-small text-faint">{row.description || row.detail}</span>}
          </span>
          {open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
        </button>
        {badge && (
          <span className={cx("shrink-0 rounded border px-1.5 py-0.5 text-caption font-semibold uppercase tracking-widest", badge.unused ? "border-warn/40 text-warn" : "border-line-strong text-mute")}>
            {badge.text}
          </span>
        )}
        <button
          type="button"
          aria-label={`Actions for ${row.name}`}
          onClick={handlers.onMenu}
          className={cx(
            "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-mute hover:bg-hover hover:text-ink",
            menuOpen ? "opacity-100" : "sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
          )}
        >
          <MoreIcon size={15} />
        </button>
      </div>
      {open && <Details key={row.description} row={row} onDescription={handlers.onDescription} onPlace={handlers.onPlace} onThing={handlers.onThing} />}
    </div>
  );
}
