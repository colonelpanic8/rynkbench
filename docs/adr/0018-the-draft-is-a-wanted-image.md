# 0018. The draft is a wanted image beside its base; one history in Draft and Live

**Status:** Proposed. Step 3 of the architecture plan (`docs/architecture-review.md`, "The plan, validated"); reaches the end state of ADR 0013 and refines ADR 0010 and ADR 0012.

## Context

The draft is a set of staged collections, each with its own shape: `stagedKeys`, `stagedEncoders`, `stagedSlots`, a lighting draft per layer (`layerDrafts`), the rule draft (`runtimeConditionalDraft`), and apart from the draft a pointing draft with its own Apply. Each kind is handled in six places: reducer cases, the review's groups (`draft/changes.ts`), the kept snapshot and its restore, the images for Send (`draft/image.ts` `withDraft`), `markSent`, and the history's step (`draft/history.ts`). Macros, layer names, layer moves, the default layer, behaviour options, morse profiles, hold-trigger positions, auto-mouse layers and wake layers cannot be staged at all: they write at once in either mode, and a layer move rewrites the keyboard directly (`io-layers.ts`). An operation or a Flow that adds a macro or moves a layer has nowhere to go in Draft.

There are two histories: in Live, a per-key history that replays old values to the keyboard (`model/history.ts`); everywhere, the draft history of keys, lights and rules, kept in module-level variables (`useDraftHistory.ts`). A shared counter (`nextEditOrder`) and `oneHistory` make them undo in turn. Send and Discard start the draft history over.

The sync layer already has the shape everything else needs: `KeyboardImage` (one record of what a keyboard stores), `planSync(from, to)`, `conflicts(base, now, want)`, `syncTo`. The draft rebuilds two such images from the staged collections on every Send.

## Decision

**Two images, nothing staged.** The workbench holds `base`, what the keyboard (or the file) held at the last read, read-back or save, and `want`, the layout you want. Both are `KeyboardImage`s. Every edit changes `want`; nothing else is staged. The draft is the difference: `planSync(base, want)`, named item by item with `itemsOf` (`sync/conflicts.ts`). The chip's count, Review & send's groups by area and layer, and each change's Discard (that item of `want` set back to `base`) are computed from it. The staged collections, `withDraft`/`draftBase`, `markSent` and `restoreActions` go.

**The image holds everything the keyboard stores.** Morse profiles, hold-trigger positions and the lighting layer policy join `KeyboardImage`, each with one planner entry and one writer entry. Layer names, layer moves and deletes, macros, the default layer, behaviour options, auto-mouse layers, wake layers and pointing are already parts of it; a layer move becomes a rewrite of `want` (the layer rewrite's snapshot type folds into the image). A part the keyboard lacks stays absent and is not compared (ADR 0012), so capabilities need no special case. The live lighting controls (effect, brightness, the extension's effect and parameters) are not stored layout (`docs/firmware/rmk-persist-lighting`); they act at once and stay outside the draft and the history.

**One edit, one commit.** Every edit, one key or a whole Flow, is one commit: `want → want'`. Guard judges it (previous `want` against `want'`, through an adapter from `KeyboardImage` to the layout `judgeChange` takes; operations reuse it). The mode only decides when the writer runs:

- **Draft:** on Send. Send reads fresh, runs the three-way check with `base` as what you started from, `syncTo(now, want)`, and sets `base` to the read-back. What did not reach the keyboard still differs and stays in the draft; nothing needs marking.
- **Live:** after every commit. Keys, encoders, slots and lighting are planned against `base` and read back item by item, as Live writes are today; lighting and rules still wait 0.6 s. Any other commit (macros, layer names and moves, settings, an operation) reads fresh first, as Send does. This refines ADR 0012's "always a fresh read" for the cheap, frequent case.
- **Not connected, or a file:** never; Save sets `base` to `want`.

**One history.** The history is the list of commits, each kept as its items with their value before and after (a patch, not two images), up to 100. Undo commits the inverse patch and Redo the patch again. They go through Guard and the mode like any edit, so Undo is the same in Draft, Live and a file and covers everything the image holds. A Paint stroke joins one commit. Send and a mode switch leave the history alone. Discard is a commit (`want` set to `base`), so it can be undone. The history belongs to the open workbench (its state, not module variables) and starts over when another keyboard or file is opened. The per-key keyboard history, `nextEditOrder`, `pickHistorySide` and `oneHistory` go.

**Kept in the browser** per keyboard, under the same setting key: the draft's patch, each item with the value it was based on. Restore applies it to a fresh read: `want` gets the wanted values, `base` the based-on ones, so Send's three-way check still shows what changed on the keyboard meanwhile. A draft kept in the old shape is converted once when read.

**Screens read `want`.** What you see is what you want; `base` only marks what is changed. The duplicate fields in `WorkbenchState` (`layers`, `combos`, `scenes` …) become selectors of `want`, module by module.

## Consequences

- A new kind of stored item is one field in the image, one planner entry, one writer entry and a word for the review; the draft, Send, the kept draft and the history need nothing.
- Operations (step 4) are functions from image to image; staging, sending and undo come with the commit.
- Memory: two images and up to 100 patches; a Glove80's image is tens of kilobytes. The draft's item list is computed once per change of `base` or `want`.
- The way there is two sessions, each shippable. *Part 2:* the two images, commit and the history in Draft; keys, encoders, slots, lighting and rules move onto them; Review, the chip and the kept draft are computed. *Part 3:* the rest joins (macros, layer names and moves, the default layer, settings, profiles, pointing); Live commits through the same path; the old histories go. *Done when* any `KeyboardImage` can be committed and shows in Review & send, and Undo covers it in Draft and Live.
- This completes ADR 0013. Rejected: more kinds of staged items (each new kind costs the six places above, and a Flow would need all of them at once).
