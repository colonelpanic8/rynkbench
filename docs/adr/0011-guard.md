# 0011. Rynkbench Guard: one gate for every key write

**Status:** Accepted

## Context

GLIDE has GLIDE Guard: everything that protects a layout from being corrupted, behind one commit gate that every edit passes, with one label and three ways to speak (it asks, it stops, it fixes quietly). Rynkbench had pieces of this (verified layer rewrites, the reference graph, morse entries kept when they are shared) but no gate: an ordinary key edit, in Live or in the draft, was never judged. RMK stores every write at once, so in Live a broken change is on the keyboard before anyone notices. ADR 0003 already decided that integrity compares a change before and after and reports only what the change introduced; this builds it.

## Decision

- **The rules are domain logic**, on the reference graph: `src/domain/guard.ts` (`GUARD_RULES`, `judgeChange(before, after)`). Each rule has a tier: **stop** (the change is not made) or **ask** (made only after a yes). A finding names what is broken (a layer or slot) and the places that cause it. Only what the change itself breaks is reported; a layout that was already odd is never blamed on the next edit.
- **The first rules:** a key, combo or fork pointing at a layer, macro, morse slot, combo or fork that does not exist (stop); a layer with keys on it that could be reached and no longer can (ask). Tap-hold profiles are not judged yet.
- **One door:** Guard wraps the io (`src/ui/guard/guardIo.ts`, set up in `Workbench.tsx`), so every key write passes it in Live and in Draft. Several keys that form one change (a swap, a transform) go through `io.writeKeys` and are judged together, so a swap never asks halfway. Send checks the draft again for stops only (each change was judged when it was made); a draft kept from an older session cannot put a broken reference on the keyboard.
- **One voice:** the shield and "Rynkbench Guard" (`GuardLabel`) wherever Guard speaks. It asks with `askConfirm({ guard: true, details })`: a headline with counts, one calm line, Show details / Reject / Approve. It stops with a labelled note that starts "Nothing was changed: …". It speaks only when it acts. Words: `src/ui/guard/words.ts`. A refusal returns `{ ok: false, guarded: true }` so callers do not add an error of their own.

## Consequences

- A new rule is one entry in `GUARD_RULES` with its test; screens never decide integrity.
- Check my layout will show the same rules on demand. Combos, morse, macros and settings join Guard as they join the draft.
- Undo and redo restore an earlier state and are not judged; draft restore is covered by the check at Send.
