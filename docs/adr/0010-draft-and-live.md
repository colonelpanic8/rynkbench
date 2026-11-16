# 0010. Draft and Live: when changes reach the keyboard

**Status:** Accepted

## Context

Rynkbench edits a keyboard while it is connected. RMK stores every write: unlike ZMK Studio, which holds edits in the keyboard's memory until `save_changes`, there is no "change now, save later" on the keyboard. Before this decision three behaviours sat side by side: key and encoder edits went to the keyboard at once unless Batch was on, lighting had its own Apply, and the rest wrote immediately. Nothing said plainly whether the keyboard had your changes. Many edits are best made together and sent once; some (trying a key) are best live.

## Decision

- **Two modes, one switch** in the top bar's connection chip: **Draft** (changes stay in Rynkbench until **Send**) and **Live** (each change goes at once). A keyboard starts in Draft, as GLIDE and ZMK Studio do. Turning Live on warns that every change writes the keyboard's memory. Live cannot be turned on while the draft has changes.
- **The draft is Rynkbench's**, on top of the existing staging: staged keys and encoders (the old Batch), each layer's lighting draft and the lighting rules. `src/ui/draft/changes.ts` says what it holds (pure); `useDraft` sends it in one go (keys and encoders, then every changed layer's lighting as one scene table, then the rules) and discards it; what fails stays in the draft.
- **One status, always visible**: the chip says which keyboard and how it is connected (or that this is a file), Draft or Live, and in Draft either "Up to date" or the number of changes with **Review & send** and **Discard**; while sending, how many are left. The review window lists the changes by area and layer, each with its own Discard.
- **Nothing is lost**: the draft is kept in this browser per keyboard serial (`SETTING_KEYS.draft`) and offered back on the next connect (Restore / Forget); closing the page with changes asks first; in Live, lighting is sent once painting pauses.
- **Undo works in Draft**: the draft keeps its own steps for staged keys (`draft/draftHistory.ts`); Send and Discard start a new history. Device history stays for Live.

## Consequences

- Combos, morse, macros and device settings still write at once; the review window says so. They join the draft next.
- `state.tsx` did not grow: the draft is built from its existing staging, outside it.

## Later

- Send now goes through the one write path of ADR 0012: a fresh read, a three-way check, only what differs, one read-back. Combos, morse and forks joined the draft; a kept draft remembers what each change was based on.
