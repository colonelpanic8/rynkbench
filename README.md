# Rynkbench

A browser configurator for [RMK](https://github.com/rmk-rs/rmk) keyboards that
speak the **Rynk** protocol. Connect over Web Serial or WebHID and edit your
keymap and per-key lighting live — no install, nothing leaves your machine.

- **Keymap editing** — per-layer bindings, tap-hold, layer-tap, and the rest of
  RMK's action set, rendered on the board's real geometry. Successful direct
  key assignments can be undone and redone from the top bar or with the usual
  Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, and Ctrl+Y shortcuts.
- **Lighting** — a paint-on-the-board overlay plus on-device *layer scenes*:
  lighting that lives on the keyboard, composites natively as layers activate,
  and survives disconnect and reboot.
- **Firmware lighting controls** — inspect compiled layer/battery conditions,
  edit the firmware-advertised extension effect, palette, value, and speed,
  bind every RMK lighting action, and see the effective
  always-on/off/powered-only policy.
- **Live presentation** — resolved modifiers, the complete active-layer state,
  and conditional/status lighting are read back and reflected in the live view.
- **Advanced config** — combos, morse (tap-dance), fork, and per-behavior tuning
  for firmware that reports support for them.
- **Configuration files** — open or create a Glove80 configuration workspace
  without connecting a keyboard, then download `glove80.toml` or MoErgo JSON.
  Connected keyboards can import the same files by writing only runtime
  differences. A Glove80 or Go60 TOML can also be imported on the other board:
  shared physical keys, lighting, and positional hold triggers are transferred,
  bindings without a destination are reported, and destination-only keys are
  preserved. Both paths use the same validation model as `moergo-control`;
  Morse, combo, fork, macro, and profile tables travel with the keymap.
- **Split tuning** — inspect and adjust the volatile powered/battery BLE latency
  policy on compatible split centrals.
- **Simulated boards** — demo a split ergo, an ortholinear 60, and a dev stub
  with no hardware attached, so the whole UI is explorable offline.

## Behavior and indicator notes

- **Undo/redo currently covers direct matrix-key assignments only.** Each undo
  and redo writes the corresponding binding to the keyboard; it is not a
  browser-only preview. Imports, guided status presets, encoder bindings,
  default-layer changes, lighting, profiles, and advanced tables are excluded
  until their multi-write or staged operations can be reversed atomically.

- **Tap-hold profiles are live configuration.** `Save profile` writes the
  selected slot directly to the connected keyboard; bindings that name that
  slot use the new timings immediately, without reloading a file or flashing.
- **Modified Morse actions are atomic actions.** In a Morse pattern's action
  picker, open **Keys**, select the modifiers, and then select the key. For
  example, selecting left Alt and then F4 produces one `Alt+F4` action. The
  separate **Mods** tab remains for a held modifier by itself, such as the hold
  side of a Delete-tap/Alt-hold binding.
- **Combo triggers follow RMK actions, not matrix positions.** The board canvas
  makes physical selection convenient, but the stored trigger is the resolved
  key action on the combo's scoped layer. Position-addressed combos would need
  a firmware and Rynk protocol addition rather than only a Rynkbench UI change.
- **Battery indicators use conditional lighting rules.** Node 0 is the central
  half and node 1 is the peripheral half on a split board. A bar is a set of
  rules on chosen LEDs with increasing minimum levels (for example 1, 21, 41,
  61, and 81 percent); later low-battery or charging rules can override their
  colors. The connected firmware must advertise conditional lighting and both
  battery nodes for the complete two-half bar to work.
- **Status setup installs those rules for you.** In Lighting, use **Select** to
  choose one connection key or five battery-bar keys, then use **Status setup**
  to bind the action and install the ordered indicator rules. On a Glove80, the
  complete Magic-layer layout from `moergo-config`—two battery bars, three BLE
  profile keys, and the USB key—is available as a single preset.

Web Serial and WebHID need a Chromium-based browser (Chrome or Edge); Firefox
and Safari don't implement them. Use **Web Serial** for upstream RMK's USB CDC
transport and **WebHID** for firmware exposing the vendor Rynk HID interface.
The page must be served from a secure context — `localhost` counts, so local dev
works out of the box. Alternatively, the [Tauri desktop app](#desktop-app-tauri)
bundles the same UI with a native HID transport, so no browser is needed at all.

## Quick start

With [Nix](https://nixos.org) (flakes enabled):

```bash
nix develop            # drops you into a shell with Node 22 and just
just setup
just dev                # builds Rynk WASM, then starts Vite on a fresh port
just dev-mocks          # explicitly include simulated boards for UI development
```

Run `just` to list all project commands. `just check` runs lint, tests, and the
production build; `just preview` builds and serves that production bundle.
Both `just dev` and `just preview` accept an optional explicit port, for example
`just dev 50000`. The dev, build, and test commands use Nix to materialize the
pinned Rynk WASM package first; Node 22+ is still used for the web build itself.

Simulated boards are excluded by default from both the connect screen and the
production bundle. Enable them only for a particular build/startup with
`VITE_ENABLE_MOCKS=1`, or use `just dev-mocks` / `just preview-mocks`.

## Architecture

- **Vite + React + TypeScript + Tailwind v4.** UI under `src/ui`, keyboard/board
  models under `src/model`.
- **The session seam** (`src/session/types.ts`) is the one interface the UI talks
  to. It is backed by a local-file workspace, a `mock` backend with demo boards,
  `webserial` and `webhid` backends that drive real hardware in the browser, and
  a `native` backend that drives the Tauri app's hidapi transport. The UI never
  imports a transport or WASM directly — only *types* from the generated client
  and the seam. All USB backends share one protocol core
  (`src/session/link-session.ts`); only their byte plumbing differs.
- **`src/vendor/rynk-wasm`** is an ignored build output containing the Rynk
  protocol client compiled to WASM with `wasm-pack`. The browser owns transports
  (Web Serial/WebHID choosers, stream locks, hot-plug); the WASM owns
  request/response typing and protocol validation.

## Desktop app (Tauri)

The same UI ships as a native desktop app: a Tauri shell (`src-tauri/`) serves
the built site in a system webview and exposes the Rynk raw-HID interface
through [hidapi](https://crates.io/crates/hidapi), since WebKit-based webviews
have no WebHID. Build and run it from the flake:

```bash
nix build .#rynkbench-tauri   # result/bin/rynkbench
just tauri-run                # dev loop: rebuild the frontend, cargo run
```

On Linux the app opens `/dev/hidraw*` directly, so the usual udev rules for
your keyboard's raw-HID interface apply (the same access WebHID needs).

## The Rynk WASM build artifact

The compiled client (`rynk_wasm_bg.wasm`, `rynk_wasm.js`, and its generated
types) is built from the locked
[`colonelpanic8/rmk`](https://github.com/colonelpanic8/rmk) source rather than
committed to this repository. To materialize it explicitly:

```bash
npm run wasm                  # links the Nix artifact at src/vendor/rynk-wasm
```

`npm run dev`, `npm run build`, and `npm test` do this automatically. A complete
release-ready static site, including the generated WASM, is available as a Nix
artifact:

```bash
nix build                     # result/ contains the deployable site
```

The flake follows the fork's `assembled` branch, while `flake.lock` pins the exact
commit used by `moergo-rmk` for reproducible builds. Update it with
`nix flake update rmk`.

## License

Dual-licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
- MIT license ([LICENSE-MIT](LICENSE-MIT))

at your option, matching the RMK ecosystem this builds on.
