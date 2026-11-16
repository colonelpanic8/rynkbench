# 0003. Entities are stored, the graph is derived, one policy engine decides

**Status:** Proposed. Started: the reference graph (`src/domain/`) exists and the usage report runs on it.

## Context
What refers to what is computed in several places (usage report, layer rewrites, board transfer), each with its own idea of identity. The reference to GLIDE (ZMK) showed the cost: the same knowledge copied seven times, until one edge table replaced it.

## Decision
- Entities live in normalized, immutable records with stable ids. Edges are derived from them by a declarative edge table, one row per place a reference can live.
- Integrity compares a change before and after and reports only the problems it introduced.
- One policy engine decides what to do about findings and features: a rule table (preserve, transform, warn, confirm, reject per moment) and `offer(feature, context)` over ordered layers, each answer carrying its reason (`why`, `trail`) and how far a change reaches (`device`, `build`, `file`).
- Screens ask and never decide. The device always wins: nothing is removed from the model because a board cannot use it.

## Consequences
- Usage, impact analysis, reachability, delete and move rewrites and dependency closure all read one table.
- Board, flag, OS and firmware checks disappear from components; a test fails if one reappears.

## Progress
- `src/domain/` holds the reference graph. The edge table (`sources.ts`) has one row per place a reference can live: keymap cells, combos, forks, and morse slot actions. `graph.ts` derives the edges; `queries.ts` answers `attributedEdges`, `activators`, `reachableLayers`, `referencedBy` and `dangling`. Only `sources.ts` may import the wire package; a boundary rule enforces it.
- The usage report (`src/ui/advanced/usage.ts`) now reads the graph instead of walking the keymap itself. 90 golden cases, produced by the previous hand-written implementation, pass unchanged, and deliberately breaking reachability, morse attribution or profile references makes many of them fail. Do not regenerate them to make a change pass. `analyzeUsage` takes the macro decoder as an optional parameter so the cases run without wasm.
- The Usage tab's key references are now links. The report carries each site with where it is (`activatorSites`, `refSites`: a key's layer, row and column, or a combo or fork slot), and clicking a key opens the keymap on that key. Combos and forks are listed as text for now; opening them needs Advanced-mode tab state that has no action yet. A key bound to a morse slot that turns on a layer links to the key, not the slot.
- Deleting a layer now says what still uses it before the keyboard is read (`src/ui/keymap/layerImpact.ts`): every key, combo or morse slot that turns the layer on or off, and every combo limited to it, listed in one line. The graph gained a `scopes` edge for a combo limited to a layer. Keys on the layer being deleted do not count, since they go with it. A property test over 300 random keymaps checks that the pre-check only blocks what the layer rewrite also refuses; it does not catch everything the rewrite refuses (an unused morse slot, lighting rules and so on still reach the rewrite's own error).
- The empty-slot predicates (`morseIsEmpty`, `forkIsEmpty`) and the `morse` and `combos` helpers moved to `src/model/` so the graph sits below the screens.
- One table now says which action variants carry a layer (`LAYER_VARIANTS` in `sources.ts`). The graph reads references from it, and the layer move and delete rewrite (`remapKeyAction` in `layers/management.ts`) rewrites through the same table (`mapKeyActionLayers`), so a new layer-carrying variant is added in one place. 268 golden cases of the previous hand-written rewrite, including every variant in every slot of a key binding and the refusal messages, pass unchanged, and removing a variant, dropping a modifier or reordering tap and hold each makes cases fail. The table is typed loosely (the variants are matched by name), so a variant added to the wire format still has to be added to the table by hand; the golden cases and the usage cases are what would catch a missing one.
- Not yet on the graph: the places the rewrite still handles itself (a combo's scope layer, tri-layer, pointing overrides, auto-mouse layers, lighting scenes and rule conditions, wake masks), the cross-board transfer, and the key-address logic. Adding each as a row of the edge table would also let the graph answer "what breaks if I delete this layer" for them. The integrity gate, policy table and health check build on the same graph.
