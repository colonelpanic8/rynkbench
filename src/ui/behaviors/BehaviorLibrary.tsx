// The Behavior Library in the side panel, as in GLIDE: the way in (a header
// row with how many behaviors nothing uses), and once open, a hint for
// newcomers, All your behaviors, one tab per kind, Create, Paste, a search and
// one row per behavior (BehaviorRows: its name, renamed in the row, how it is
// used, and the ⋮ menu). Deleting what is still used asks first, with Guard's
// label and Show me.

import { useState } from "react";
import { useWorkbench } from "../state";
import { useTerms } from "../terms";
import { Button, TextInput, cx } from "../kit";
import { ChevronDownIcon, ChevronRightIcon, PlusIcon } from "../icons";
import { useLibraryInput } from "./useLibrary";
import { useBehaviorActions } from "./useBehaviorActions";
import { useBehaviorKinds } from "./useBehaviorKinds";
import { BehaviorRows } from "./BehaviorRows";
import { LIBRARY_KINDS, libraryRows, searchRows, unusedRows, type LibraryKind } from "./library";

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

/** The library once open. `kinds`: the lists this keyboard has, in order. */
export function BehaviorLibrary({ kinds }: { kinds: LibraryKind[] }) {
  const { dispatch } = useWorkbench();
  const actions = useBehaviorActions();
  const term = useTerms();
  const input = useLibraryInput();
  const [chosen, setKind] = useState<LibraryKind | null>(null);
  const [search, setSearch] = useState("");
  const { writable } = useBehaviorKinds();
  const kind = chosen && kinds.includes(chosen) ? chosen : kinds[0];
  if (!kind) return <p className="px-1 text-small leading-relaxed text-faint">This keyboard stores no named behaviors.</p>;

  const all = libraryRows(kind, input);
  const rows = searchRows(all, search);
  const one = LIBRARY_KINDS[kind].one[input.wording];
  const unused = unusedRows(input).length;
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
      {writable(kind) && (
        <Button onClick={() => actions.open(kind, "new")} className="w-full border-dashed border-line-strong py-2.5 font-semibold text-mute hover:text-ink">
          <PlusIcon size={12} /> Create {one.toLowerCase()}
        </Button>
      )}
      {actions.clip && (
        <Button onClick={() => void actions.paste()} className="w-full border-dashed border-accent-deep py-2 font-semibold text-accent">
          Paste {actions.clip.count} behavior{actions.clip.count === 1 ? "" : "s"}
        </Button>
      )}
      {all.length > 0 && (
        <TextInput type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" aria-label={`Search ${term(LIBRARY_KINDS[kind].term)}`} />
      )}
      {all.length === 0 && <p className="px-1 pt-1 text-small text-faint">None created yet.</p>}
      {all.length > 0 && rows.length === 0 && <p className="px-1 pt-1 text-small text-faint">None match your search.</p>}
      <BehaviorRows rows={rows} />
    </div>
  );
}
