# 0001. Layers depend downward only

**Status:** Accepted. Enforced by `src/architecture/boundaries.test.ts`.

## Context
Rynkbench's screens import the protocol's wire types directly (49 production files under `src/ui` when the guard was introduced), and `src/config` and `src/session/mock` imported from `src/ui`. Logic that should run without a screen could not, and a second protocol or board family would touch most of the UI.

## Decision
From the bottom: protocol clients and transports, capabilities, adapters, domain model and policy, application services, UI. A layer imports only from layers below it. Today's folders map onto this as they are migrated; the rules in `src/architecture/boundaries.ts` are the executable form.

Existing violations are listed in `boundaries.baseline.json` and may only shrink. A new violation fails the test. A fixed violation also fails it until it is removed from the baseline (`UPDATE_ARCH_BASELINE=1 npx vitest run src/architecture`), so progress cannot be undone silently.

## Consequences
- Rules are added to `boundaries.ts` as layers appear (capabilities, domain, policy), each with its reason.
- Fixing a violation means moving code to the right layer, not editing the baseline by hand.
- The baseline is the measure of how far the migration has come.

## Progress
- `core-never-imports-ui` is at zero. The shared helpers (`pointing`, `macros`, `deep-equal`, key-edit `history`) and the workbench state types (`model/workbench-state.ts`) moved below the UI; `ui/state.tsx` re-exports the types so screens did not change.
- `ui-never-imports-wire-types` is the remaining baseline (48 entries). It is closed by the domain-types phase.
- `model/workbench-state.ts` is an interim home: it mixes domain state with application state and will be split later.
