# Architecture review (November 2026)

Before more UI work: is the architecture ready for WebMCP, other keyboards, stock RMK without RGB, growth and Flows, and is it at least as good as GLIDE's? Measured on `redesign` at `3226d67`, against `moosylog/glide-src` at `f329879`.

**Verdict.** The foundations are better than GLIDE's in several places: types everywhere, layer boundaries enforced by tests, one write path that reads back what it wrote, firmware capabilities as the source of truth, and an ADR for every decision that shapes the code. But the domain logic has not followed: most of it lives in `ui/`, there is no layer of named operations, and only lighting is a capability. Those three gaps block WebMCP and Flows, and a critical engineering manager would see them first. They are fixable without a rewrite, in four steps (below).

## The numbers

| | Rynkbench | GLIDE |
|---|---|---|
| Core (no screens) | 5,000 lines in `model/ domain/ sync/ capabilities/ session/ config/ layers/ firmware/`, plus 7,000 lines of pure logic that lives in `ui/` | 13,500 lines in `core/` |
| Screens | 26,000 lines in `ui/` (of which 7,000 are the pure logic above) | 14,000 lines in `ui/` |
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
- **Logic in the wrong layer.** About 7,000 lines of pure logic sit under `ui/`: transforms, usage, status presets, the stock Magic layer, firmware rules, key manipulation, key lights, the draft history. The boundaries guard forbids core layers to import `ui/`, so none of it can be reused by an operations layer as it stands.
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
- **Bulk changes bypass the one write path.** `CLAUDE.md` says a bulk change becomes a wanted image and goes through `syncTo`; transforms still write key by key through `io` (`ui/advanced/TransformsTab.tsx`). So do the rule panels and some presets (todo items 5 and 6).

### 5. Ready for Flows: the substrate is, the path is not

The substrate is better than GLIDE's: `KeyboardImage` (`sync/image.ts`) is the whole keyboard as one value (keys, encoders, combos, morse, forks, macros, behaviour options, lighting scenes, rules, wake layers, pointing), and `syncTo` writes only the difference and checks it after writing. A Flow is a function from one image to another.

What is missing is the path a Flow's result takes:

- **operations** to write Flows with (point 1);
- **one judgement for any result.** GLIDE's `judgeFlowResult` judges a whole new layout; Rynkbench Guard (`domain/guard.ts`) judges key writes;
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

## The plan: four steps before more UI

Each step is one session or two, keeps every test green, and is shippable on its own. The decisions go in ADR 0017.

1. **A core for the workbench.** Move the reducer, `makeIo` and the pure logic in `ui/` into core layers (`workbench/` for state and `io`; `model/` or `domain/` for rules such as transforms, usage, key lights, status lights, presets, the draft history). `ui/state.tsx` keeps only the React context. The boundaries guard then keeps it that way. *Moves, no behaviour change.*
2. **Every feature a capability, and one `offer()`.** Capability ids for combos, macros, morse, forks, Bluetooth, split, encoders and layer names, resolved from the firmware facts; board presets as capabilities with conditions; the probing guard extended to every `caps.*` read in screens. A simulated board without RGB or Bluetooth, and a test that opens every screen on it.
3. **Operations.** `operations/`: named operations, image in, image out (`set_keys`, `swap_keys`, `move_layer`, `apply_transform`, `set_key_light` …), each result judged by one Guard for whole images, and one apply path (draft, then `syncTo`; one undo step). Transforms and presets move onto it, which closes todo items 5 and 6. Draft Send, Discard and Undo become functions with the hooks as thin wrappers.
4. **The doors.** `describe(image)` (the keyboard as text), then WebMCP and Flows on top of operations, behind flags, as GLIDE plans them. Plus `docs/ARCHITECTURE.md`: one page on how a change flows, for the next engineer.

After step 3 Rynkbench is ahead of GLIDE on every row of the table but Flows; after step 4, on that one too.
