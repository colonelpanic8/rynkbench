# 0023. A file import is a commit

**Status:** Accepted. Completes ADR 0019's "imports stop suspending and clearing the history", as a direct commit rather than an operation in the catalog.

## Context

Importing a layout file onto a connected keyboard wrote part after part from `config/transfer.ts`, outside the draft, with the history suspended and then cleared. It was not one Undo step, Guard saw it piece by piece, and in Draft it went to the keyboard anyway. ADR 0019 said imports would become operations. An import is not a good catalog entry: its input is a parsed file with notes, a source and a target board, and it may need reads the workbench lacks (a pointing configuration, an effect's parameters) before it can be placed.

## Decision

- **Three steps, two of them pure.** `readImport` (`src/config/transfer.ts`) parses the file, converts it between boards and checks its lighting; it says what must be read first. `layoutOnto` (`src/config/import-layout.ts`, pure) puts the file over what you want, within the keyboard's capacities, and reports what it applied and skipped. `io.importLayout` (`src/workbench/io-import.ts`) does the missing reads and commits the result with `commitImage`, the function operations use.
- **So an import is one commit**: Guard judges it once, as a whole; it is one Undo step; in Draft it waits for Send; in Live it goes through Send's path (fresh read, only the difference, read back), all or nothing like an operation. Nothing suspends or clears the history any more; the actions that did are gone.
- A drafted item the file does not describe stays in the draft.
- The file's behavior names come with it as labels (ADR 0020), in the same commit.

## Consequences

- An import in Live stores only the rows and items that differ; importing the layout the keyboard already holds stores nothing (`io-import.test.ts`).
- The import's report says whether the file went to the draft, the keyboard or the open file.
- An import is not in the operation catalog, so WebMCP and Flows cannot call it as they will call operations.
