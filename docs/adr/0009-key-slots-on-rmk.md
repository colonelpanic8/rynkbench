# 0009. GLIDE's key slots on RMK bindings

**Status:** Accepted

## Context

GLIDE's key editor shows a key as slots: On Tap, On Hold, On Double Tap (and With Shift). RMK has no single binding with all of them: a tap with a hold is a `TapHold`; a double tap exists only as a morse (tap-dance) entry, which lives in a shared table and can be bound by several keys.

## Decision

- `src/model/key-slots.ts` reads a binding as slots and plans the writes for new slot values. The screen only shows the slots and carries out the plan.
- On Tap and On Hold stay plain RMK bindings (`Single`, `Tap`, `TapHold`). On Double Tap makes the key a morse entry of the patterns tap, hold and tap-tap; a key bound to such an entry shows as slots, any other morse entry stays "edit under Behaviors → Morse".
- A key with a double tap owns its entry: an entry another key shares is copied first, so editing one key never changes another. The entry is written before the key points at it.
- A key that loses its double tap leaves its entry as it was, so undoing the key edit brings the double tap back. An entry no key uses counts as free; empty ones are taken first.
- The editor offers On Double Tap only with the capability `keys.doubleTap` (a morse table, and three patterns per entry).

## Consequences

- An unused entry keeps its old patterns until another key needs it; the Morse table shows it.
- With Shift (an RMK fork, which matches every key with the same tap) is not a slot yet.
