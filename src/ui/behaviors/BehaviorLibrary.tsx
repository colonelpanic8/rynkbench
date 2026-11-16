// The Behavior Library in the side panel, as in GLIDE: the way in (a header
// row with how many behaviors nothing uses), and once open, a hint for
// newcomers, All your behaviors, one tab per kind, Create, a search and one
// row per behavior (name, usage badge, a detail line, and the ⋮ menu: Open in
// editor, Delete). Deleting what is still used asks first, with Guard's label.

import { useState } from "react";
import type { MouseEvent } from "react";
import { useWorkbench } from "../state";
import { useTerms } from "../terms";
import { Button, TextInput, cx } from "../kit";
import { ChevronDownIcon, ChevronRightIcon, MoreIcon, PlusIcon } from "../icons";
import { RowMenu, useRowMenu } from "../RowMenu";
import { useLibraryInput } from "./useLibrary";
import type { BehaviorFocus } from "./focus";
import { useBehaviorActions } from "./useBehaviorActions";
import {
  LIBRARY_KINDS,
  libraryRows,
  searchRows,
  unusedRows,
  usageBadge,
  type LibraryKind,
  type LibraryRow,
} from "./library";

/** The header row that opens and closes the library. */
export function LibraryEntry({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const unused = unusedRows(useLibraryInput()).length;
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="mt-2 flex w-full cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-small font-semibold uppercase tracking-widest text-mute hover:text-ink"
    >
      <span className="flex-1 text-left">Behavior Library</span>
      {unused > 0 && <span className="normal-case tracking-normal text-warn">{unused} not used</span>}
      {open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
    </button>
  );
}

function Row({ row, onOpen, onMenu, menuOpen }: { row: LibraryRow; onOpen: () => void; onMenu: (event: MouseEvent<HTMLElement>) => void; menuOpen: boolean }) {
  const badge = usageBadge(row);
  return (
    <div className="group flex items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2 hover:border-line-strong">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 cursor-pointer flex-col items-start text-left" title="Open in editor">
        <span className="flex w-full items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-body font-semibold text-ink">{row.name}</span>
          {badge && (
            <span
              className={cx(
                "shrink-0 rounded border px-1.5 py-0.5 text-caption font-semibold uppercase tracking-widest",
                badge.unused ? "border-warn/40 text-warn" : "border-line-strong text-mute",
              )}
            >
              {badge.text}
            </span>
          )}
        </span>
        {row.detail && <span className="w-full truncate font-mono text-small text-faint">{row.detail}</span>}
      </button>
      <button
        type="button"
        aria-label={`Actions for ${row.name}`}
        onClick={onMenu}
        className={cx(
          "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-mute hover:bg-hover hover:text-ink",
          menuOpen ? "opacity-100" : "sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
        )}
      >
        <MoreIcon size={15} />
      </button>
    </div>
  );
}

/** The library once open. `kinds`: the lists this keyboard has, in order. */
export function BehaviorLibrary({ kinds }: { kinds: LibraryKind[] }) {
  const { dispatch } = useWorkbench();
  const actions = useBehaviorActions();
  const term = useTerms();
  const input = useLibraryInput();
  const [chosen, setKind] = useState<LibraryKind | null>(null);
  const [search, setSearch] = useState("");
  const menu = useRowMenu<number>();
  const kind = chosen && kinds.includes(chosen) ? chosen : kinds[0];
  if (!kind) return <p className="px-1 text-small leading-relaxed text-faint">This keyboard stores no named behaviors.</p>;

  const all = libraryRows(kind, input);
  const rows = searchRows(all, search);
  const one = LIBRARY_KINDS[kind].one[input.wording];
  const unused = unusedRows(input).length;
  const open = (focus: BehaviorFocus) => actions.open(kind, focus);
  const remove = actions.remove;

  const atRow = menu.at ? all.find((row) => row.index === menu.at?.id) : undefined;
  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-small leading-relaxed text-faint">
        Most people don't need this: select a key and give it a hold or a double tap.
      </p>
      <Button onClick={() => dispatch({ type: "mode", mode: "usage" })} className="w-full justify-between py-2 font-semibold">
        <span>All your behaviors</span>
        {unused > 0 && <span className="text-small text-warn">{unused} not used</span>}
      </Button>
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Kinds of behavior">
        {kinds.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={id === kind}
            onClick={() => setKind(id)}
            className={cx(
              "cursor-pointer rounded-md px-2 py-1 text-caption font-semibold uppercase tracking-widest",
              id === kind ? "bg-accent-fill text-on-accent" : "text-mute hover:bg-hover hover:text-ink",
            )}
          >
            {term(LIBRARY_KINDS[id].term)}
          </button>
        ))}
      </div>
      <Button onClick={() => open("new")} className="w-full border-dashed border-line-strong py-2.5 font-semibold text-mute hover:text-ink">
        <PlusIcon size={12} /> Create {one.toLowerCase()}
      </Button>
      {all.length > 0 && (
        <TextInput type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" aria-label={`Search ${term(LIBRARY_KINDS[kind].term)}`} />
      )}
      {all.length === 0 && <p className="px-1 pt-1 text-small text-faint">None created yet.</p>}
      {all.length > 0 && rows.length === 0 && <p className="px-1 pt-1 text-small text-faint">None match your search.</p>}
      {rows.map((row) => (
        <div key={row.index} {...menu.rowProps(row.index)}>
          <Row row={row} onOpen={() => open(row.index)} onMenu={(event) => menu.openFrom(event, row.index)} menuOpen={menu.openFor === row.index} />
        </div>
      ))}
      {menu.at && atRow && (
        <RowMenu
          x={menu.at.x}
          y={menu.at.y}
          label={atRow.name}
          items={[{ id: "open", label: "Open in editor" }, "-", { id: "delete", label: "Delete", danger: true }]}
          onAction={(id) => (id === "open" ? open(atRow.index) : void remove(atRow))}
          onClose={menu.close}
        />
      )}
    </div>
  );
}
