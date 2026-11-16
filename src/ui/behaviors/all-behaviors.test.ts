import { describe, expect, it } from "vitest";
import type { LibraryRow } from "./library";
import { isNarrowed, nextSort, NO_QUERY, queryRows } from "./all-behaviors";

const row = (kind: LibraryRow["kind"], index: number, name: string, uses: number | null, use: LibraryRow["use"] = uses === 0 ? "unused" : "used"): LibraryRow => ({
  kind,
  index,
  name,
  named: false,
  description: "",
  detail: "",
  uses,
  use,
  places: [],
  refersTo: [],
});

const rows = [row("macros", 0, "Hello", 3), row("macros", 1, "Bye", 0, "only-by-unused"), row("morse", 0, "Home", 1), row("forks", 0, "Comma", null), row("morse", 2, "Spare", 0)];
const names = (list: LibraryRow[]) => list.map((one) => one.name);

describe("All your behaviors", () => {
  it("shows everything by default, in the library's order", () => {
    expect(names(queryRows(rows, NO_QUERY))).toEqual(["Hello", "Bye", "Home", "Comma", "Spare"]);
    expect(isNarrowed(NO_QUERY)).toBe(false);
  });

  it("narrows to what is not used (only unused ones using it counts) or what is", () => {
    expect(names(queryRows(rows, { ...NO_QUERY, filter: "unused" }))).toEqual(["Bye", "Spare"]);
    expect(names(queryRows(rows, { ...NO_QUERY, filter: "used" }))).toEqual(["Hello", "Home", "Comma"]);
  });

  it("narrows by search and kinds together", () => {
    const query = { ...NO_QUERY, search: "e", kinds: ["morse" as const] };
    expect(names(queryRows(rows, query))).toEqual(["Home", "Spare"]);
    expect(isNarrowed(query)).toBe(true);
  });

  it("sorts by usage, least or most first; a fork counts as most used", () => {
    expect(names(queryRows(rows, { ...NO_QUERY, sort: "least" }))).toEqual(["Bye", "Spare", "Home", "Hello", "Comma"]);
    expect(names(queryRows(rows, { ...NO_QUERY, sort: "most" }))).toEqual(["Comma", "Hello", "Home", "Bye", "Spare"]);
    expect([nextSort("slot"), nextSort("least"), nextSort("most")]).toEqual(["least", "most", "slot"]);
  });
});
