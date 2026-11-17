# 0022. The base is the last read; what a draft was based on; Live's own send

**Status:** Accepted. Amends ADR 0010 (what Live sends on its own) and ADR 0018 (what `base` holds and where the three-way check gets "what you started from").

## Context

ADR 0018 made the draft the difference between `base` and what you want. Two things were left loose. A read that found an item changed on the keyboard either moved `base` (and the three-way check lost the change it should have shown) or did not (and `base` no longer said what the keyboard held). And Live sent waiting changes (lighting, rules, pointing) through Send's path once edits paused, with Send's question about overwriting a keyboard-side change but nobody watching to answer it, and again after every failure.

## Decision

- **`state.base` is always the last value read from the keyboard** (or the file), item by item: a full read, a send's read-back, a refresh, a topic, or a Live write's answer. Discard sets what you want to it (`atBase`).
- **`state.basedOn` keeps what a drafted item was based on**, only for drafted items the keyboard changed since (`withBase`, `src/workbench/draft/want.ts`). Send's three-way check reads it through `draftWithBasis`; the kept draft stores it as each item's `before`. It is dropped when the item leaves the draft or the keyboard holds the based-on value again (`withBasisInUse`).
- **A send says what it wrote.** `draftStored` carries `wrote`: those items are based on the read-back; drafted items it did not write keep their basis.
- **A Live write moves into `base` only what it wrote**: a key, encoder, slot or setting when it starts (put back on an error), the default layer when it is set, a layer name once read back, a lighting control from the keyboard's answer (`LIVE_WRITES` in `src/workbench/reducer.ts`, `reduce-lighting.ts`, `reduce-settings.ts`). Other drafted items are untouched.
- **Live's own send** (`src/ui/draft/DraftKeeper.tsx`) runs 0.6 s after the last change, and at once when the page is hidden. It asks nothing and overwrites nothing: it sends with `UNATTENDED` (`src/workbench/draft/send.ts`), so a drafted item the keyboard changed is held back for an explicit Send, which asks. After a send that leaves changes behind (a failure, or a held-back clash) it stops until the next edit or Send (`liveSendDue`, `sendWaits` in `src/workbench/draft/selectors.ts`); the chip then shows Review & send with the count, as in Draft.
- **A Live operation sends only its own items without asking** (`settingNow`); a clashing drafted item it did not set stays in the draft. If its send fails and the keyboard cannot be read, nothing is put back: the change stays in the draft for Send (`commitImage`, `src/workbench/apply.ts`).
- **The kept draft is written at once** when the workbench unmounts and on `pagehide`, not only after its 0.4 s pause.

## Consequences

- The three-way check holds across reads, refreshes, layer operations and reconnects (`send.test.ts`).
- In Live a change can wait in the draft until you Send it; Live is not "always on the keyboard".
- `DraftKeeper`'s effect itself has no test; only its gate (`liveSendDue`) does.
