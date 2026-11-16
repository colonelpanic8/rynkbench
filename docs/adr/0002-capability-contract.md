# 0002. Every keyboard function is a declared capability

**Status:** Proposed. Started: typed session errors (`src/session/errors.ts`) and the first capabilities (`src/capabilities/`).

## Context
Support for a feature is discovered by catching a rejected request and reading its message. That is fragile, invisible to the type system, and makes the UI learn about absence only after a failure.

## Decision
A capability is a declared unit of keyboard functionality with an id, availability resolved once at connect, its limits, and its contract: durable or volatile, write granularity (none, cell, table), atomic or not, whether order matters, whether it is destructive. Read and write are separate. The UI asks `useCapability(id)` and receives the capability or `undefined`.

Failures are typed values (`SessionError` with a code), not message text. Only `classifyError` reads the firmware's wording, at the boundary. New codes and capabilities are added with their first real user.

## Consequences
- No feature detection by catching in UI code.
- Backends (device, offline file, mock) implement the same contracts, checked by shared contract tests.
- The compatibility matrix (protocol version by capability) becomes generated data.

## Progress
- `src/capabilities/` resolves seven capabilities from the connect-time reads: `lighting.state`, `lighting.scenes`, `lighting.rules`, `lighting.compiled`, `lighting.extension`, `lighting.output`, `pointing`. The two tables (`lighting.scenes`, `lighting.rules`) are typed so their slot count is always a number. Each says its slots, its reach (`device` or `build`) and whether it is read-only.
- `ioFeaturesFor` now reads the capability set; a test proves the result is identical to the previous gating for every combination of the optional surfaces. `useCapability(id)` and `useCapabilities()` are in `src/ui/use-capabilities.ts` for screens.
- Contract fields beyond those (durability, atomic replace, order that carries meaning, destructive) are added with the first code that needs them. `offer()` is deferred until a layer beyond the firmware (a board spec or the environment) has a real user, because with one layer it would only repeat the capability lookup.
- Screens migrated: every screen that asked whether a lighting or pointing surface exists now asks the capability set: the workbench tabs, `KeymapCenter`, `LayerTabs`, `LightingMode`, `LayerLighting`, `LayerPresets`, `ConditionalRulesPanel`, `StatusPresetsPanel`, `LightingKeyPresetPanel`, `StockMagicLayerPanel` and `LiveMode`. Screens that need a table's size read the capability's `slots`.
- One assumption to keep: capabilities come from the connect-time snapshot, while four screens used to test the live state (`state.pointingConfig`, `state.lightingExtension`, `state.lightingOutputMode`, `state.lightingState`). The reducer never turns one of these from present to absent except by mirroring the snapshot, so the answers match; if a reducer path ever clears one on purpose, that surface needs its own live capability.
- Guard: `src/architecture/probing.ts` finds screens that read a capability-backed connect-time field through `bundle.` or null-test one, with a ratchet (`probing.baseline.json`). Its baseline is now empty, so any new probe fails the test.
- Still to do: the contract tests shared by the mock and real backends, and `offer()` once a layer beyond the firmware has a real user.
