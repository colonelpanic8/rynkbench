# Writing to the keyboard

How Rynkbench gets your changes onto an RMK keyboard: one write path for a draft, an operation, a layer move, an import, Undo and the bulk changes GLIDE Flows will bring, and the Live writes that do not use it yet. The decisions are ADR 0012, 0018, 0021, 0022 and 0023; this page is the full description. Code: `src/sync/`, `src/workbench/draft/`, `src/workbench/apply.ts`.

## Why it works this way

What is efficient is decided by the firmware. Read in RMK (`colonelpanic8/rmk`):

| Fact | Where | Consequence |
|---|---|---|
| The keymap is stored as one flash item per row segment of up to 16 keys. A write that touches a segment stores the whole segment, **without comparing it to what is stored**. | `rmk-types` `KEYMAP_SEGMENT_KEYS`, `host/context.rs` `set_actions` | Write a changed row whole, as one write; never write an unchanged row. |
| Lighting scene shards are compared before they are stored. | `storage/mod.rs` | Lighting may be sent as whole tables. |
| Storage is sequential-storage over a few flash sectors. A full sector is migrated and erased. | `storage/mod.rs` | Each stored item brings the next slow pause and the next erase closer. |
| The firmware takes a write only when its flash queue can hold all of it, else it answers `Busy`; nothing was applied. | `host/context.rs` `persist_bounded`, `session/flash-writes.ts` | Resend on `Busy`. |
| Keymap writes have no transaction. | | A dropped link can leave a change half-done; it must be resumable. |
| A key is only applied once it is written; there is no "try it in RAM". | | Live must write keys at once to let you try them. |

Other firmware: QMK compares before every EEPROM write (`eeprom_update_*`) and its wear-leveling layer skips unchanged writes; ZMK delays settings writes (60 s by default) and ZMK Studio holds keymap changes in RAM until Save. Rynkbench does the comparing and the gathering on the browser side. Skipping an unchanged segment in the firmware itself is still wanted.

Firmware that stores one item per key still works: it gets every cell of a changed row written. No capability tells the two storage models apart.

## The model

```
 edits (key editor, drag, operation, layer move, import, Undo)
        │ change only what you want
        ▼
 ┌──────────────┐   fresh read   ┌───────────────┐
 │ what you want │──────────────▶│ what it holds │◀── readImage (reads cost no flash)
 └──────┬───────┘                └──────┬────────┘
        │      three-way check (based on, now, want): ask, or hold back, before overwriting
        │      Guard judged the commit already; Send checks again
        ▼                               │
     planSync(now, want)  ──▶  only the items that differ, in a safe order; keys by whole row
        │
     writePlan  ──▶  session (setRows, Busy resent), stops at the first failure
        │
     readImage + planSync(readback, want) must be empty   ──▶  base = read-back
        └── on failure: read again; plan from it = what is left (resume)
```

- **Image** (`sync/image.ts`): one record per kind of stored item: keys per layer, encoders, combo, morse and fork slots, the macro region, layer names, default layer, behavior options and timing, tap-hold profiles, hold-trigger positions, auto-mouse layers, pointing, wake layers, layer lighting, rules, the layer policy, the lighting controls and effect parameters. A part missing on either side is not compared.
- **Items** (`sync/items.ts`): the draft names items one by one, a key per cell. The planner groups them for writing.
- **Planner** (`sync/plan.ts`, pure): `planSync(now, want, cols)` lists only what differs. Keys come as one `keys` step per changed row of a layer, holding every cell of that row. `storedItems` counts the flash items a plan stores: a row its segments, every other step one.
- **Writer** (`sync/write.ts`): `writePlan` sends the steps (a row with `session.keymap.setRows`); `syncTo` plans, writes, reads back once and checks that nothing planned is left. It keeps no record of progress: planning again against a fresh read gives what is left, after a failure, a dropped link or a closed tab.
- **Three-way check** (`sync/conflicts.ts`): `conflicts(basedOn, now, want)` lists the items you changed that were also changed on the keyboard since, to something else.

### Base and what a draft was based on

- `state.base` is the last value read from the keyboard for every item: a full read, a send's read-back, a refresh, a topic, or the answer to a Live write. What you want is not stored as one value: `wantOf(state)` assembles it from the fields the screens read (`layers`, the slot tables, the layer lighting drafts, the rule and pointing drafts, the settings), and `withWant` writes one back (`workbench/draft/want.ts`). The draft is `patchBetween(base, wantOf(state))`.
- `state.basedOn` keeps, only for drafted items the keyboard has changed since, the value the draft was based on. Send's check reads it (`draftWithBasis`); the kept draft stores it. An item a send wrote is based on its read-back (`draftStored` with `wrote`).
- A Live write moves into `base` only the items it wrote. Discard sets what you want to `base`.

### Write order

Writing can stop part-way, so the order keeps the keyboard usable at every point:

1. **Create:** combo, morse and fork slots that get a value, tap-hold profiles that get one, a macro region that grows, layer slots that become used (names). Keys may point at these.
2. **Change:** key rows, encoders, default layer, behavior options, auto-mouse layers, pointing, wake layers, layer lighting, rules, behavior timing, hold-trigger positions, the layer policy, the lighting controls, effect parameters.
3. **Remove:** slots and profiles that are emptied, a macro region that shrinks, layer slots no longer used. Nothing points at them any more.

The macro region is one stored item, so a region that both shrinks and changes goes last, after keys that may already run the new macros. Guard judges the end result (ADR 0011). Intermediate states are not judged: a dropped link is handled by resuming, not by making each step safe on its own.

## When the writer runs

**Through the one write path** (fresh read, three-way check, `syncTo`, read-back becomes `base`):

- **Send** (`workbench/draft/send.ts`, `io.applyBatch`): the whole draft. A drafted item changed on the keyboard is shown in Guard's window ("Send overwrites N changes made on the keyboard") with **Send anyway** and **Don't send**. What does not reach the keyboard stays in the draft; the rest leaves it.
- **A commit in Live** (`commitImage`, `workbench/apply.ts`): an operation (`io.apply`, `io.writeKeys`), a layer move, delete or duplicate (after a fresh read), an import (ADR 0023). In Draft a commit only changes what you want. In Live it is sent at once; its own items are written without asking, and a clashing drafted item it did not set is held back. All or nothing: if the send stops, the change is put back and sent again, unless the keyboard cannot be read, in which case it stays in the draft.
- **Undo and Redo in Live** (`io.travel`): the step is applied to what you want and sent the same way, its items without asking. A failed send is not put back; what did not arrive stays in the draft.
- **Live's own send** (`ui/draft/DraftKeeper.tsx`): what waits in the draft in Live (Paint strokes, rules, pointing, anything held back) goes 0.6 s after the last change, and at once when the page is hidden. It asks nothing and overwrites nothing the keyboard changed. After a send leaves changes behind it stops until the next edit or an explicit Send (ADR 0022).

**Direct Live writes** (in Draft each of these changes what you want instead; `workbench/io-*.ts`):

| Write | Session call |
|---|---|
| One key (`io.setKey`; the key editor, paste, Transparent and Clear) | `keymap.setKey`; Guard first, nothing sent when unchanged |
| An encoder | `keymap.setEncoder` |
| A combo, morse or fork slot (`io.setSlot`) | `combos.set`, `morse.set`, `forks.set` |
| Behavior timing, hold-trigger positions | `behavior.set`, `behavior.setHoldTriggerPositions` |
| Default layer, a layer's name | `keymap.setDefaultLayer`, `keymap.setLayerMetadata` (read back) |
| Lights on or off, brightness, background | `lighting.setState` |
| Layer policy, wake layers | `lighting.scenes.setLayerPolicy`, `lighting.setWakeLayers` |
| Effect, overlay slot, effect parameters | `lighting.setExtensionState`, `setExtensionLayers`, `setExtensionParam` |

**Whole tables, in either mode** (todo 10, 11): `io.applyScenes` (`lighting.scenes.replaceScenes`) and `io.applyConditionalScenes` (`lighting.conditionalScenes.replace`, then read back). They are used by the condition-rules panel's **Apply rules**, the lighting key presets (key editor → Every action → its lighting tab) and the stock Magic layer; the last two write their keys one by one with `io.setKey` first and are offered only in Live. The Glove80 status cluster writes its keys with `io.setKey` and puts its rules in the draft.

**Not stored:** try-out lights replace the keyboard's overlay (`workbench/io-try-out.ts`); they are not part of the draft or Undo. The Device screen calls the session itself to forget Bluetooth pairings, switch transports automatically and set split latency.

| Mode | Through the write path | Direct writes |
|---|---|---|
| **Draft** | On Send | none; they change what you want |
| **Live** | At once (commits), or 0.6 s after the last change (what waits) | At once |
| **Not connected** | Kept in the draft | Kept in the draft |

- **Not connected:** when a dropped link cannot be restored, the workbench stays open in Draft (`ui/draft/link.ts`). The chip says "not connected", how many changes are kept, and offers Reconnect. The draft is kept for this keyboard; after reconnecting it is offered back with what each change was based on, so Send's three-way check sees anything changed meanwhile.

## For GLIDE Flows

A Flow produces a new wanted layout. It goes through the same steps as an operation: Guard judges it, you review it (`storedItems` and `differences` give the counts and the list), and `syncTo` writes only the difference. A Flow that changes 30 keys in 4 rows stores 4 row segments (on a board up to 16 keys wide). Nothing new is needed in the write path.

## What it costs, measured

On the simulated Glove80 (`session/mock/board.ts` counts stored row segments as RMK does, `storedSegmentsOf`):

| Change | Stored |
|---|---|
| Send drafted keys | one segment per row holding a drafted key, plus one read before and one after |
| A key drafted and set back | nothing (dropped from the draft) |
| Set a key to what it already is (Live) | nothing sent |
| Move a layer with three keys on one row | 2 segments: the row they leave and the row they arrive on |
| Import the layout the keyboard already holds | nothing |
| Send after a dropped link | only what did not arrive |

Reads cost no flash, but take time over Bluetooth: every send through the write path reads the whole keyboard before and after.

## Code map

| File | Job |
|---|---|
| `src/sync/image.ts` | `KeyboardImage`: what a keyboard stores |
| `src/sync/plan.ts` | `planSync`, `storedItems` |
| `src/sync/items.ts` | Stored items named one by one: `differences`, `valueAt`, `withValues` |
| `src/sync/patch.ts` | Patches (items before and after): apply, invert, join, `rebase` |
| `src/sync/conflicts.ts` | `conflicts` (the three-way check) |
| `src/sync/read.ts` | `readImage` |
| `src/sync/write.ts` | `writePlan`, `syncTo`, `SyncStopped` |
| `src/session/flash-writes.ts` | `retryBusy`, `KEYMAP_SEGMENT_KEYS`, `keymapSegments` |
| `src/workbench/draft/want.ts` | What you want beside its base: `wantOf`, `withWant`, `withBase`, `draftWithBasis` |
| `src/workbench/draft/send.ts` | Send, `UNATTENDED` |
| `src/workbench/apply.ts` | `commitImage`, `applyOperation` |
| `src/workbench/draft/selectors.ts` | `liveSendDue`, `sendWaits` |
| `src/ui/draft/DraftKeeper.tsx` | The kept draft and Live's own send |
| `src/ui/draft/link.ts` | Whether the keyboard can be reached |
| `src/ui/guard/guardIo.ts` | Guard at the io; unchanged keys are not sent |

`src/sync/` uses the model and the session interface, never a transport or a screen (`boundaries.ts`: `core-never-imports-ui`, `sync-uses-the-session-interface`).

## Tests

- `src/sync/plan.test.ts`: only differences, whole rows and their segments, write order, missing parts, the three-way check.
- `src/sync/items.test.ts`: items named as the planner writes them, patches, `rebase`, lighting clashing per layer.
- `src/sync/write.test.ts` (simulated Glove80): stores only the changed rows, nothing when nothing differs, resumes after a failure without storing anything twice.
- `src/workbench/draft/send.test.ts`: Send stores only the drafted rows, asks before overwriting and keeps the draft on no, keeps the unsent part, keeps what a draft was based on across reads, and Live's own send holds back a clash and waits after a failure.
- `src/workbench/io-layers.test.ts`: a layer move stores only the rows that change; a failed layer write is put back.
- `src/workbench/io-import.test.ts`: an import in Draft and Live, one Undo step, judged once.
- `src/ui/guard/guardIo.test.ts`: an unchanged key is not sent.

## Not done yet

- **The direct Live writes** above still bypass the write path: no fresh read, no three-way check.
- **The whole-table writes** (todo 10, 11): the condition-rules panel's Apply, the lighting key presets and the stock Magic layer.
- **A macro region that shrinks and changes** is written after the keys (see Write order).
- **Read only what is needed:** every send reads the whole keyboard before and after. Reading only the parts in the plan would make it faster over Bluetooth.
- **Starting without the keyboard:** today you keep working when the link is lost. Opening a keyboard you have used before, without connecting it, needs its last read kept per keyboard and a session built from it.
- **Live keys after a short pause:** keys go at once in Live because RMK only applies a key once it is written. Gathering repeated edits of one key would save a little flash at the cost of trying it slightly later.
- **In the firmware:** skip storing a row segment equal to the stored one, and later a keymap transaction so a large change is all-or-nothing on the keyboard itself.
