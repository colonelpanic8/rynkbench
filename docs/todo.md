# Todo

What is left to do, cheapest first within each group. Take one item per session; strike it here when it ships, with its commit. Decisions go in an ADR, not here.

## Architecture first (`docs/architecture-review.md`, "The plan, validated")

In this order; decisions in ADR 0017 and an update of ADR 0002.

1. **A safety net.** Render tests for the RGB screens; a simulated board without RGB or Bluetooth; a test that opens every area and section on every simulated board.
2. **A core for the workbench.** Reducer and `io` out of `ui/state.tsx` into `workbench/`; 3,400 lines of domain logic out of `ui/`; `docs/ARCHITECTURE.md`. One go, no parallel sessions.
3. ~~**The draft holds the whole keyboard** (the rest of ADR 0013): macros, layer names and moves, settings; one history in Draft and Live.~~ ADR 0018, three commits on `redesign`.
4. **Operations.** Image in, image out, judged by Guard, applied as one undo step; transforms, presets and rule panels onto them (closes the rule-path and atomic-setup items below).
5. **Capabilities and `offer()`** for everything a screen offers; any time after the safety net.
6. **The doors:** `describe(image)`, then Flows and WebMCP behind flags.

## Cheap

7. **The clipboard write on a key click.** During browser checks the page wrote to the clipboard while only keys were clicked. Find out whether selecting a key triggers the copy handler; if so, clicking a key overwrites what you copied.
8. **Shorter stock Magic layer text** (RGB settings → Advanced): it still carries the old Lighting screen's long explanation.

## Medium

9. **Remove the overlay's leftover state.** With the Lighting screen gone, `lightingTarget` is always "overlay" and the overlay draft is never edited; the reducer cases, `activeLighting*`, and the state tests built around them can go. Keep the device's applied overlay for the live view.
10. **Rule writes onto the one path (ADR 0012/0013).** The condition rules panel, the lighting key presets and the stock Magic layer still write the whole rule table at once; the status setups and every key's light already stage their rules in the draft. Moving them makes rules undoable and sent with everything else.
11. **Status setups are not atomic in Live.** Their keys are written at once while their rules wait in the draft until you pause; a failed send leaves keys without lights. Stage the keys with the rules.
12. ~~**The draft history's module-level state** (`useDraftHistory.ts`: history, skip, stroke) leaks between tests and windows; a store per Workbench would not.~~ The history is workbench state (ADR 0018).

## Large

13. **Select several keys on the Keymap,** so one RGB Lighting choice reaches them all (ADR 0016 stage 1 leftover; it is also what replaces zones). Touches selection, the canvas and the key editor.

## Firmware (outside Rynkbench)

14. **Keep the lights as they were left** (`docs/firmware/rmk-persist-lighting`): build the Glove80 and Go60 firmware with both parts, run the README's try-out on a keyboard, then offer it upstream. Until then a restart brings back full brightness and the compiled background.
15. **Skip unchanged keys** (`docs/firmware/rmk-skip-unchanged-keys`): offer upstream.

## Done recently

- ADR 0016, RGB lighting the GLIDE way, stages 1–4 (`0cfd81e` … `ab6296d`).
- Send no longer fails on lighting the keyboard stored in its own order (`061d91c`).
- Review fixes: the first edit after a Send is undoable again; sync comparisons ignore key order everywhere (the review commit after `d0e19b0`).
