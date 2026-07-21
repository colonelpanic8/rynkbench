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
npm run dev            # builds Rynk WASM, then starts the Vite dev server
```

Other scripts: `npm run build` (typecheck + production build), `npm run test`
(vitest), `npm run lint` (oxlint), `npm run preview` (serve the built site).
The dev, build, and test commands use Nix to materialize the pinned Rynk WASM
package first; Node 22+ is still used for the web build itself.

## Architecture

- **Vite + React + TypeScript + Tailwind v4.** UI under `src/ui`, keyboard/board
  models under `src/model`.
- **The session seam** (`src/session/types.ts`) is the one interface the UI talks
  to. Two implementations back it: a `mock` backend with demo boards, and a
  `webhid` backend that drives real hardware. The UI never imports a transport
  or WASM directly — only *types* from the generated client and the seam.
- **`src/vendor/rynk-wasm`** is an ignored build output containing the Rynk
  protocol client compiled to WASM with `wasm-pack`. The browser owns transports
  (WebHID chooser, stream locks, hot-plug); the WASM owns request/response typing
  and protocol validation.

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

The flake input names the RMK integration branch used by `glove80-rmk`, while
`flake.lock` pins an exact commit for reproducible builds. Update with
`nix flake update rmk`; switch the branch in `flake.nix` when `glove80-rmk`
promotes its RMK pin to another branch.

## License

Dual-licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
- MIT license ([LICENSE-MIT](LICENSE-MIT))

at your option, matching the RMK ecosystem this builds on.
