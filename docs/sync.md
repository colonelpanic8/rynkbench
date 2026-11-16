# Writing to the keyboard

How Rynkbench gets your changes onto an RMK keyboard: one write path for a single key, a draft, a layer move, and the bulk changes GLIDE Flows will bring. The decision is ADR 0012; this page is the full description. Code: `src/sync/`.

## Why it works this way

What is efficient is decided by the firmware. Read in RMK (`colonelpanic8/rmk`):

| Fact | Where | Consequence |
|---|---|---|
| A key written over Rynk is applied at once and appended to flash, **without comparing it to what is stored**. | `host/context.rs` `set_action`, `storage/mod.rs` `KeymapKey` | Never send a key the keyboard already holds. |
| Lighting tables are compared before they are stored. | `storage/mod.rs` `LightingSceneShard` | Lighting may be sent as whole tables. |
| Storage is sequential-storage over two flash sectors by default. A full sector is migrated and erased. | `rmk-config` `num_sectors`, `storage/mod.rs` | Each stored item brings the next slow pause and the next erase closer. |
| The bulk keymap write stores one item per key. | `handlers/keymap.rs` `SetKeymapBulk` | Bulk saves round trips, not flash. |
| The firmware takes a write page only when its flash queue holds it whole, else it answers `Busy`. | `session/flash-writes.ts` | Pages of 4 keys, resent on `Busy`. |
| Keymap writes have no transaction. | | A dropped link can leave a change half-done; it must be resumable. |
| A key is only applied once it is written; there is no "try it in RAM". | | Live must write keys at once to let you try them. |

Other firmware: QMK compares before every EEPROM write (`eeprom_update_*`) and its wear-leveling layer skips unchanged writes; ZMK delays settings writes (60 s by default) and ZMK Studio holds keymap changes in RAM until Save. Rynkbench does the comparing and the gathering on the browser side, and `docs/firmware/` proposes the comparing for RMK too.

## The model

```
 edits (key editor, drag, transform, layer move, Flow)
        │ change only the layout you want
        ▼
 ┌──────────────┐   fresh read   ┌──────────────┐
 │ what you want │──────────────▶│ what it holds │◀── readImage (reads cost no flash)
 └──────┬───────┘                └──────┬───────┘
        │      three-way check (base, now, want): ask before overwriting
        │      Guard: stop or ask when the result is broken
        ▼                               │
     planSync(now, want)  ──▶  only the items that differ, in a safe order
        │
     writePlan  ──▶  session (bulk key runs, Busy resent), stops at the first failure
        │
     readImage + planSync(readback, want) must be empty   ──▶  done
        └── on failure: plan again from a fresh read = what is left (resume)
```

- **Image** (`sync/image.ts`): one record per kind of stored item: keys per layer, encoders, combo, morse and fork slots, the macro region, layer names, default layer, behavior options, auto-mouse layers, pointing, wake layers, layer lighting, lock and battery rules. A part missing on either side is not compared.
- **Planner** (`sync/plan.ts`, pure): `planSync(now, want)` lists only the items that differ. Neighbouring changed keys become one run.
- **Writer** (`sync/write.ts`): `writePlan` sends the steps; `syncTo` plans, writes, reads back once and checks that nothing planned is left. It keeps no record of progress: planning again against a fresh read gives what is left, after a failure, a dropped link or a closed tab.
- **Three-way check** (`sync/conflicts.ts`): `conflicts(base, now, want)` lists the items you changed that were also changed on the keyboard since, to something else.

### Write order

Writing can stop part-way, so the order keeps the keyboard usable at every point:

1. **Create:** combo, morse and fork slots that get a value, a macro region that grows, layer slots that become used (names). Keys may point at these.
2. **Change:** keys (in runs), encoders, default layer, behavior options, auto-mouse layers, pointing, wake layers, layer lighting, lock and battery rules.
3. **Remove:** slots that are emptied, a macro region that shrinks, layer slots no longer used. Nothing points at them any more.

Guard judges the end result (ADR 0011). Every intermediate state is not judged: a dropped link is handled by resuming, not by making each step safe on its own.

## When the writer runs

| Mode | Keys | Combos, morse, forks | Lighting, lock and battery lights | Macros, layer names, settings |
|---|---|---|---|---|
| **Live** | At once (so you can try them), one item per edit; an unchanged key is not sent. | At once | 0.6 s after the last change, and at once when the page is hidden or closed | At once |
| **Draft** | On Send | On Send | On Send | At once (not in the draft yet) |
| **Not connected** | Kept in the draft | Kept in the draft | Kept in the draft | Not possible |

- **Send** (`workbench/draft/send.ts`): reads the keyboard fresh, builds what you want (the read with the draft's patch on top), runs the three-way check and Guard, then `syncTo`. The read-back becomes `base` (ADR 0018): whatever reached the keyboard no longer differs and leaves the draft; the rest stays and is sent next time.
- **The three-way check at Send** compares each drafted item with what it was based on (`before`, kept with the draft, also across visits) and with what the keyboard holds now. Anything changed on both sides is shown in Guard's window ("Send overwrites N changes made on the keyboard", Show details) with **Send anyway** and **Don't send**.
- **Layer move, delete and duplicate** (`workbench/io-layers.ts`) plan the rewritten layout against the read and write only the difference; the way back on failure is planned the same way. Moving a layer with three keys on it stores six keys, not the whole keymap.
- **Not connected:** when a dropped link cannot be restored, the workbench stays open in Draft (`ui/draft/link.ts`). The status chip says "not connected", how many changes are kept, and offers Reconnect. The draft is kept for this keyboard; after reconnecting it is offered back with what each change was based on, so Send's three-way check sees anything changed meanwhile.

## For GLIDE Flows

A Flow produces a new wanted layout. It goes through the same steps as a draft: Guard judges it, you review it (`storedItems` and `differences` give the counts and the list), and `syncTo` writes only the difference. A Flow that changes 30 keys stores 30 keys. Nothing new is needed in the write path.

## What it costs, measured

On the simulated Glove80 (`session/mock/board.ts` counts stored keys like RMK does):

| Change | Before | Now |
|---|---|---|
| Send three drafted keys | 3 requests, 3 keys | 1–3 requests (bulk runs), 3 keys, plus one read before and one after |
| A key drafted and set back | 0 (dropped from the draft) | 0 |
| Set a key to what it already is (Live) | 1 key stored | nothing sent |
| Move a layer with three keys | every key of every layer, all slot tables, and the same again to roll back on failure | 6 keys |
| Send after a dropped link | the whole draft again | only what did not arrive |

Reads cost no flash, but take time over Bluetooth: Send reads the keyboard once before and once after.

## Code map

| File | Job |
|---|---|
| `src/sync/image.ts` | `KeyboardImage`: what a keyboard stores |
| `src/sync/plan.ts` | `planSync`, `storedItems`, `plannedKeys` |
| `src/sync/items.ts` | Stored items named one by one: `differences`, `valueAt`, `withValues` |
| `src/sync/patch.ts` | Patches (items before and after): apply, invert, join, `rebase` |
| `src/sync/conflicts.ts` | `conflicts` (the three-way check) |
| `src/sync/read.ts` | `readImage` |
| `src/sync/write.ts` | `writePlan`, `syncTo`, `SyncStopped` |
| `src/session/flash-writes.ts` | Busy resend, page size, `writeKeyRun` (bulk where supported) |
| `src/workbench/draft/want.ts` | The draft as a wanted image beside its base (ADR 0018) |
| `src/workbench/draft/send.ts` | Send |
| `src/ui/draft/link.ts` | Whether the keyboard can be reached |
| `src/ui/guard/guardIo.ts` | Guard at the io; unchanged keys are not sent |

`src/sync/` is its own layer: it uses the model, the domain and the session interface, never a backend or a screen (`boundaries.ts`: `core-never-imports-ui`, `sync-uses-the-session-interface`).

## Tests

- `src/sync/plan.test.ts`: only differences, runs, write order, missing parts, the three-way check.
- `src/sync/items.test.ts`: items named as the planner writes them, patches, `rebase`, lighting clashing per layer.
- `src/sync/write.test.ts` (simulated Glove80): stores exactly the changed keys, nothing when nothing differs, resumes after a failure without storing anything twice.
- `src/workbench/draft/send.test.ts`: Send stores only drafted keys, asks before overwriting a keyboard-side change and keeps the draft on no, keeps only the unsent part after a dropped link, sends drafted morse entries.
- `src/ui/layer-io.test.ts`: a layer move stores only the keys that move; a failed layer write is put back.
- `src/ui/guard/guardIo.test.ts`: an unchanged key is not sent.

## Found on the way

The original layer move, delete and duplicate compared their read-back with the rewrite including its `order` field, which a read never has, so every one of them reported a mismatch and rolled itself back. The first test that ran a layer move to the end found it; the comparison now leaves `order` out.

## Not done yet

- **Macros, layer names, behavior and morse-profile settings** still write at once, even in Draft. They are already items the planner knows (macros, layer names, behavior options); they join what you want (ADR 0018, part 2).
- **Starting without the keyboard:** today you keep working when the link is lost. Opening a keyboard you have used before, without connecting it, needs its last read kept per keyboard and a session built from it.
- **Live keys after a short pause:** keys go at once in Live because RMK only applies a key once it is written. Gathering repeated edits of one key would save a little more flash at the cost of trying it slightly later.
- **Read only what is needed:** Send reads the whole keyboard before and after. Reading only the parts in the plan would make Send faster over Bluetooth.
- **In the firmware:** skip storing unchanged keys (`docs/firmware/rmk-skip-unchanged-keys/`, ready to apply), and later a keymap transaction so a large change is all-or-nothing on the keyboard itself.
