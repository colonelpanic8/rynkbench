# Architecture review (November 2026)

Before more UI work: is the architecture ready for WebMCP, other keyboards, stock RMK without RGB, growth and Flows, and is it at least as good as GLIDE's? Measured on `redesign` at `3226d67`, against `moosylog/glide-src` at `f329879`.

**Verdict.** The foundations are better than GLIDE's in several places: types everywhere, layer boundaries enforced by tests, one write path that reads back what it wrote, firmware capabilities as the source of truth, and an ADR for every decision that shapes the code. But the domain logic has not followed: most of it lives in `ui/`, there is no layer of named operations, and only lighting is a capability. Those three gaps block WebMCP and Flows, and a critical engineering manager would see them first. They are fixable without a rewrite, in four steps (below).

## The numbers

| | Rynkbench | GLIDE |
|---|---|---|
| Core (no screens) | 5,000 lines in `model/ domain/ sync/ capabilities/ session/ config/ layers/ firmware/`, plus about 4,800 lines of domain logic that lives in `ui/` (3,400 in pure files, 1,400 of reducer and `io` in `ui/state.tsx`) | 13,500 lines in `core/` |
| Screens | 26,000 lines in `ui/` (including the domain logic above) | 14,000 lines in `ui/` |
| Largest file | `ui/state.tsx`, 1,594 lines: reducer, `io`, React context (on the size exemption list) | `ui/App.jsx`, on its budget list |
| Test files | 118 | 246 |
| Types | TypeScript, strict, everywhere | JSDoc; `core/` type-checked in CI |
| Architecture guards | boundaries, probing, file size, colours, type sizes | module graph, board facts, file size, colours, type sizes, UI specs, docs paths |

## Your seven questions

### 1. Functions separate enough for WebMCP: partly

What is right: the reducer is pure (`makeWorkbenchReducer`); `makeIo` is a factory, not a hook; planning is pure and tested (`sync/plan.ts`, `layers/management.ts`, `model/key-slots.ts`, `ui/advanced/transforms.ts`).

What is missing:

- **No named operations.** GLIDE's WebMCP plan stands on `core/operations.js`: `runOperation(layout, name, args)` returns a new layout, judged by GLIDE Guard, and the screen applies it. Rynkbench's `io` methods write to the keyboard (`setKey`, `setSlot`, `writeMacros` …); there is no "image in, image out" operation an assistant could call and preview.
- **Draft operations exist only as hooks.** Send, Discard and Undo are reachable only through `useDraft` and `useDraftHistory`, so code without React (a WebMCP tool, a Flow runner, a test) cannot drive them.
- **Logic in the wrong layer.** About 3,400 lines of pure domain logic sit under `ui/`: transforms, usage, status presets, the stock Magic layer, firmware rules, key manipulation, key lights, the draft history. (Another 3,500 lines of pure files there are presentation, such as words, themes and key pictures, and rightly stay.) The boundaries guard forbids core layers to import `ui/`, so none of it can be reused by an operations layer as it stands.
- **No layout as text.** GLIDE's `core/describe.js` turns a layout into text an assistant can read; Rynkbench has `labels.ts`, made for screens.

### 2. Capabilities per keyboard, ready for other boards: mostly

What is right: the firmware's answers are the authority, and a board profile (`model/boards/profile.ts`) is optional product knowledge: identity, geometry, documents, presets, firmware updates. An unknown keyboard stays generic and works. "Not supported" is told apart from "the request failed" (`session/unsupported.ts`). This is the right foundation, and it is better than GLIDE's, which knows its boards from files.

What is missing:

- **Only 8 capability ids, 6 of them lighting.** Combos, macros, morse, forks, Bluetooth, split and encoders are offered by reading raw firmware fields (`caps.max_combos`, `caps.ble_enabled` …): about 80 reads in 12 screen files. The probing guard watches only 7 lighting fields.
- **Presets are strings checked in screens** (`boardProfile?.presets.includes("glove80-status")`).
- **No single place says what a screen offers and why.** GLIDE has `offer(feature, context)` with a feature catalog (`core/policy/`), so a new keyboard is a data change, never a screen change.

### 3. Stock RMK without RGB: yes, by design, but not exercised

Every lighting surface is a capability, and a keyboard without them shows every area (`areas.test.ts`). Two caveats:

- **Rynk only.** Rynk is now upstream RMK's own protocol, but experimental and off by default (Vial is the default). Stock RMK works with Rynkbench when built with the `rynk` feature; there is no Vial transport, and none is planned.
- **No simulated board without lighting.** All three simulated boards (Glove80, Ortho 60, Stub 48) have RGB, so no test opens every screen on a board without it.

### 4. Modular, built for growth: the frame is, the core is not yet

The frame is strong: layers whose boundaries are tests, one write path (read fresh, plan the difference, write, read back), Guard on every key write, Draft and Live, themes and type sizes as data, and an ADR for each decision.

Against growth:

- **`ui/state.tsx` does three jobs** (state, `io`, context) in 1,594 lines, on the exemption list.
- **The workbench context is one large object** every screen takes whole.
- **Module-level state** in the draft history leaks between tests and between windows.
- **Bulk changes bypass the one write path.** `CLAUDE.md` says a bulk change becomes a wanted image and goes through `syncTo`; transforms write their keys as one guarded batch, then each combo, morse and fork slot and the macros separately, through `io` (`ui/advanced/TransformsTab.tsx`). So do the rule panels and some presets (todo items 5 and 6).

### 5. Ready for Flows: the substrate is, the path is not

The substrate is better than GLIDE's: `KeyboardImage` (`sync/image.ts`) is the whole keyboard as one value (keys, encoders, combos, morse, forks, macros, behaviour options, lighting scenes, rules, wake layers, pointing), and `syncTo` writes only the difference and checks it after writing. A Flow is a function from one image to another.

What is missing is the path a Flow's result takes:

- **operations** to write Flows with (point 1);
- **one judgement for any result:** close already. Rynkbench Guard (`judgeChange(before, after)`, `domain/guard.ts`) compares two whole layouts, like GLIDE's `judgeFlowResult`; only the `io` wrapper feeds it one write at a time, so it needs an adapter from an image;
- **one way to apply a whole image:** as a proposal with a preview, then Apply as one undo step, in Draft and Live alike;
- **a runner** (GLIDE runs jq in a Web Worker with a time limit). That waits until we decide what Flows look like on RMK: jq over a JSON form of the image, or TypeScript.

### 6. At least as good as GLIDE: in the foundations yes, in the core not yet

| Where Rynkbench is ahead | Where GLIDE is ahead |
|---|---|
| Strict TypeScript everywhere | Named operations (`core/operations.js`), the base for WebMCP and Flows |
| Capabilities from the firmware, board profiles optional | `offer()` and a feature catalog: one place decides what a screen offers |
| One write path with read-back checks against a live keyboard | Flows: runner, contract, run log, links |
| Layer boundaries enforced by tests | Half the code is core; the screens stay thin |
| ADR discipline (16 ADRs) | `ARCHITECTURE.md`: one map of how a change flows; Rynkbench's is a README section |
| | Twice the test files, and UI specs checked by tests |

### 7. Would a critical engineering manager be proud?

Of the guards, the types, the sync path and the ADRs: yes. They would stop at `ui/state.tsx`, at domain rules living in `ui/`, at screens reading raw firmware fields, at transforms that bypass the write path the docs require, and at new screens without render tests. None of these need a rewrite; each is a move with tests already around it.

## The plan, validated

The first plan (four steps) was checked against the code. Five findings changed it:

1. **The move is smaller than measured.** Of the 7,000 pure lines in `ui/`, 3,500 are presentation (words, themes, key pictures, the key picker's data) and stay. What moves is about 4,800 lines: 3,400 of domain logic and 1,400 of reducer and `io`. Their ties to `ui/state.tsx` are few and mostly types: the move is feasible.
2. **Guard is already a whole-layout judge.** `judgeChange(before, after)` takes two layouts; an operation needs an adapter from `KeyboardImage`, not a new Guard.
3. **The draft cannot hold a whole keyboard.** It holds keys, encoders, combos, morse, forks, lighting and rules; not macros, layer names, layer moves, behaviour options, the default layer, wake layers or pointing. An operation or Flow that adds a macro or moves a layer has nowhere to go in Draft. This is the plan's biggest hidden step, and it is the rest of ADR 0013.
4. **Tests must come before the move.** Moving 4,800 lines is safe only with a net: the new RGB screens have no render tests, and no simulated board lacks RGB.
5. **`offer()` is due by ADR 0002's own condition.** ADR 0002 deferred it "until a layer beyond the firmware has a real user"; board presets checked as strings in screens are that user now. It is independent of the core move and can come at any point.

No conflicting work is in flight: the only other branch (`foundation`) is already part of `redesign`.

### The plan

Each step keeps every test green, ships on its own, and has a test that says it is done. Decisions go in ADR 0017 (the core and operations) and an update of ADR 0002 (`offer()`).

0. **A safety net** (one session). Render tests for the RGB screens; a simulated board without RGB or Bluetooth; a test that opens every area and section on each simulated board. *Done when* every screen renders on all four boards in CI.
1. **A core for the workbench** (one session). `workbench/` gets the reducer and `io` from `ui/state.tsx`, which keeps only the React context; the 3,400 lines of domain logic move to `model/`, `domain/` or `workbench/`, with `git mv` to keep their history; `docs/ARCHITECTURE.md` maps how a change flows. *Done when* the boundaries guard forbids `workbench/` to import `ui/`, `ui/state.tsx` is off the size exemption list, and nothing behaves differently (same tests, no test changed but imports). Done in one go, with no other session on Rynkbench meanwhile: a move conflicts with everything.
2. **The draft holds the whole keyboard** (two or three sessions). ADR 0017 decides between two designs: more kinds of staged items (macros, layer names and moves, settings), or the draft as a wanted image beside its base, from which the staged list is computed. The second is simpler and is what operations need; the review favours it. *Done when* any `KeyboardImage` can be staged and shows in Review & send, and Undo covers it in Draft and Live (one history, ADR 0013's end).
3. **Operations** (one or two sessions). `operations/`: named operations, image in, image out (`set_keys`, `swap_keys`, `move_layer`, `apply_transform`, `set_key_light`, `install_preset` …), each result judged by Guard through the adapter, and applied in one way: staged in Draft, sent through `syncTo` in Live, one undo step either way. Transforms, presets and the rule panels move onto them (todo: the rule path, atomic status setups). *Done when* no screen writes through `io` for a bulk change.
4. **Capabilities and `offer()`** (one session, any time after step 0). Capabilities for what a screen offers (combos, macros, morse, forks, Bluetooth, split, encoders, layer names); limits stay as table slots; board presets become offers with their conditions; the probing guard covers `caps.*` in screens. *Done when* no screen reads a raw firmware field to decide what it shows.
5. **The doors** (later). `describe(image)`; WebMCP behind a flag (still a Chrome origin trial that no mainstream assistant calls, so last); Flows once a first real Flow is chosen to decide their language (jq over the image's JSON, as GLIDE does, or TypeScript).

After step 3, Rynkbench is ahead of GLIDE on every row of the table but Flows; after step 5, on that one too.
