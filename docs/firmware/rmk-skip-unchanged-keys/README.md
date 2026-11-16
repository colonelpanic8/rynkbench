# RMK patch: do not store a key flash already holds

A firmware change for RMK (`colonelpanic8/rmk`, the source Rynkbench's protocol client is built from). It makes the keyboard leave a key, or an encoder action, alone when flash already holds that exact value, instead of storing it again. Rynkbench already never sends an unchanged key (ADR 0012, `docs/sync.md`); this protects the keyboard from every other host too.

| | |
|---|---|
| Files | `for-assembled-ce86673.patch`, `for-main-4bed409.patch` (the same change for each branch, one commit each, `git am`), `apply.sh` (uses the one that fits) |
| Changes | `rmk/src/storage/mod.rs` only: compare before storing a key or encoder action, and one test |
| Cost | One flash read per key write. Reads do not wear flash. |
| Status | Applies to both branches; all tests pass (below); clippy clean; not yet tried on a keyboard |

## Which version

`colonelpanic8/rmk` has two lines, and their storage code differs:

| Branch | Version | Use it for |
|---|---|---|
| `assembled`, at `ce86673` (the revision Rynkbench's `flake.lock` pins) | `for-assembled-ce86673.patch` | **The firmware Rynkbench talks to** and the MoErgo Glove80 and Go60 builds (`colonelpanic8/moergo-rmk`). Start here. |
| default branch, at `4bed409` | `for-main-4bed409.patch` | Offering the change upstream. |

`apply.sh` checks which one applies to your checkout.

## The problem

RMK keeps everything you change at runtime in **sequential-storage**: an append-only log of items spread over a few flash sectors (two by default, `storage.num_sectors`). Storing an item appends it; the older copy becomes dead. When a sector is full, its live items are moved and the sector is erased. That move-and-erase is:

- **slow:** seconds on a nearly full store, up to minutes on older builds. Rynkbench gives such writes two minutes (`FLASH_TIMEOUT_MS`), and the firmware answers `Busy` meanwhile;
- **wear:** each erase uses up one of the flash's limited erase cycles (typically about 10,000 on nRF52).

So every stored item brings the next slow pause and the next erase closer, including one that changes nothing.

Before this patch, RMK stored every key it was sent, unconditionally:

```rust
// rmk/src/storage/mod.rs, the storage task
FlashOperationMessage::KeymapKey { layer, row, col, action } => {
    self.store_data(StorageKey::keymap(layer, row, col), &StorageData::KeyAction(action)).await
}
```

Hosts send unchanged keys all the time: a whole-layer or whole-keymap write (an import, a layer move, Vial's bulk buffer write), a retry after a timeout, a configurator that writes "to be sure". The same file already does the right thing for lighting, comparing a scene shard with what is stored before storing it. Keys and encoder actions did not.

Other firmware does the same as this patch: QMK's `eeprom_update_byte` reads first and writes only when the value differs, and its wear-leveling layer skips writes that change nothing.

## The change

**On `assembled`** every write the host asks for reaches flash through one message, `FlashOperationMessage::Store(item)`. The storage task now hands it to `put_unless_stored`, which reads the stored value first for a key or an encoder action and leaves flash alone when it is the same; every other item is stored as before:

```rust
async fn put_unless_stored(&mut self, item: StorageItem) -> Result<(), SSError<F::Error>> {
    let (key, value) = item.split();
    #[cfg(feature = "host")]
    {
        // read only for keys and encoder actions; equal → Ok(()) without storing
    }
    self.flash.store_item(&mut self.buffer, &key, &value).await
}
```

**On the default branch** the storage task has a branch per kind of write; two small helpers take the place of the unconditional store:

```rust
/// Stores a key's action unless flash already holds that same action.
#[cfg(feature = "host")]
async fn store_key_action(&mut self, layer: u8, row: u8, col: u8, action: KeyAction)
    -> Result<(), SSError<F::Error>>
{
    let key = StorageKey::keymap(layer, row, col);
    match self.fetch_data(key).await {
        Some(StorageData::KeyAction(saved)) if saved == action => Ok(()),
        _ => self.store_data(key, &StorageData::KeyAction(action)).await,
    }
}
// store_encoder_action: the same for StorageKey::encoder / EncoderAction.
```

```rust
FlashOperationMessage::KeymapKey { layer, row, col, action } => self.store_key_action(layer, row, col, action).await,
FlashOperationMessage::Encoder { layer, idx, action } => self.store_encoder_action(layer, idx, action).await,
```

What stays the same:

- **The keyboard's behaviour.** The keymap in RAM is updated before the storage message is sent (`host/context.rs`, `set_action`), exactly as before. Only the flash write is skipped, and only when flash already holds the value.
- **The answer to the host.** The task still reports a finished flash operation, so `Busy` handling and timeouts are unchanged.
- **Reading at boot.** Nothing changes in what is stored or how it is read back.
- **When nothing is stored yet** (`fetch_data` returns `None`), or a different value is stored, the key is stored as before.

## The test

`storage::tests::unchanged_key_and_encoder_actions_are_not_stored_again` counts writes on the test flash (on `assembled` its in-memory flash already counts them; on the default branch the patch adds `FLASH_WRITES` to the test flash) and checks:

1. after initialization, storing the action a key already has writes nothing;
2. a different action is written and reads back;
3. sending that action again writes nothing;
4. the same for an encoder action.

With the comparison removed, the test fails, so it really guards the behaviour.

## Results

Stable Rust, `cargo-nextest` 0.9. Feature sets are the ones RMK's own CI uses (`.github/ci/_lib.sh`).

| Branch | Check | Result |
|---|---|---|
| `assembled` | **every RMK test**, `--features rynk,storage,lighting` | 876 passed |
| `assembled` | storage tests, `--features rynk,_ble,split,async_matrix,storage` | 22 passed |
| `assembled` | the new test with the comparison switched off | fails, as it should |
| `assembled` | `cargo clippy --features rynk,storage,lighting --tests` | no findings in `storage/mod.rs` |
| default | storage tests, `--features vial,storage` and `split,vial,storage,async_matrix,_ble` | 6 passed each |
| default | the new test with the comparison removed | fails, as it should |
| default | `cargo clippy`, `cargo build` | clean, builds |
| both | `apply.sh` on a clean checkout | applies the right version, its storage tests pass |

Not yet done: a run on a real keyboard (see below), and the rest of RMK's CI feature sets.

## Apply it

In a checkout of `colonelpanic8/rmk`:

```sh
./apply.sh /path/to/rmk          # checks the base, applies the commit, runs the storage tests
```

or by hand:

```sh
cd /path/to/rmk
git am /path/to/for-assembled-ce86673.patch          # or for-main-4bed409.patch on the default branch
cd rmk && cargo nextest run --no-default-features --features=rynk,storage,lighting storage   # default branch: vial,storage
```

RMK's tests need `cargo-nextest` (`cargo install cargo-nextest --locked`): embassy-time's mock driver is one per process.

## Try it on a keyboard

1. Build and flash firmware with the patch.
2. In Rynkbench, open the keyboard and write the same key twice from another tool, or import a layout that is already on the keyboard: the write returns at once and no `Busy` pauses appear.
3. Over many such writes, the storage page migrations (the long pauses) should come far less often than before.

## For upstream

The change is general and small enough to offer to RMK itself: it fixes wear for every host, not only Rynkbench. Combo, morse and fork slots go through the same storage path and could get the same comparison once their stored types can be compared for equality; the lighting tables already have it. On `assembled`, `put_unless_stored` is the one place to add them.
