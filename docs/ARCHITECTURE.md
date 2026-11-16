# Architecture

One map of Rynkbench: the layers, where a piece of code goes, and how a change travels from a click to the keyboard and back. The decisions behind it are in `docs/adr/`; this page links them and does not repeat them.

## The layers

Each layer imports only from layers below it. The rules are tests (`src/architecture/boundaries.ts`, ADR 0001); a new violation fails the build.

```
 ui/            screens, React context and hooks, words, themes, key pictures
   │
 workbench/     the open workbench without a screen: state, reducer, io, draft
   │
 operations/    named changes, image in, image out: the catalog Flows and WebMCP will call
   │
 sync/          the one write path: read, plan the difference, write, read back
 layers/        layer structure: rewrite plans for move, delete, duplicate
 config/        layout files in and out
 domain/        the reference graph (who refers to what) and Guard's rules
 model/         plain data and pure functions: keys, slots, macros, lighting, boards
 capabilities/  what a keyboard can do, from its firmware's answers
   │
 session/       the one interface to a keyboard; transports and simulated boards behind it
 vendor/        generated protocol clients (WASM), never committed
```

| Layer | Lines | Holds | Never imports |
|---|---|---|---|
| `ui/` | 21,400 | Screens (`Workbench.tsx`, areas in `areas.ts`), the context (`state.tsx`), hooks, words (`terms.ts`, `labels.ts`), themes, key faces, the canvas, Guard's questions (`guard/`) | a transport or simulated board, the wire package |
| `workbench/` | 2,700 | `initial-state`, `reducer` (+ `reduce-lighting`, `reduce-settings`), `pending`, `lighting-drafts`, `io` (+ `io-keys`, `io-layers`, `io-lighting`, `io-settings`), `apply` (an operation's result as one commit), `draft/`, `usage`, `layer-impact` | `ui/`, a transport |
| `operations/` | 450 | Each operation (`keys`, `layers`, `lighting`, `transform`), the `catalog` with `runOperation`, input checks, Guard's view of an image (ADR 0019) | a session, a reader or writer, `workbench/`, `ui/` |
| `sync/` | 430 | `image`, `plan`, `write`, `conflicts` (ADR 0012, `docs/sync.md`) | `ui/`, `workbench/`, a transport |
| `layers/`, `config/`, `domain/`, `firmware/` | 2,100 | Layer rewrites; layout files; the graph and Guard (ADR 0011); firmware releases | `ui/`, `workbench/` |
| `model/` | 4,900 | Key slots, combos, macros, morse, pointing, history, transforms, `lighting/`, `boards/`, the workbench state's types | `ui/`, `workbench/` |
| `capabilities/` | 140 | Capability ids and their resolution (ADR 0002) | anything else |
| `session/` | 6,500 | `types.ts` (the interface), `link-session.ts` (the protocol core), transports, `mock/` and `offline/` boards | `ui/`, `workbench/` |

Where a new piece of code goes is one question: what does it need? Only data: `model/`. The workbench, the reference graph or the write path: `workbench/`. React, words or the person's attention: `ui/`. ADR 0017 has the details; `CLAUDE.md` lists the places for screens.

## How a change flows

Take a key changed in the key editor.

```
 KeyEditor (ui)                 the person picks an action
   │ io.writeKeys([edit])       through Guard's wrapper (ui/guard/guardIo.ts):
   │                            judgeChange(before, after) may stop or ask
   ▼
 io (workbench/io-keys.ts)
   ├─ Draft: dispatch keyStage ──▶ reducer: what you want changes (nothing sent yet)
   │          the draft = differences(base, want)   (workbench/draft/want.ts)
   │          … Send: io.applyBatch ──▶ workbench/draft/send.ts
   │                    readImage ─▶ conflicts(based-on, now, want) ─▶ syncTo(want)
   │                    read-back ─▶ base   (what reached the keyboard leaves the draft)
   │                                                                 │
   └─ Live:  dispatch keyWriteStart ──▶ session.keymap.setKey ───────┤
             keyWriteOk / keyWriteErr                                │
                                                                     ▼
                                            session (one interface) ─▶ transport ─▶ keyboard
                                                                     │
 topic events (layer, battery, lighting …) ◀─────────────────────────┘
   └─▶ dispatch topic… ──▶ reducer ──▶ screens re-render from state
```

1. **A screen never writes.** It calls `io` (from `useWorkbench()`), and every key write passes Guard first (ADR 0011).
2. **`io` decides when.** In Draft the change only changes what you want; the draft is its difference from `base`, what the keyboard held at the last read (ADR 0010, ADR 0018). In Live it is written at once and narrated by actions (`…Start`, then `…Ok` or `…Err`), and `base` with it.
3. **The reducer is the only place state changes** (`workbench/reducer.ts`). It is pure; topic events from the keyboard arrive through it too.
4. **A bulk change is an operation** (ADR 0019): a pure function from the image you want to the next, listed in the catalog (`operations/`). `io.apply(name, input)` runs it, lets Guard judge the result (the screen's `judge`), and makes it one commit: in Draft it waits for Send, in Live it goes at once through the one write path, all or nothing. `sync/` plans only the difference, writes it and reads it back (ADR 0012, `docs/sync.md`).
5. **One Undo** (ADR 0018): every edit is a commit to what you want and one step of the history, kept in the workbench state as a patch. Undo commits the inverse, through Guard and the mode like any edit: in Live, Send's path writes it to the keyboard.

## Where to start reading

| To understand | Read |
|---|---|
| What the workbench holds | `model/workbench-state.ts`, `workbench/initial-state.ts` |
| How it changes | `workbench/reducer.ts` |
| How it reaches the keyboard | `workbench/io.ts`, then `docs/sync.md` |
| What the draft is | `workbench/draft/changes.ts`, ADR 0010 |
| What protects a layout | `domain/guard.ts`, ADR 0011 |
| What a Flow or an assistant can call | `operations/catalog.ts`, `workbench/apply.ts`, ADR 0019 |
| What a keyboard can do | `capabilities/`, ADR 0002 |
| How a screen gets all this | `ui/state.tsx` (`useWorkbench`), `ui/Workbench.tsx` |
| How screens are tested | `src/test/workbench.tsx` (`renderInWorkbench`) |

## What comes next

The architecture plan (`docs/architecture-review.md`, "The plan, validated"; `docs/todo.md`): the draft holds the whole keyboard as a wanted image (`workbench/draft/`); `operations/`, image in, image out, beside `workbench/`; capabilities and `offer()` for everything a screen offers; then `describe(image)`, Flows and WebMCP.
