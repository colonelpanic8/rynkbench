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
counts, so local dev works out of the box.

## Quick start

With [Nix](https://nixos.org) (flakes enabled):

```bash
nix develop            # drops you into a shell with the right Node
npm install
npm run dev            # Vite dev server; open the printed localhost URL in Chrome
```

Without Nix, use Node 22+ and the same `npm` commands.

Other scripts: `npm run build` (typecheck + production build), `npm run test`
(vitest), `npm run lint` (oxlint), `npm run preview` (serve the built site).

## Architecture

- **Vite + React + TypeScript + Tailwind v4.** UI under `src/ui`, keyboard/board
  models under `src/model`.
- **The session seam** (`src/session/types.ts`) is the one interface the UI talks
  to. Two implementations back it: a `mock` backend with demo boards, and a
  `webhid` backend that drives real hardware. The UI never imports a transport
  or wasm directly — only *types* from the vendored client and the seam.
- **`src/vendor/rynk-wasm`** is the Rynk protocol client: Rust compiled to wasm
  with `wasm-pack`. The browser owns transports (WebHID chooser, stream locks,
  hot-plug); the wasm owns request/response typing and protocol validation.

## The vendored Rynk client

The compiled client (`rynk_wasm_bg.wasm`, `rynk_wasm.js`, `rynk_wasm.d.ts`) is
**committed** to this repo, so the app builds with only Node — no Rust toolchain
required. `src/vendor/rynk-wasm/provenance.json` records exactly which
[`colonelpanic8/rmk`](https://github.com/colonelpanic8/rmk) commit it was built
from and the command that produced it.

To regenerate it against the pinned source:

```bash
nix run .#regen-wasm          # rebuilds src/vendor/rynk-wasm and rewrites provenance.json
```

Or work in the regen shell against your own RMK checkout:

```bash
nix develop .#regen
RMK_SRC=/path/to/rmk regen-wasm
```

Bump the pin by editing the `rmk` input rev in [`flake.nix`](flake.nix), then
`nix flake lock --update-input rmk` and regenerate.

## License

Dual-licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
- MIT license ([LICENSE-MIT](LICENSE-MIT))

at your option, matching the RMK ecosystem this builds on.
