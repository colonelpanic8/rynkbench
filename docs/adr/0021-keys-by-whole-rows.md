# 0021. Keys are written by whole rows

**Status:** Accepted. Amends ADR 0012 (how keys are planned, written and counted). Full description: [../sync.md](../sync.md).

## Context

ADR 0012 planned keys as runs of neighbouring changed cells and wrote them in pages of four with the bulk command, on the reading that RMK stores one flash item per key. The firmware Rynkbench is built for (`colonelpanic8/rmk`) now stores the keymap as one flash item per row segment of up to 16 keys (`KEYMAP_SEGMENT_KEYS`, `rmk-types/src/constants.rs`). Any write that touches a segment stores the whole segment again (`set_actions`, `host/context.rs`), still without comparing it with what is stored. A run of three keys in one row and a single key in that row cost the same item; three keys in three rows cost three.

## Decision

- **The planner emits one `keys` step per changed row** (`src/sync/plan.ts`, `changedRows`): every cell of a row of one layer that holds at least one difference. A row with no difference is never written.
- **The writer writes it with `session.keymap.setRows`** (`src/sync/write.ts`). The session uses the bulk keymap write from the row's first cell when the firmware has it; without bulk transfer it sends the row's cells one at a time (`link-session.ts`, `writeRows`). `Busy` is still resent.
- **Counting is by row segment.** `storedItems` counts a `keys` step as its segments (`keymapSegments`, `src/session/flash-writes.ts`), every other step as one. The simulated boards count stored segments the same way (`storedSegmentsOf`, `src/session/mock/board.ts`), so tests measure what the firmware stores.
- The session's key-run write and its pages of four keys go. `io.writeKeys` stays: it is the `set_keys` operation, not a write.

## Consequences

- Moving a layer with three keys on one row stores two segments: the row it leaves and the row it arrives on (`io-layers.test.ts`).
- A Live edit of one key (`io.setKey`) still sends one cell; the firmware stores its segment.
- Firmware that still stores one item per key gets every cell of a changed row written, so a scattered change costs more there than before. No capability tells the two storage models apart; Rynkbench assumes row segments.
- The pinned firmware skips a segment equal to the stored one, so a resent row costs no flash there. Rynkbench still compares first: older firmware stores whatever it is sent, and an unsent row costs no round trip.
