# Rynkbench working notes

A browser workbench for RMK/Rynk keyboards (Glove80, Go60 and plain RMK boards): edit the keymap, lighting and device settings live or in a file. The look and organization follow GLIDE: its colours, key drawing, top bar, side panel and key editor.

## Rules
- Leave every file you touch at least as clean as you found it.
- Every change keeps the guards green. Do not add to a baseline or an allow-list to make a test pass; fix the code.
- A decision that shapes the code goes in an ADR (`docs/adr/`, next number, one page, linked from its README).

## Layers (src/architecture/boundaries.ts; the map: docs/ARCHITECTURE.md)
- `session/` talks to keyboards (transports, the simulated boards); `config/` reads and writes layout files; `model/` holds plain data and pure functions; `domain/` the reference graph; `capabilities/` what a keyboard can do; `sync/` the one write path (read, plan the difference, write, read back; ADR 0012); `workbench/` the open workbench without a screen: state, reducer, `io`, the draft (ADR 0017); `ui/` the screens.
- Core layers and `workbench/` never import `ui/`; nothing below `workbench/` imports it. Screens never import a transport or the simulated boards; they use the session interface.
- Screens never import the generated wire package (`src/vendor/rynk-wasm`): action types come from `model/action-types.ts`, geometry from `model/keyboard.ts`. Older files on the baseline (`boundaries.baseline.json`) leave it when touched; the guard fails on a new one.
- What a screen offers is asked of capabilities (`ui/use-capabilities.ts`), never by probing firmware or testing a nullable field (`src/architecture/probing.ts`).

## Where things go
- A rule about keys, layers, bindings or lighting: a pure function in `model/` with its own test (see `model/key-slots.ts`, `model/lighting/`). Logic that needs the workbench, the reference graph or the write path: `workbench/`. Screens only show it and call `io` (ADR 0017).
- Which screens and sections exist: `ui/areas.ts`. Keyboard-wide settings (name, keyboard, firmware options, lighting output): Layout properties, `ui/properties/` (ADR 0015). The app's words, in both voices: `ui/terms.ts`.
- When changes reach the keyboard: Draft or Live (ADR 0010, `workbench/draft/`; the hooks in `ui/draft/`). New staged state joins the draft (`workbench/draft/changes.ts`), never a separate Apply.
- How anything reaches the keyboard: the one write path, `sync/` (ADR 0012, `docs/sync.md`): read fresh, `planSync` only the difference, `syncTo` writes and reads back. Never write a whole table or keymap "to be sure", never send an unchanged item; a bulk change (a transform, a Flow, a layer move) becomes a wanted image and goes through `syncTo`.
- What protects a layout: Rynkbench Guard (ADR 0011). Rules in `domain/guard.ts` (stop or ask, only what a change breaks); every key write passes `io` (`ui/guard/guardIo.ts`); several keys that form one change go through `io.writeKeys`. Guard speaks with its label: `askConfirm({ guard: true })`, `showToast(…, { guard: true })`.
- A question before something that cannot be undone: `askConfirm`; a note that something happened: `showToast` (`ui/messages/store.ts`). Never `window.confirm`/`alert`.
- A greyed-out button says why: `<Button disabled reason="…">`.
- Lists with row actions: `ui/RowMenu.tsx` (right-click, long press, ⋮). Resizable panes: `ui/panes.tsx`.
- Anything kept in the browser: `ui/settings.ts` (`SETTING_KEYS`, `createSetting`). Never use `localStorage` directly; never rename a key.
- The canvas: `ui/KeyboardCanvas.tsx` with its parts in `ui/canvas/` (decor, geometry, BoardWell, keys, devices).
- A board's own facts (geometry, labels, LEDs): `model/boards/` (Glove80 geometry is generated from GLIDE's board file).

## Style (tests enforce these)
- Colours only from theme tokens (Tailwind `text-ink`, `bg-panel`, `border-line`, `var(--color-…)`), never a literal or Tailwind's palette (`ui/theme/colours.test.ts`). The six themes are data in `ui/theme/themes.ts` (ADR 0014); a new token is named in `src/index.css` `@theme` and given a value in `themeTokens`; every theme stays legible (`themes.test.ts`).
- Browser-local preferences (computer, special keys, panel sides …): `ui/preferences.ts`; Settings: `ui/SettingsPanel.tsx`. Key pictures and per-computer modifiers: `ui/keyface/` (`keyFace`), never in a screen.
- Text only in the named sizes: `text-caption` 10, `small` 11, `body` 12, `ui` 13, `title` 15, `heading` 20, `display` 30 (`ui/theme/typography.test.ts`). Fonts: Inter, JetBrains Mono (`src/assets/fonts`).
- Files at most 500 lines (`src/architecture/file-size.test.ts`); a few older ones are listed and may only shrink. Split by job, not by size.
- Less text: a control that explains itself needs no hint. Messages lead with the consequence.

## Tests
- Screens are tested by rendering them in a test workbench: `renderInWorkbench(<Screen />, { bundle, state })` or `testWorkbench(…)` from `src/test/workbench.tsx`. Overrides are typed; do not cast a whole context. For a realistic board use a real bundle (`openBundle` on the offline Glove80).
- Pure logic gets a plain test next to it.

## Checking work
- The WASM clients are built by Nix: `npm run wasm` (or `just wasm`) links them into `src/vendor`, which is never committed.
- Then `npx tsc -b`, `npx oxlint` and the tests. `npm run t -- <paths>` prints only failures and totals; run the tests for what you changed, the whole suite before a large merge. `just check` runs lint, tests and the production build.
- Search only in `src/` and `docs/`; `.rgignore` hides golden files and fixtures (open one by path when needed). Big files (`session/link-session.ts`, `session/mock/board.ts`): find the line first, then read only that range.
- When a change touches a module that writes to the keyboard, move its writes onto the one path in the same change (ADR 0013); never add a write that bypasses Guard and the draft.

## Docs
- `docs/ARCHITECTURE.md` — the layers and how a change flows. `docs/todo.md` — what is left, cheapest first: strike an item when it lands.
- `docs/ux-brief.md` — the UX brief (areas, flows, principles). `docs/adr/` — decisions, newest last. `docs/glossary.md` — words. `docs/sync.md` — how writing to the keyboard works.
