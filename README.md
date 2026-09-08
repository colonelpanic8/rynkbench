# Rynkbench

A browser configurator for [RMK](https://github.com/rmk-rs/rmk) keyboards that
speak the **Rynk** protocol. Connect over Web Serial or WebHID and edit your
keymap and per-key lighting live — no install, nothing leaves your machine.

- **Keymap editing** — per-layer bindings, tap-hold, layer-tap, and the rest of
  RMK's action set, rendered on the board's real geometry. Successful direct
  key assignments can be undone and redone from the top bar or with the usual
  Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, and Ctrl+Y shortcuts. A top-bar **batch mode**
  stages key and encoder edits locally — dashed outlines mark staged keys —
  and writes them all in one apply pass instead of one device write per edit.
- **Locale & character mapping** — pick your OS keyboard layout (US, UK,
  German QWERTZ, French AZERTY, Spanish, Swedish/Finnish) in the top bar.
  Keycaps, pickers, and the live view then show the characters keys actually
  type; pure Shift/AltGr combos render as the character they produce; and
  typing a character into the key search (`ö`, `@`, `é`) finds the keystroke
  that types it, automatically binding any Shift/AltGr it needs. The choice is
  a browser-local display preference — nothing on the keyboard changes.
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

### Physical key addresses

Known MoErgo boards show stable physical addresses anywhere a key is selected
or identified. `LH` and `RH` name the half; finger columns count from the thumb
side outward (`C1` through `C6`) and rows count from the top down. For example,
`RH-C1R3` is the right half's inner finger column on its third row. Thumb keys
count outer-to-inner as `T1` onward; the Glove80 numbers its upper three-key fan
before its lower fan, while the Go60 has one three-key fan. Hover text and the
key inspector retain the raw matrix row and column for diagnostics.

### RGB controls and painted layer colors

In **Lighting**, **All RGB lighting** controls the composed output, including
painted layer scenes and indicators. Change the checkbox and press its **Apply**
button. For a keyboard shortcut, assign **Output toggle** (`BacklightToggle`)
in Keymap. `RgbTog` toggles the background/effect source; layer scenes remain
visible. Layers marked **MoErgo Magic Layer** can temporarily wake lighting even
when output is off; disable that option on each wake layer for darkness on every
layer. Turning output off preserves the stored color scheme.

Background/effect hue, saturation, and speed controls do not transform painted
layer colors. Select the layer in Lighting and use the color brush to edit its
scene. Layer key legends follow the selected layer's bindings (including
transparent fallthrough to the default layer); Overlay follows the live layers.

## Behavior and indicator notes

- **Undo/redo currently covers direct matrix-key assignments only.** Each undo
  and redo writes the corresponding binding to the keyboard; it is not a
  browser-only preview. Imports, guided status presets, encoder bindings,
  default-layer changes, lighting, profiles, and advanced tables are excluded
  until their multi-write or staged operations can be reversed atomically.

- **Batch mode holds keymap writes; everything else stays live.** While it is
  on, key and encoder edits accumulate locally until **Apply all** writes them
  to the keyboard (a failed write stays staged for retry) or **Discard**
  restores the device's values. Lighting, layer structure, imports, and
  advanced tables keep their own write paths: layer operations and imports
  refuse to run over staged edits, and leaving batch mode requires applying or
  discarding them first. A batch apply is a bulk write, so — like an import —
  it clears the direct-key undo history.

- **A Magic Layer is a lighting convention, not a firmware layer type.** In
  Lighting, select an ordinary layer target, paint and apply its device-backed
  scene, then use **MoErgo Magic Layer** to keep that scene visible when the
  normal lighting policy turns the board off. The scene and wake-layer policy
  are stored on the keyboard and work for both Glove80 and Go60 layouts.
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
  rules on three to eight chosen LEDs with increasing minimum levels; later
  low-battery or charging rules override their colors. Two styles are offered:
  equal bands (a five-key bar lights at 1, 21, 41, 61, and 81 percent, with the
  lowest segments amber under 40 and red under 20) and MoErgo stock (levels
  step 0…100 across the bar and the whole bar is green, yellow, or red). The
  connected firmware must advertise conditional lighting and both battery
  nodes for the complete two-half bar to work.
- **Status setup installs those rules for you.** In Lighting, use **Select** to
  choose one connection key or five battery-bar keys, then use **Status setup**
  to bind the action and install the ordered indicator rules on the chosen
  status layer (the designated Magic layer by default). A battery bar fills
  along its longer axis—bottom-to-top for a column, left-to-right for a row—and
  the fill direction can be overridden, including using the order the keys were
  selected in; the panel lists the resulting 20%→100% keys before installing.
  On a Glove80, the complete Magic-layer layout—two battery bars, three BLE
  profile keys, and the USB key—is available as a single preset that targets
  the chosen layer. Its bars can run up each half's outer column (five
  segments each) or follow MoErgo's stock firmware, which draws both halves'
  six-segment bars across the left half on rows 2 and 3. Rules already installed on
  another layer can be re-pointed in bulk with **Move rules between layers**
  under the Conditional rules list; key bindings stay where they are.
- **The MoErgo stock Magic layer is a one-click template.** On a Glove80,
  Status setup also offers **MoErgo stock Magic layer**, which rebuilds the
  chosen layer as the factory ZMK Magic layer: Bluetooth profiles 1–4 on T4,
  T5, T1, and T2 (RMK's slot-select actions, which also prefer Bluetooth
  output), USB output on T6, RGB speed/saturation/hue/brightness and
  toggle/effect keys on the Q–T and A–G rows (the toggle is the lighting
  output toggle, which is what MoErgo's `RGB_TOG` does), bootloader and reset
  on each half's outer keys, forget-active-pairing on F1, and every other key
  unbound. It installs the stock indicator map from MoErgo's firmware on the
  same layer: the left half goes dark, the number row shows in magenta which
  layers are held alongside Magic, F3–F5 show caps, num, and scroll lock in
  red, rows 3 and 4 fill green/yellow/red with the left and right battery
  (all green while charging), and the profile and USB keys show lilac
  unpaired, red paired-but-idle, green connected, and white while carrying
  typing. The layer is designated a Magic layer so it wakes lighting; the
  firmware keeps the view up for 20 seconds after release. Brightness keys
  adjust the whole output, including indicators.
  Unchanged keys are skipped, the template's own rules and the layer's scene
  are replaced on repeat runs, and rule and scene capacity are checked before
  anything is written. Not reproduced, because the firmware has no matching
  condition or action: the output-fallback indicator and clear-all-pairings.
- **Rules can watch a layer set and the host's lock indicators.** Beyond the
  single layer condition, a runtime rule can require every layer in a set to
  be active and every layer in another set to be inactive (**Other layers**),
  and can gate on num, caps, and scroll lock (**Lock indicators**). Both ride
  the advanced conditional endpoints, so firmware must advertise the
  layer/indicator-conditions capability; the preview evaluates layer sets
  against the live layer state and treats lock rules as unsatisfiable, since
  the host does not see the keyboard's lock state.
- **Lighting control key presets pair behavior and colors.** In Keymap, select
  a key and open the Lighting tab of its action editor. Under **Key presets**,
  **Toggle RGB effects** installs the effects toggle and green/dim-red
  enabled/disabled indicators; **Cycle lighting policy** installs the
  output-mode action and green/red/blue indicators for always on/off/USB-powered
  only. Each preset writes both the action and its conditional lighting to the
  layer being edited; repeating one replaces the existing lighting-control
  rules on that key and layer. Rule capacity is checked before the action is
  written. Finish batch editing first, since these presets apply both parts
  immediately. The indicator is layer-scoped and follows the output policy;
  designate its layer as a **MoErgo Magic Layer** in Lighting to see it while
  normal lighting is off.
- **Status setup chooses its keys from the board.** The connection key and
  battery bar presets under Lighting → Status setup have a **Choose on board**
  button: the canvas selects instead of painting until you press Done, a
  single-key pick replaces on every click, and the chosen keys are listed as
  chips that highlight their key when hovered.

Web Serial, WebHID, and Web Bluetooth need a Chromium-based browser (Chrome or
Edge); Firefox and Safari don't implement them. Use **Web Serial** for upstream
RMK's USB CDC transport, **WebHID** for firmware exposing the vendor Rynk HID
interface, and **Web Bluetooth** for firmware exposing the Rynk BLE GATT
service — the one transport that also works in Chrome for Android, where the
two USB backends don't exist. The keyboard must be paired (bonded) with the
connecting device: the firmware only answers Rynk traffic on an encrypted link.
The page must be served from a secure context — `localhost` counts, so local dev
works out of the box. Alternatively, the [Tauri desktop app](#desktop-app-tauri)
bundles the same UI with native HID and BLE transports, so no browser is needed
at all.

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
  to. It is backed by the in-memory `mock` engine (demo boards, and the
  local-file `offline` workspace built on it), the `webhid`, `webserial` and
  `webbluetooth` backends that drive real hardware in the browser, and the
  `native` / `native-ble` backends that drive the Tauri app's hidapi and
  bluest transports. The UI never imports a transport or WASM directly — only
  *types* from the generated client and the seam. Every real transport is a
  byte link handed to one protocol core (`src/session/link-session.ts`)
  through one opener (`src/session/open-link.ts`); only the byte plumbing
  differs. A backend reports a surface the firmware lacks by rejecting with an
  error `isUnsupportedError` recognizes (`src/session/unsupported.ts`) — the
  UI relies on that to tell "not supported" from "read failed".
- **Connect-time snapshot.** `src/ui/bundle.ts` reads everything the workbench
  needs off a fresh session in one pass; `src/ui/state.tsx` is the single
  reducer + `io` facade the UI mutates through afterwards.
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
commit used by `moergo-rmk` for reproducible builds. Update both source inputs
with a fresh fetch cache:

```bash
XDG_CACHE_HOME="$(mktemp -d)" nix flake update rmk moergo-rmk
```

MoErgo contains submodules. Nix can reuse a local checkout's cached tree for a
GitHub archive, even though only the archive includes empty submodule
directories ([Nix #13698](https://github.com/NixOS/nix/issues/13698)). A fresh
cache keeps the lock hash reproducible on CI and other machines. After a pin
change, refresh `nix/rynk-wasm-Cargo.lock` as needed and run `just check` and
`just nix-check`.

## License

Dual-licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
- MIT license ([LICENSE-MIT](LICENSE-MIT))

at your option, matching the RMK ecosystem this builds on.

### Download a configuration for the other MoErgo board

Open a configuration workspace or connect a Glove80/Go60, then choose
**Migrate to Go60** or **Migrate to Glove80** in the top bar. Review the report
and choose **Download migrated TOML**. This creates a standalone draft without
writing to a keyboard or replacing the workspace. Apply or discard staged
edits first; incomplete device reads must be resolved before migration.

Migration uses the same physical mapping as cross-board import: number and
letter rows align, lower thumb arcs transfer, and shared bottom-row finger
positions stay aligned. Unmatched destination keys are transparent. The report
lists lost bindings and lighting cells; positional combos missing any input
are disabled as a whole. A hold-trigger policy that loses every position
blocks migration. Review layer access, action-based combo inputs, and thumb
ergonomics before importing the draft. The Bluetooth name is omitted, and
Go60 pointing policies are omitted when migrating to Glove80.

### Board profiles and generic RMK support

The connected workbench has two independent sources of feature support:

- **Firmware capabilities** control generic editors: keymaps, behaviors,
  pointing, lighting scenes, wake layers, and user-selected status indicators.
  A known board name is never required for these.
- **Board profiles** contribute optional product knowledge: physical addresses,
  configuration codecs and migration targets, and presets tied to a board's
  wiring. A profile cannot substitute for firmware capability or LED-topology
  checks.

The registry in src/model/boards/profiles.ts resolves profiles using the
reported USB vendor and product IDs, exact product name, and matrix dimensions.
The connection bundle stores the result as boardProfile and uses the same
profile for enrichment. Unknown or inconsistent identities stay generic—even
if their matrix matches a known board or their name contains “Glove80”.

Product definitions live in src/model/boards/profiles/moergo.ts; the generic
contract is profile.ts. Document controls render the profile's declared formats
and migration target. The registry in src/config/adapters.ts supplies the codec,
and action handlers reject calls without a compatible profile. The current
TOML/JSON codec is MoErgo-specific; unknown boards therefore do not offer those
file controls. Adding a generic RMK document codec is separate from making
generic device editors available.

Glove80 status and stock Magic presets require their registered preset IDs,
the relevant firmware features, and the expected physical LED mapping. Go60
does not inherit those presets. Wake-layer lighting uses generic language and
remains available on any firmware exposing that capability.

To support another board, add its profile contribution to the registry and
declare only the document tools and physical presets it implements. Add a
codec adapter if its file format differs. Keep product-name and matrix
heuristics out of React components. Offline templates explicitly choose their
board and expose that board's canonical identity; they are separate from
generic device discovery.
