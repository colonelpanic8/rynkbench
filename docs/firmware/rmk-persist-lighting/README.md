# RMK patch: keep the lights as they were left

A firmware change in two parts: RMK (`colonelpanic8/rmk`) stores the lights' brightness, background and the effects' brightness, and the MoErgo board firmware (`colonelpanic8/moergo-rmk`) starts with them. Without it, a keyboard forgets these settings every time it restarts.

| | |
|---|---|
| Files | `rmk-for-assembled-ce86673.patch` (RMK, one commit), `moergo-rmk-for-d5a44ba.patch` (the Glove80 and Go60 firmware, one commit), `apply.sh` |
| Changes | RMK: `storage/mod.rs` (two records), `host/rynk/lighting.rs` (store on change), `lighting/standard/engine.rs` (start at a brightness), two tests. moergo-rmk: `crates/moergo-rmk/src/lighting.rs` (read them at boot) |
| Cost | Two small records (7 bytes and 1 byte). Stored only when they change, like every lighting record. |
| Status | RMK: all 877 tests pass, including two new ones; the new one fails without the change; clippy clean. moergo-rmk: written against the pinned revision but **not compiled here** (it only builds for the nRF52 target); not yet tried on a keyboard |

## Why this matters

You set the lights the way you like them: dimmer at night, a calm background, effects at half brightness. You unplug the keyboard, or it sleeps and the battery runs out, and it comes back:

- **at full brightness.** RMK never stored the output brightness; the engine starts at 255 on every boot.
- **with the compiled background,** whatever you chose.
- **with the lights on,** if you had switched them off from Rynkbench. Rynkbench's Lights switch goes through `SetState`, which changed the output mode in RAM but never stored it. (The firmware's own output-mode command and the lighting keys did store it.)
- **with effects at full brightness, sometimes.** Turning effects off (RGB toggle, or Rynkbench's Effects switch) sets their value to 0, and that 0 is what is stored. Restart while they are off, and the brightness they had is gone: turning them on brings back the compiled default. Restart while they are on, and it is fine. That is the "not always".

What is at stake:

- **Trust.** A setting that silently changes back looks like a bug in whatever tool you used to set it, so people blame Rynkbench (or Vial, or the keyboard) and set it again and again.
- **Comfort and battery.** Brightness is the one lighting setting people change for a reason: eyes in a dark room, or battery life on a wireless board. Full brightness after every restart is the worst default for both.
- **Consistency.** Everything else the keyboard lets you change is kept: the keymap, the effect, its palette and settings, the key lights, the rules, the wake layers. Brightness and background were the exceptions.

## What changes

**RMK stores two new records** (`rmk/src/storage/mod.rs`), next to the lighting records it already keeps:

```rust
/// The lights as a whole, as a host or a lighting key last left them.
pub struct LightingOutputStateRecord {
    pub output_brightness: u8,
    pub background_enabled: bool,
    pub background_breathe: bool,
    pub hue: u8, pub saturation: u8, pub value: u8, pub speed: u8,
}
// and LightingEffectsOnValue(u8): the effects' last brightness above 0
```

Each is stored only when it differs from what flash holds (the same compare-then-store every lighting record uses), and read at boot by `read_lighting_output_state()` and `read_lighting_effects_on_value()`. They are new keys at the end of the key and value lists, so no existing record changes; RMK's schema hash already reinitialises storage on a firmware update.

**They are stored when they change** (`rmk/src/host/rynk/lighting.rs`):

- after `SetState` (what Rynkbench's Lights, Brightness and Background controls send): the output mode, brightness and background;
- after lighting keys settle (`BacklightUp`, `RgbHui`, `RgbTog` and the rest): the same three, next to the effects record it already stored;
- after any effects change: the effects' brightness, but only while it is above 0, so turning effects off keeps the brightness they had.

**The engine can start at a brightness** (`rmk/src/lighting/standard/engine.rs`): `with_output_brightness(level)`, next to `with_controls`.

**The board firmware starts with them** (`crates/moergo-rmk/src/lighting.rs`, the code both the Glove80 and the Go60 build): `load_preferences` reads the two records, and `engine()` starts with the stored background and brightness; effects stored as off come back at their stored brightness instead of the compiled `0xff`. A board that never stored them keeps its compiled values, exactly as today.

What stays the same: the protocol (no new commands; Rynkbench needs no change), the keyboard's behaviour while it runs, and every existing record.

## The tests

In RMK:

1. `storage::tests::output_state_and_effects_on_value_survive_storage_reopen`: both records are absent on a fresh store, and read back exactly after storing and reopening.
2. `host::rynk::lighting::tests::output_state_and_effects_brightness_persist`: sets the effects' brightness to 90, turns them off, then sends `SetState` with the lights off, brightness 77 and a breathing background. Storage receives the on-brightness 90 (not 0), the brightness and background, and the output mode "always off". With the change switched off, it fails ("turning effects off must keep their brightness").

The moergo-rmk part has no test of its own: its lighting code builds only for the nRF52 target.

## Results

Stable Rust 1.97, `cargo-nextest` 0.9.152, on `assembled` at `ce86673` (the revision Rynkbench's `flake.lock` pins):

| Check | Result |
|---|---|
| every RMK test, `--features rynk,storage,lighting` | 877 passed |
| the new test with the change switched off | fails, as it should |
| `cargo check --features rynk,lighting` (no storage) | builds |
| `cargo clippy --features rynk,storage,lighting --tests` | no findings in the changed files |
| `rustfmt --check` (RMK and moergo-rmk files) | clean |
| moergo-rmk at `d5a44ba` | applies; **not compiled** (needs the nRF52 target and the submodule bumped to the patched RMK) |

Still to do: build the Glove80 and Go60 firmware with both parts, and the try-out below.

## Apply it

```sh
./apply.sh /path/to/rmk                          # RMK: applies the commit, runs RMK's tests
./apply.sh /path/to/rmk /path/to/moergo-rmk      # and the board firmware
```

In moergo-rmk, `dependencies/rmk` must point at the patched RMK (commit it there, or check it out in the submodule) before building: the board part calls the new readers.

RMK's tests need `cargo-nextest` (`cargo install cargo-nextest --locked`).

## Try it on a keyboard

1. Build and flash the Glove80 (or Go60) firmware with both parts.
2. In Rynkbench, Layout properties, RGB Lighting: set the brightness to about a third and choose a background colour. Apply.
3. Unplug the keyboard (both halves, or let it power off) and plug it back in: it comes up at that brightness and background. Before the patch: full brightness, compiled background.
4. RGB Effects: set the brightness to about half, Apply, turn Effects off, Apply. Restart the keyboard. Turn Effects on with the RGB toggle key: they come back at half. Before the patch: full.
5. Lights off in Rynkbench, restart: the lights stay off.

## For upstream

The RMK part is general: any RMK board with lighting and storage loses its brightness on restart today. The board part is the pattern every board crate that builds its own engine would follow: read the two records, start with them.
