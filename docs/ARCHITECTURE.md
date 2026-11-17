# Architecture

One map of Rynkbench: the layers, where a piece of code goes, and how a change travels from a click to the keyboard and back. The decisions behind it are in `docs/adr/`; this page links them and does not repeat them.

## The layers

```
 ui/            screens, React context and hooks, words, themes, key pictures
   │
 workbench/     the open workbench without a screen: state, reducer, io, draft
   │
 operations/    named changes, image in, image out: the catalog Flows and WebMCP will call
   │
 sync/          the write path: read, plan the difference, write, read back
 layers/        layer structure: rewrite plans for move, delete, duplicate
 config/        layout files in and out
 domain/        the reference graph (who refers to what) and Guard's rules
 model/         plain data and pure functions: keys, slots, macros, lighting, boards
 session/       the one interface to a keyboard; transports and simulated boards behind it
 capabilities/  what a keyboard can do, from its firmware's answers
 vendor/        generated protocol clients (WASM), never committed
```

The picture is the intent. What the tests enforce (`src/architecture/boundaries.ts`, ADR 0001; a new violation fails, old ones are listed in `boundaries.baseline.json` and may only go) is narrower:

- Nothing below `ui/` imports `ui/` or the app shell.
- Nothing below `workbench/` imports `workbench/`, and nothing below `operations/` imports `operations/`.
- `operations/` imports only `model/`, `domain/`, `layers/`, the wire types and the pure parts of `sync/` (`image`, `items`, `patch`, `plan`).
- `domain/` imports only `model/` (and, in `domain/sources.ts` alone, the wire package).
- `capabilities/` imports nothing outside itself.
- `sync/`, `workbench/` and `ui/` never import a transport or a simulated board, only the session interface.
- `ui/` never imports the Rynk wire package (`vendor/rynk-wasm`; a baseline of older files still does).

The layers from `sync/` down to `session/` are not ordered among themselves, and the code has imports both ways: `model/` imports types from `session/` (and values from `session/lighting-rules`), `sync/` and `config/`, and `capabilities/` types; `sync/` imports `model/` and `session/`; `config/` imports `model/`, `session/` and `sync/`; `session/` imports `model/` and, from the offline board, `config/` types.

| Layer | Lines | Holds | Never imports (tested) |
|---|---|---|---|
| `ui/` | 22,300 | Screens (`Workbench.tsx`, areas in `areas.ts`), the context (`state.tsx`), hooks, words (`terms.ts`, `labels.ts`), themes, key faces, the canvas, Guard's questions (`guard/`), module stores for a pick of keys, the lit view and Layout properties (ended by `workbench-end.ts`) | a transport or simulated board, the wire package |
| `workbench/` | 2,800 | `initial-state`, `reducer` (+ `reduce-lighting`, `reduce-settings`), `pending`, `lighting-drafts`, `io` (+ `io-keys`, `io-layers`, `io-lighting`, `io-settings`, `io-import`, `io-try-out`), `apply` (`commitImage`), `labels`, `draft/`, `usage`, `layer-impact` | `ui/`, a transport |
| `operations/` | 1,000 | Each operation (`keys`, `layers`, `lighting`, `transform`, `behaviors` with their slots and Copy text), the `catalog` with `runOperation`, input checks, Guard's view of an image (ADR 0019, 0020) | a session, a reader or writer, `config/`, `workbench/`, `ui/` |
| `sync/` | 780 | `image`, `items`, `patch`, `plan`, `read`, `write`, `conflicts` (ADR 0012, 0021, `docs/sync.md`) | `operations/`, `workbench/`, `ui/`, a transport |
| `layers/`, `config/`, `domain/`, `firmware/` | 2,000 | Layer rewrites; layout files (`transfer`, `import-layout`, `document`); the graph and Guard (ADR 0011); firmware releases | `operations/`, `workbench/`, `ui/` |
| `model/` | 5,300 | Key slots, the key selection, combos, macros, morse, pointing, history, transforms, `lighting/` (key lights, effects and timing, try-out, key picks, presets), `boards/`, the workbench state's types | `operations/`, `workbench/`, `ui/` |
| `capabilities/` | 190 | Capability ids and their resolution (ADR 0002) | anything else |
| `session/` | 6,500 | `types.ts` (the interface), `link-session.ts` (the protocol core), `flash-writes.ts`, transports, `mock/` and `offline/` boards | `operations/`, `workbench/`, `ui/` |

Lines: non-test `.ts`/`.tsx` lines, rounded.

Where a new piece of code goes is one question: what does it need? Only data: `model/`. The workbench, the reference graph or the write path: `workbench/`. React, words or the person's attention: `ui/`. ADR 0017 has the details; `AGENTS.md` lists the places for screens.

## What you want, and what the keyboard holds

- `state.base` is what the keyboard (or the file) held at the last read, for every item (ADR 0022).
- What you want is not one stored value. The screens read fields of the state (`layers`, the slot tables, `layerDrafts`, `runtimeConditionalDraft`, `pointingDraft`, the settings); `wantOf` (`workbench/draft/want.ts`) assembles them into one `KeyboardImage` and `withWant` writes one back.
- The draft is the difference, item by item: `draftOf(state)`. `state.basedOn` holds, for drafted items the keyboard changed since, the value the draft was based on, for Send's three-way check.
- The history is a list of patches of what you want (ADR 0018), up to 100 steps.

## How a change flows

```
 a screen                          a key, a light, a drag, Paint, Import, Undo
   │ io.* (useWorkbench)           Guard first: guardIo for key and slot writes,
   │                               the io's judge for commits (ADR 0011, 0019)
   ▼
 io (workbench/io-*.ts)
   ├─ a commit: io.apply / writeKeys / layer ops / importLayout ──▶ commitImage
   │     dispatch commit: what you want changes, one Undo step
   │     Draft: waits for Send
   │     Live:  sendStaged at once (its own items, no question), all or nothing
   │
   ├─ a direct edit: setKey, setSlot, setEncoder, settings, lighting controls
   │     Draft: what you want changes (keyStage, slotStage, wantSet …)
   │     Live:  …WriteStart ──▶ session.* ──▶ …Ok / …Err; base takes only that item
   │
   ├─ Paint, rules, pointing: dispatch into the draft
   │     Live: DraftKeeper sends it 0.6 s after the last change (UNATTENDED:
   │           no question, a clash held back for Send)
   │
   └─ Send (io.applyBatch) ──▶ workbench/draft/send.ts
         readImage ─▶ conflicts(based-on, now, want) ─▶ syncTo(want):
         planSync (keys by whole row) ─▶ writePlan (setRows …) ─▶ read back
         read-back ─▶ base: what reached the keyboard leaves the draft
                                                        │
                       session (one interface) ─▶ transport ─▶ keyboard
                                                        │
 topic events (layer, battery, lighting …) ◀────────────┘
   └─▶ dispatch topic… ──▶ reducer ──▶ screens re-render from state
```

1. **A screen never writes.** It calls `io` (from `useWorkbench()`). Every key and slot write passes Guard (`ui/guard/guardIo.ts`); a commit is judged by `guardJudge`, which the io calls.
2. **`io` decides when.** In Draft a change only changes what you want. In Live a commit is sent at once through the write path; a direct edit is written through the session at once and narrated by actions (`…Start`, then `…Ok` or `…Err`), and `base` takes only what it wrote (ADR 0022).
3. **The reducer is the only place state changes** (`workbench/reducer.ts`). It is pure; reads and topic events from the keyboard arrive through it too.
4. **A bulk change is an operation** (ADR 0019): a pure function from the image you want to the next, listed in the catalog (`operations/`). `io.apply(name, input)` runs it and commits the result. A file import is a commit too, without being in the catalog (ADR 0023).
5. **One Undo** (ADR 0018): every edit is one step of the history; Undo commits the inverse, through Guard and the mode like any edit. Try-out lights are outside it.

### What goes through the write path, and what does not

Through `sync/` (fresh read, three-way check, only the difference, read back): Send; every commit (operations, `io.writeKeys`, layer move, delete and duplicate, imports) in Live; Undo and Redo in Live; Live's own send.

Not yet:

- **Direct Live writes** from `workbench/io-*.ts`: `keymap.setKey` (one key), `keymap.setEncoder`, `combos.set` / `morse.set` / `forks.set` (`io.setSlot`), `behavior.set`, `behavior.setHoldTriggerPositions`, `keymap.setDefaultLayer`, `keymap.setLayerMetadata` (rename), `lighting.setState`, `lighting.scenes.setLayerPolicy`, `lighting.setWakeLayers`, `lighting.setExtensionState` / `setExtensionLayers` / `setExtensionParam`. In Draft each of these changes what you want instead.
- **Whole tables in either mode:** `io.applyScenes` and `io.applyConditionalScenes` (`io-lighting.ts`), used by the condition-rules panel's Apply rules, the lighting key presets and the stock Magic layer; the presets write their keys one by one before the table (todo 10, 11).
- **Try-out lights:** `lighting.replaceOverlay` and `clearOverlay` (`io-try-out.ts`), never stored.
- **The Device screen** calls the session itself for Bluetooth pairings, automatic transport switching and split latency; `io` reboots to the bootloader and resets storage.

## Where to start reading

| To understand | Read |
|---|---|
| What the workbench holds | `model/workbench-state.ts`, `workbench/initial-state.ts` |
| How it changes | `workbench/reducer.ts` |
| How it reaches the keyboard | `workbench/io.ts`, `workbench/apply.ts`, then `docs/sync.md` |
| What the draft is | `workbench/draft/want.ts`, `workbench/draft/changes.ts`, ADR 0018, 0022 |
| What protects a layout | `domain/guard.ts`, `ui/guard/guardIo.ts`, ADR 0011 |
| What a Flow or an assistant can call | `operations/catalog.ts`, `workbench/apply.ts`, ADR 0019 |
| Importing a file | `config/transfer.ts`, `config/import-layout.ts`, `workbench/io-import.ts`, ADR 0023 |
| Lighting tools on the keymap | `model/key-selection.ts`, `ui/keymap/useKeySelection.ts`, `ui/keymap/LayerLighting.tsx`, `ui/lighting/keyPick.ts`, `workbench/io-try-out.ts`, ADR 0024 |
| Behavior names and descriptions (labels) | `model/behavior-labels.ts`, `state.labels`, `ui/behaviors/LabelKeeper.tsx`, ADR 0020 |
| What a keyboard can do | `capabilities/`, ADR 0002 |
| How a screen gets all this | `ui/state.tsx` (`useWorkbench`), `ui/Workbench.tsx` |
| How screens are tested | `src/test/workbench.tsx` (`renderInWorkbench`) |

## What comes next

From the architecture plan (`docs/architecture-review.md`, "The plan, validated"; `docs/todo.md`), done: the safety net, `workbench/`, the draft as a wanted image, operations. Left: the direct Live writes and whole-table writes onto the write path; capabilities and `offer()` for everything a screen offers; ADR 0019's Realtime switch for lighting; then `describe(image)`, Flows and WebMCP.
