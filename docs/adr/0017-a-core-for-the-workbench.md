# 0017. A core for the workbench

**Status:** Accepted. Step 2 of the architecture plan (`docs/architecture-review.md`, "The plan, validated"); the later steps (the draft as a wanted image, operations) will add to this record's layout, not change it.

## Context

The workbench's logic lived with its screens. `ui/state.tsx` held the reducer, the `io` facade and the React context in 1,594 lines, on the size exemption list. About 3,400 more lines of pure domain logic sat under `ui/`: transforms, the usage report, the lighting rules and presets, the draft. The boundaries guard forbids core layers to import `ui/`, so none of this could be used by code without React: an operations layer, a Flow runner, a WebMCP tool.

## Decision

A new layer, `src/workbench/`: the open workbench without a screen. It sits between the core layers and `ui/` (ADR 0001's "application services"): it may import every core layer, never `ui/` or the app shell, and no core layer imports it. Like `sync/`, it reaches a keyboard only through the session interface, never a transport or a simulated board. The guard says so (`src/architecture/boundaries.ts`).

**Where things go.** One question decides: what does the code need?

- **`model/`: needs only data.** Pure functions over keyboard data and the wire types, importing nothing above `model/` but types. The keymap transforms (`model/transforms.ts`) and the lighting rules in `model/lighting/`: colours, comparisons, effect shapes, the rule table's edits, wake layers, the firmware's rules, the preview, the status presets and lights, the stock Magic layer, the lighting key presets, a key's light.
- **`workbench/`: needs the workbench, the reference graph or the write path.** The state and how it changes: `initial-state.ts`, `pending.ts` (pending-write ids), `lighting-drafts.ts`, and the reducer by job (`reducer.ts` for keys, history, Draft, encoders and layers; `reduce-lighting.ts`; `reduce-settings.ts` for slots, settings, morse profiles and pointing). The `io` facade: its contract and `makeIo` in `io.ts`, its parts by job (`io-keys.ts`, `io-layers.ts`, `io-lighting.ts`, `io-settings.ts`). The draft: `draft/` (what it holds, its history, its images, Send, staged slots, the selectors). Reports over the reference graph: `usage.ts`, `layer-impact.ts`. Screens import the state, reducer and `io` through `workbench/index.ts`, and the draft's modules and the reports by file; inside the workbench, modules import each other by file.
- **`domain/` unchanged.** It imports only `model/`, and the files above use the wire types, so none of them fit.
- **`ui/` keeps what shows or asks.** The React context (`ui/state.tsx`: `WorkbenchContext`, `useWorkbench`), hooks (`useDraft`, `useDraftHistory`, `oneHistory`), Guard's questions to the person (`ui/guard/`, which needs the message store), the Keymap's clipboard and shortcuts (`keymap/keyManipulation.ts`), words, labels, themes, key pictures, the canvas, the Behavior Library's lists (they are words), the live view's compositor, the connect snapshot (`bundle.ts`).

**How.** Files move with `git mv`, so their history follows; a file over 500 lines is split by job while it moves (the reducer and `makeIo`), its function bodies unchanged. Nothing behaves differently: tests change only in their imports. The workbench uses its own `WorkbenchDispatch` type, not React's (they are the same function type). `model/workbench-state.ts` keeps the state's types for now: `config/` describes a workbench with them, and splitting domain from application state is a later step.

## Consequences

- An operation, a Flow runner or a test can build a workbench, change it and write it with no screen: `initialWorkbenchState`, `makeWorkbenchReducer`, `makeIo`.
- `ui/state.tsx` leaves the size exemption list; the layout is mapped in `docs/ARCHITECTURE.md`.
- Eleven `ui-never-imports-wire-types` baseline entries go with the files that move.
- The next steps land here: the draft as a wanted image (`workbench/draft/`), then `operations/` beside `workbench/`, image in, image out.
