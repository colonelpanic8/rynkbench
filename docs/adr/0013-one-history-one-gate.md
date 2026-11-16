# 0013. One document, one history, one gate: adopted module by module

**Status:** Accepted (the end state); reached step by step.

## Context

GLIDE has one layout document: every edit is a new version of it, passes one commit gate, and is one undo step (`pushHistory`). Rynkbench has two histories (Live undo replays old key values to the keyboard, keys only; the draft has its own history, reset after Send) and Guard (ADR 0011) at only some of the io's writes. ADR 0012 already describes the wanted layout as the one thing edits change, but only Send and layer operations go through it.

## Decision

- **The end state:** the layout you want is one document in the shape the sync layer compares (`sync/image.ts`). Every edit, one key or a Flow, is one commit: Guard judges it, it becomes one undo step, and the mode decides when the sync writes the difference (Live at once, Draft on Send, not connected later). Undo is the same in every mode and covers everything.
- **The way there:** no big rewrite. When a change touches a module that writes to the keyboard (macros, layer names, behavior settings, profiles, encoders, keys …), its writes move onto that path in the same change. New code never adds a write that bypasses it.
- **Order of likely touches:** keys and combo, morse and fork slots (already items of the sync), then macros and layer names, then settings.

## Consequences

- Each step is shippable; Live and Draft keep working throughout.
- Until a module has moved, its writes keep their current behaviour (Guard and the draft cover keys, slots and lighting today).
- When the last module has moved, the per-key keyboard history and the separate draft history go.
