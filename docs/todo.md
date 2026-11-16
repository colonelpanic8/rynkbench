# Todo

What is left to do, cheapest first within each group. Take one item per session; strike it here when it ships, with its commit. Decisions go in an ADR, not here.

## Architecture first (`docs/architecture-review.md`)

Before more UI work, in this order; the decisions go in ADR 0017.

1. **A core for the workbench.** Reducer, `makeIo` and the 7,000 lines of pure logic in `ui/` move to core layers; `ui/state.tsx` keeps only the React context.
2. **Every feature a capability, and one `offer()`.** Capability ids for combos, macros, morse, forks, Bluetooth, split, encoders; presets as capabilities; the probing guard over every `caps.*` read; a simulated board without RGB, with a test that opens every screen on it.
3. **Operations.** Named operations, image in, image out, judged by one Guard and applied as one undo step; transforms and presets onto it (closes the two rule-path items below); Send, Discard and Undo as functions.
4. **The doors.** `describe(image)`, then WebMCP and Flows on operations, behind flags; `docs/ARCHITECTURE.md`.

## Cheap

5. **Tests for the new RGB screens.** Layout properties' RGB Lighting and RGB Effects tabs, Advanced (layer settings, status setups), the Keymap's Lights menu and the Status light choices in the key's RGB Lighting tab have no render tests yet (`renderInWorkbench` with the offline Glove80 bundle). The pure parts are tested (`statusLight`, `draftHistory`, `oneHistory`, `pickHistorySide`, `planSync`).
6. **The clipboard write on a key click.** During browser checks the page wrote to the clipboard while only keys were clicked. Find out whether selecting a key triggers the copy handler; if so, clicking a key overwrites what you copied.
7. **Shorter stock Magic layer text** (RGB settings → Advanced): it still carries the old Lighting screen's long explanation.

## Medium

8. **Remove the overlay's leftover state.** With the Lighting screen gone, `lightingTarget` is always "overlay" and the overlay draft is never edited; the reducer cases, `activeLighting*`, and the state tests built around them can go. Keep the device's applied overlay for the live view.
9. **Rule writes onto the one path (ADR 0012/0013).** The condition rules panel, the lighting key presets and the stock Magic layer still write the whole rule table at once; the status setups and every key's light already stage their rules in the draft. Moving them makes rules undoable and sent with everything else.
10. **Status setups are not atomic in Live.** Their keys are written at once while their rules wait in the draft until you pause; a failed send leaves keys without lights. Stage the keys with the rules.
11. **The draft history's module-level state** (`useDraftHistory.ts`: history, skip, stroke) leaks between tests and windows; a store per Workbench would not.

## Large

12. **Select several keys on the Keymap,** so one RGB Lighting choice reaches them all (ADR 0016 stage 1 leftover; it is also what replaces zones). Touches selection, the canvas and the key editor.
13. **Keyboard settings onto the draft (ADR 0013, last step).** The lights (on/off, brightness, background) and effects keep their own Apply and stay out of Undo.

## Firmware (outside Rynkbench)

14. **Keep the lights as they were left** (`docs/firmware/rmk-persist-lighting`): build the Glove80 and Go60 firmware with both parts, run the README's try-out on a keyboard, then offer it upstream. Until then a restart brings back full brightness and the compiled background.
15. **Skip unchanged keys** (`docs/firmware/rmk-skip-unchanged-keys`): offer upstream.

## Done recently

- ADR 0016, RGB lighting the GLIDE way, stages 1–4 (`0cfd81e` … `ab6296d`).
- Send no longer fails on lighting the keyboard stored in its own order (`061d91c`).
- Review fixes: the first edit after a Send is undoable again; sync comparisons ignore key order everywhere (the review commit after `d0e19b0`).
