// All your behaviors (ADR 0020), as in GLIDE: every behavior in one list, to
// find one, see where each is used and clean up. Filters (Everything, Not
// used, In use), a search, the kinds, sort by usage; rows open to where each
// is used and what it uses; select the unused and delete them; Copy and Paste.

import { useState } from "react";
import type { ReactNode } from "react";
import { useTerms } from "../terms";
import { Button, Segmented, TextInput, cx } from "../kit";
import { PlusIcon } from "../icons";
import { RowMenu, useRowMenu } from "../RowMenu";
import { CenterScroll } from "../advanced/bits";
import { useLibraryInput } from "./useLibrary";
import { useBehaviorKinds } from "./useBehaviorKinds";
import { useBehaviorActions } from "./useBehaviorActions";
import { AllBehaviorsRow } from "./AllBehaviorsRow";
import { allRows, LIBRARY_KINDS, type LibraryRow } from "./library";
import { isNarrowed, nextSort, NO_QUERY, queryRows, rowKey, type RowQuery, type UsageFilter } from "./all-behaviors";

const FILTERS: { value: UsageFilter; label: string }[] = [
  { value: "everything", label: "Everything" },
  { value: "unused", label: "Not used" },
  { value: "used", label: "In use" },
];

const SORT_LABEL = { slot: "Usage", least: "Usage ↑", most: "Usage ↓" } as const;

function NewMenu({ onNew }: { onNew: (kind: LibraryRow["kind"]) => void }) {
  const term = useTerms();
  const { kinds, writable } = useBehaviorKinds();
  const menu = useRowMenu<"new">();
  const offered = kinds.filter(writable);
  if (offered.length === 0) return null;
  return (
    <>
      <Button onClick={(event) => menu.openFrom(event, "new")}>
        <PlusIcon size={12} /> New
      </Button>
      {menu.at && (
        <RowMenu
          x={menu.at.x}
          y={menu.at.y}
          label="New behavior"
          items={offered.map((kind) => ({ id: kind, label: term(LIBRARY_KINDS[kind].term) }))}
          onAction={(id) => onNew(id as LibraryRow["kind"])}
          onClose={menu.close}
        />
      )}
    </>
  );
}

function Chips({ query, setQuery }: { query: RowQuery; setQuery: (query: RowQuery) => void }) {
  const term = useTerms();
  const { kinds } = useBehaviorKinds();
  const toggle = (kind: LibraryRow["kind"]) =>
    setQuery({ ...query, kinds: query.kinds.includes(kind) ? query.kinds.filter((one) => one !== kind) : [...query.kinds, kind] });
  return (
    <div className="flex flex-wrap gap-1">
      {kinds.map((kind) => (
        <button
          key={kind}
          type="button"
          aria-pressed={query.kinds.includes(kind)}
          onClick={() => toggle(kind)}
          className={cx(
            "cursor-pointer rounded-md border px-2 py-1 text-small font-semibold",
            query.kinds.includes(kind) ? "border-accent-deep bg-accent-dim/30 text-accent" : "border-line text-mute hover:text-ink",
          )}
        >
          {term(LIBRARY_KINDS[kind].term)}
        </button>
      ))}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-line-soft bg-panel px-4 py-8 text-center text-body text-faint">{children}</p>;
}

export function AllBehaviors() {
  const input = useLibraryInput();
  const { kinds } = useBehaviorKinds();
  const actions = useBehaviorActions();
  const [query, setQuery] = useState<RowQuery>(NO_QUERY);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const menu = useRowMenu<string>();

  const all = allRows(kinds, input);
  const rows = queryRows(all, query);
  const chosen = all.filter((row) => picked.has(rowKey(row)));
  const unusedShown = rows.filter((row) => row.use !== "used");
  const chosenUnused = chosen.filter((row) => row.use !== "used");
  const pick = (row: LibraryRow) => {
    const next = new Set(picked);
    if (!next.delete(rowKey(row))) next.add(rowKey(row));
    setPicked(next);
  };
  const atRow = menu.at ? all.find((row) => rowKey(row) === menu.at?.id) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <CenterScroll>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented items={FILTERS} value={query.filter} onChange={(filter) => setQuery({ ...query, filter })} layout="fit" />
          <div className="flex-1" />
          {actions.clip && (
            <Button onClick={() => void actions.paste()}>
              Paste {actions.clip.count}
            </Button>
          )}
          <NewMenu onNew={(kind) => actions.open(kind, "new")} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            type="search"
            value={query.search}
            onChange={(event) => setQuery({ ...query, search: event.target.value })}
            placeholder="Search by name or description"
            aria-label="Search your behaviors"
            className="max-w-xs"
          />
          <Chips query={query} setQuery={setQuery} />
        </div>
        <div className="flex items-center gap-2 px-1 text-small text-faint">
          <span className="flex-1">
            {isNarrowed(query) && (
              <>
                Showing {rows.length} of {all.length}{" "}
                <button type="button" className="cursor-pointer text-accent hover:underline" onClick={() => setQuery(NO_QUERY)}>
                  Clear filters
                </button>
              </>
            )}
          </span>
          <button type="button" className="cursor-pointer font-semibold uppercase tracking-widest hover:text-ink" onClick={() => setQuery({ ...query, sort: nextSort(query.sort) })}>
            {SORT_LABEL[query.sort]}
          </button>
        </div>
        {all.length === 0 && <Empty>You haven't created any behaviors yet.</Empty>}
        {all.length > 0 && rows.length === 0 && (
          <Empty>{query.filter === "unused" && !query.search && query.kinds.length === 0 ? "Nothing to clean up: every behavior is in use." : "None match."}</Empty>
        )}
        {rows.map((row) => (
          <div key={rowKey(row)} {...menu.rowProps(rowKey(row))}>
            <AllBehaviorsRow
              row={row}
              selected={picked.has(rowKey(row))}
              menuOpen={menu.openFor === rowKey(row)}
              onSelect={() => pick(row)}
              onMenu={(event) => menu.openFrom(event, rowKey(row))}
              onDescription={(description) => void actions.rename(row, row.named ? row.name : "", description)}
              onPlace={(place) => actions.goTo(place.target)}
              onThing={(thing) => thing.behavior && actions.open(thing.behavior.kind, thing.behavior.slot)}
            />
          </div>
        ))}
      </CenterScroll>
      {all.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
          <Button variant="ghost" disabled={unusedShown.length === 0} reason="Every behavior shown is in use" onClick={() => setPicked(new Set(unusedShown.map(rowKey)))}>
            Select all not used ({unusedShown.length})
          </Button>
          <div className="flex-1" />
          <Button disabled={chosen.length === 0} reason="Select behaviors first" onClick={() => actions.copy(chosen)}>
            Copy{chosen.length > 0 ? ` ${chosen.length}` : ""}
          </Button>
          <Button
            variant="danger"
            disabled={chosenUnused.length === 0}
            reason="Select behaviors nothing uses"
            onClick={() => void actions.deleteUnused(chosenUnused).then(() => setPicked(new Set()))}
          >
            Delete {chosenUnused.length} not used
          </Button>
        </div>
      )}
      {menu.at && atRow && (
        <RowMenu
          x={menu.at.x}
          y={menu.at.y}
          label={atRow.name}
          items={[{ id: "open", label: "Open in editor" }, { id: "copy", label: "Copy" }, "-", { id: "delete", label: "Delete", danger: true }]}
          onAction={(id) => (id === "open" ? actions.open(atRow.kind, atRow.index) : id === "copy" ? actions.copy([atRow]) : void actions.remove(atRow))}
          onClose={menu.close}
        />
      )}
    </div>
  );
}
