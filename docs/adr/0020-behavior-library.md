# 0020. The Behavior Library: names beside the slots, one editor, every edit an operation

**Status:** Accepted. Takes GLIDE's organization and flow for behaviors (`moosylog/glide-src`: `docs/specs/ui/behaviors.md`, `dev/ui/behaviorLists.jsx`, `behaviorEditor.jsx`, `behaviorUsage.jsx`), not its code. Builds on ADR 0018 (the draft is a wanted image) and ADR 0019 (operations).

## Context

RMK stores behaviors as numbered slots: macros (one region, a slot per macro), morse entries (tap patterns), forks and tap-hold profiles; combos stay in the side panel. Only profiles have names, kept on the keyboard. So the library shows "Macro 3", the Usage screen is a read-only list in Insights, each kind has its own editor with its own Save, and the edits are single writes (`io.setSlot`, `io.writeMacros`, `io.deleteMorseProfile`): not one Undo step each, not in the draft as a commit, not judged by Guard, not callable without a screen.

## Decision

**Labels: a name and a description per slot, beside what you want.** A label is `{ name, description }` for one slot of one kind (`model/behavior-labels.ts`). The keyboard stores none, so labels are not part of the `KeyboardImage`, never in the draft's count and never sent; they live in the workbench state next to what you want (`state.labels`). A profile's name is the keyboard's (its `MorseProfileEntry.name`, in the image, within the firmware's length); only its description is a label.
- *Per keyboard in the browser:* `SETTING_KEYS.behaviorLabels(serial)` (`ui/settings.ts`), saved whenever they change and read when that keyboard connects, the way the kept draft is (ADR 0010). The kept draft's key and shape do not change.
- *In the layout file:* the TOML format already has a `name` for each `[[macro]]`, `[[morse]]` and `[[fork]]` table, the n-th table being slot n. Rynkbench reads them when a file opens and writes them when it saves (`config/behavior-labels.ts`); the names the renderer makes up (`morse 3`) are not labels. A description is a `# ` comment line under its table's header, since the format rejects unknown fields; other tools ignore it. MoErgo JSON keeps its own behaviors; there labels stay in the browser.
- *When a slot moves or is deleted:* a label belongs to its slot and goes where the slot's value goes, in the same operation: deleted with it, copied with a duplicate or a paste (to a free name: "name 2"), moved with it should an operation ever move slots. When the keyboard is read, a label on an empty slot is dropped (another tool cleared it). Names are unique within a kind; an empty name shows the kind and number ("Tap pattern 3").

**Every behavior edit is an operation** (ADR 0019): `create_behavior`, `set_behavior`, `rename_behavior`, `duplicate_behavior`, `delete_behavior`, `delete_unused_behaviors`, `paste_behaviors` (`operations/behaviors.ts`), each in the catalog with its inputs, so WebMCP and Flows can call them later (neither is built here). An operation may change the labels as well as the image: `run(image, input, facts)` gets the labels in `facts` and returns `{ image, labels? }`. Applying it is ADR 0019's path unchanged: judged by Guard, one `commit` (a history step now carries the labels before and after with its patch, so Undo puts a name back too), in Draft until Send, in Live sent at once. Copy is not an operation (it changes nothing): `behaviorsAsText(items)` writes the behaviors with their labels as text, and `paste_behaviors` reads that text into free slots. A paste that does not fit (no free slot, no macro space) changes nothing and says why.

**One editor shell for every kind**, GLIDE's (`ui/behaviors/editor/`): the name at the top; cards on the left (the behavior first, then its parts: patterns, steps, outputs); the selected card's editor on the right; Cancel and Apply at the foot. Apply is one `set_behavior` (or `create_behavior`) operation; nothing writes while you edit. Leaving with changes (Cancel, ×, Escape, another screen) asks "Discard your changes?" first. Words come in both voices (`ui/terms.ts`); RMK terms stay RMK terms in the technical voice. On a phone the cards come first and a card opens full screen with Back. Morse is first, then macros, forks and profiles.

**All your behaviors** moves from Insights to the Behaviors area and replaces the read-only Usage list: filters (Everything, Not used, In use), search, type chips, sort by usage, rows that open to where each is used (click to go) and what it uses, select the unused and delete them, Copy and Paste. The library's rows are GLIDE's: the name, rename in the row, Copy/Paste, Delete with Guard's Show me, and a "used only by unused behaviors" badge. What a screen offers (which kinds, whether paste or create is possible) comes from capabilities.

## Consequences

- One more piece of workbench state (`labels`) and its persistence; the history step gains an optional `labels` pair. Nothing changes for the keyboard: labels are never written to it.
- `io.setSlot`, `io.writeMacros` and `io.deleteMorseProfile` stop being how screens change behaviors; the screens call `io.apply`.
- Names survive a TOML round trip and a reconnect of the same keyboard; on another computer they come with the file.
- The way there is four parts, each green before the next: the operations; All your behaviors; the editor shell (Morse, then Macros, Forks, Profiles); the library rows.
