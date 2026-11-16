// All your behaviors (ADR 0020): one list of every behavior, narrowed by how it
// is used, a search and its kinds, and sorted by usage. Pure.

import { searchRows, type LibraryKind, type LibraryRow } from "./library";

export type UsageFilter = "everything" | "unused" | "used";
export type UsageSort = "slot" | "least" | "most";

export interface RowQuery {
  filter: UsageFilter;
  search: string;
  /** The kinds to show; none chosen shows every kind. */
  kinds: readonly LibraryKind[];
  sort: UsageSort;
}

export const NO_QUERY: RowQuery = { filter: "everything", search: "", kinds: [], sort: "slot" };

/** How often a row is used, for sorting: a fork applies everywhere, so it counts as most used. */
const usesOf = (row: LibraryRow) => (row.use === "used" ? (row.uses ?? Number.MAX_SAFE_INTEGER) : -1);

export function queryRows(rows: readonly LibraryRow[], query: RowQuery): LibraryRow[] {
  const shown = searchRows(rows, query.search).filter(
    (row) =>
      (query.kinds.length === 0 || query.kinds.includes(row.kind)) &&
      (query.filter === "everything" || (query.filter === "unused") === (row.use !== "used")),
  );
  if (query.sort === "slot") return shown;
  const sign = query.sort === "least" ? 1 : -1;
  return [...shown].sort((a, b) => sign * (usesOf(a) - usesOf(b)));
}

/** Whether the query narrows the list at all. */
export const isNarrowed = (query: RowQuery): boolean => query.filter !== "everything" || query.search.trim() !== "" || query.kinds.length > 0;

/** A row's key in a selection. */
export const rowKey = (row: Pick<LibraryRow, "kind" | "index">): string => `${row.kind}:${row.index}`;

/** Usage sort's next step: by slot, least used first, most used first. */
export const nextSort = (sort: UsageSort): UsageSort => (sort === "slot" ? "least" : sort === "least" ? "most" : "slot");
