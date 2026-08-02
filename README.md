# Rynkbench

A browser configurator for [RMK](https://github.com/HaoboGu/rmk) keyboards that
speak the **Rynk** protocol. Connect over WebHID and edit your keymap and
per-key lighting live — no install, nothing leaves your machine.

- **Keymap editing** — per-layer bindings, tap-hold, layer-tap, and the rest of
  RMK's action set, rendered on the board's real geometry.
- **Lighting** — a paint-on-the-board overlay plus on-device *layer scenes*:
  lighting that lives on the keyboard, composites natively as layers activate,
  and survives disconnect and reboot.
- **Advanced config** — combos, morse (tap-dance), fork, and per-behavior tuning
  for firmware that reports support for them.
- **Simulated boards** — demo a split ergo, an ortholinear 60, and a dev stub
  with no hardware attached, so the whole UI is explorable offline.

WebHID needs a Chromium-based browser (Chrome or Edge); Firefox and Safari don't
implement it. The page must be served from a secure context — `localhost`
counts, so local dev works out of the box. Alternatively, the [Tauri desktop
app](#desktop-app-tauri) bundles the same UI with a native HID transport, so no
browser is needed at all.

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
  to. Three implementations back it: a `mock` backend with demo boards, a
  `webhid` backend that drives real hardware in the browser, and a `native`
  backend that drives the Tauri app's hidapi transport. The UI never imports a
  transport or WASM directly — only *types* from the generated client and the
  seam. The two USB backends share one protocol core (`src/session/link-session.ts`
  over the byte-link framing in `src/session/rynk-link.ts`); only the report
  plumbing differs.
- **`src/vendor/rynk-wasm`** is an ignored build output containing the Rynk
  protocol client compiled to WASM with `wasm-pack`. The browser owns transports
  (WebHID chooser, stream locks, hot-plug); the WASM owns request/response typing
  and protocol validation.

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
commit used by `glove80-rmk` for reproducible builds. Update it with
`nix flake update rmk`.

## License

Dual-licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
- MIT license ([LICENSE-MIT](LICENSE-MIT))

at your option, matching the RMK ecosystem this builds on.
