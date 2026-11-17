# Rynkbench

A browser configurator for [RMK](https://github.com/rmk-rs/rmk) keyboards that
speak the **Rynk** protocol (Glove80, Go60 and plain RMK boards). Connect over
Web Serial, WebHID or Web Bluetooth and edit the keymap, behaviors, lighting
and device settings on the keyboard, or edit a layout file without one — no
install, nothing leaves your machine. The look and organization follow MoErgo's
GLIDE.

## Using it

- **Areas.** The top bar opens the areas the keyboard and the session offer
  (`src/ui/areas.ts`): **Keymap** (the main screen), **Behaviors** (All your
  behaviors, Combos, Morse, Macros, Forks, Profiles, Transforms), **Device**
  (connected keyboards only) and **Insights** (the Live view). A section
  shows only when the firmware has it. The **Settings** button holds
  browser-local preferences: the theme, terminology, your computer and its
  keyboard layout (US, UK, German, French, Spanish, Swedish/Finnish) so
  keycaps show the characters keys type, and where the key editor and layers
  panel sit. Nothing there changes the keyboard.
- **Draft and Live.** The connection chip in the top bar switches between
  **Draft**, where changes stay in Rynkbench until **Review & send**, and
  **Live**, where each change goes to the keyboard as you make it. A keyboard
  starts in Draft. Review & send lists the changes by area and layer, each
  group with its own Discard, then sends only what differs from a fresh read
  and reads it back; anything changed on the keyboard since you started is
  shown before it is overwritten. In Live, Paint strokes, rules and pointing
  go once you pause, and a change the keyboard made meanwhile waits for an
  explicit Send. The draft is kept in this browser per keyboard and offered
  back on the next connect. See `docs/sync.md`.
- **Flash memory is spent only on purpose.** The keyboard keeps its layout in
  flash, which lasts for a limited number of writes. Rynkbench writes only
  what changed, once: in Live a key change is written as you make it, and
  painted lights and other waiting changes go together once you pause; RGB
  Lighting and RGB Effects wait for Apply, so dragging a slider writes
  nothing. The pinned firmware also skips a key row equal to the stored one.
  Planning many changes? Stay in Draft: Send writes them all in one go.
- **Undo and Redo** cover every change, in Draft and Live (Ctrl/⌘+Z,
  Ctrl/⌘+Shift+Z or Ctrl+Y); in Live the keyboard follows.
- **Rynkbench Guard** stops or asks before a change that breaks the layout,
  such as cutting a layer off from every key that reaches it.
- **The key editor.** Click a key on the Keymap; the panel below the board has
  **Pick Key**, **Switch Layer**, **RGB Lighting** (on boards with layer
  lighting) and **Every action** (keys, modifiers, layers, tap-hold, macros,
  morse, system and lighting actions). Keys can be dragged to swap them, and
  copied and pasted.
- **RGB Lighting tab.** A key's own light on the layer shown: Off, a Color
  (steady, blink or breathe, at Fast, Normal, Slow or Custom timing), Layer
  below, or a Status light (Caps/Num/Scroll Lock, a half's battery, a
  Bluetooth profile, USB). **Paint** makes the choice a brush over the board,
  one Undo step per stroke. Several keys can be selected (⌘ on a Mac or Ctrl
  elsewhere with a click or drag, Shift with a click, or the tab's
  **Select**) and given one light together. **Clear <layer>'s lights…**
  empties a layer. Where the keyboard has an overlay, **Try out (not saved)**
  puts lights on the keyboard at once without storing them; **Keep these
  lights on <layer>** stores them.
- **Layout properties** (top bar): **Details** (name, keyboard), **Firmware
  options** (keyboard-wide timings), **RGB Lighting** (lights on or off,
  brightness, background; under Advanced how layers light up, which layers
  wake the lights, status setups, the condition rules and what the firmware
  lights on its own) and **RGB Effects** (the firmware's effects as a gallery
  of cards, an effect "Over it" where the firmware has one, palette, speed
  and each effect's settings). Their **Apply** writes straight to the
  keyboard, in Draft too, so you see the result on the board; nothing is
  written while you drag. Settings → **RGB Apply** → Draft holds it for Send
  instead.
- **Behaviors.** All your behaviors lists macros, tap patterns (morse), forks
  and tap-hold profiles with filters, where each is used, Copy and Paste, and
  deleting the unused ones. Each behavior opens in one editor with Apply and
  Cancel. Names and descriptions are kept in the browser per keyboard and in
  TOML files. Combos are listed in the side panel and edited on the board.
- **Files.** The top bar's **Open** (or **Import** with a keyboard attached)
  reads a Glove80 or Go60 TOML or MoErgo JSON file. The import is one change:
  in Draft it waits for Send, in Live only the differences are written, and
  one Undo takes it back. A file for the other board is converted: shared
  physical keys, lighting and positional hold triggers transfer, bindings
  without a destination are reported, and destination-only keys are kept.
  **Save** writes the layout in the board's main format; its ▾ lists every
  format. Files are parsed and validated by the same Rust code
  `moergo-control` runs.
- **Device.** Firmware version and build, Bluetooth profiles, split latency
  on split boards with Bluetooth, firmware updates where the board has a
  release channel (the desktop app downloads the release, checks its SHA-256
  digest and UF2 family, puts each processor into its bootloader and writes
  the mounted UF2 volume), a matrix tester, session diagnostics, and a
  Danger zone that reboots into the bootloader or wipes every stored setting
  and Bluetooth pairing.
- **Simulated boards** — a split ergo, an ortholinear 60, a plain 36-key board
  and a dev stub, so the whole UI can be explored without hardware.

### Physical key addresses

Known MoErgo boards show stable physical addresses anywhere a key is selected
or identified. `LH` and `RH` name the half; finger columns count from the thumb
side outward (`C1` through `C6`) and rows count from the top down. For example,
`RH-C1R3` is the right half's inner finger column on its third row. Thumb keys
count outer-to-inner as `T1` onward; the Glove80 numbers its upper three-key fan
before its lower fan, while the Go60 has one three-key fan. Hover text and the
key inspector retain the raw matrix row and column for diagnostics.

### Status lights and presets

- **Status lights are condition rules** in the firmware's rule table. Node 0
  is the central half and node 1 the peripheral half on a split board. The
  firmware must advertise condition rules (and, for a complete two-half bar,
  both battery nodes).
- **A connection key or a battery bar** is set up from Layout properties →
  RGB Lighting → Advanced → Status setup: **Choose its key on the board…**
  (or **Choose its keys…** for a bar) hides the window and a banner over the keymap says what is being picked,
  with Cancel and Done. A battery bar takes three to eight keys in a column or
  a row; it fills up a column or right along a row unless another order is
  chosen, in one of two styles (equal bands, amber and red when low; or the
  whole bar green, yellow, red). Done installs it as one change.
- **The Glove80 Magic status cluster** puts a battery bar per half,
  Bluetooth 1–3 and USB on the chosen layer, with the bars up each half's
  outer column or as MoErgo's stock firmware draws them.
- **The MoErgo stock Magic layer** (Glove80) rebuilds a layer as the factory
  Magic layer, with its keys, its indicators and the layer set to wake the
  lights; the panel lists what it installs. It and the **Key presets** in the
  key editor (Every action → Lighting: Toggle RGB effects, Cycle lighting
  policy, each binding the action and its indicator colours) are offered in
  Live only: they write their keys and then the rule table directly.
- **Rules can watch runtime status**: other layers on or off, lock
  indicators, whether maintenance writes are locked, and the split link.
  Rules already on one layer can be moved to another with **Move rules
  between layers** in the condition rules list.

Web Serial, WebHID, and Web Bluetooth need a Chromium-based browser (Chrome or
Edge); Firefox and Safari don't implement them. Use **Web Serial** for upstream
RMK's USB CDC transport, **WebHID** for firmware exposing the vendor Rynk HID
interface, and **Web Bluetooth** for firmware exposing the Rynk BLE GATT
service — the one transport that also works in Chrome for Android, where the
two USB backends don't exist. The keyboard must be paired (bonded) with the
connecting device: the firmware only answers Rynk traffic on an encrypted link.
The page must be served from a secure context — `localhost` counts, so local dev
works out of the box. Alternatively, the [Tauri apps](#native-apps-tauri)
bundle the same UI with native transports — HID and BLE on desktop, BLE on
Android — so no browser is needed at all.

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
  needs off a fresh session in one pass; `src/workbench` holds the single
  reducer and the `io` facade the UI changes it through afterwards, without
  React (ADR 0017). The whole map is `docs/ARCHITECTURE.md`.
- **`src/vendor/rynk-wasm`** is an ignored build output containing the Rynk
  protocol client compiled to WASM with `wasm-pack`. The browser owns transports
  (Web Serial/WebHID choosers, stream locks, hot-plug); the WASM owns
  request/response typing and protocol validation.

## Native apps (Tauri)

The same UI ships as a native app: a Tauri shell (`src-tauri/`) serves the built
site in a system webview and provides the transports that webview lacks. Which
transports those are differs by platform, but the frontend cannot tell — both
backends answer the same commands.

### Desktop

WebKit-based webviews have neither WebHID nor Web Bluetooth, so the desktop
shell provides both: raw HID through [hidapi](https://crates.io/crates/hidapi)
and BLE GATT through [bluest](https://crates.io/crates/bluest). Build and run it
from the flake:

```bash
nix build .#rynkbench-tauri   # result/bin/rynkbench
just tauri-run                # dev loop: rebuild the frontend, cargo run
```

On Linux the app opens `/dev/hidraw*` directly, so the usual udev rules for
your keyboard's raw-HID interface apply (the same access WebHID needs). Its
automatic UF2 installer also relies on the desktop automounter exposing the
bootloader under `/run/media/$USER`, `/media/$USER`, `/media`, or `/Volumes`.
Firmware channels are declarative board-profile data; Glove80 and Go60 use the
latest `colonelpanic8/moergo-config` release, but the resolver and installer do
not otherwise contain MoErgo-specific device logic.

### Android

Android has no raw-HID path at all — the platform owns HID-over-GATT, so the
vendor interface is closed to apps — and the Android WebView has no Web
Bluetooth. BLE is therefore the one transport, served by a Kotlin plugin
(`src-tauri/gen/android/.../RynkBlePlugin.kt`) behind the same four commands the
desktop's bluest backend answers.

```bash
just android-apk              # release APK (unsigned)
just android-dev              # debug APK, installed on the attached device
```

Both use the `android` devshell, which carries the Android SDK/NDK (via
`androidenv`, unfree and licence-accepting) and the Rust Android targets. The
generated gradle project under `src-tauri/gen/android/` is committed, because
the Kotlin plugin and the Bluetooth manifest entries live in it; re-running
`cargo tauri android init` would overwrite them.

The app attaches to a **bonded** keyboard by address and never scans: the
firmware's host advertisement does not carry the Rynk service UUID, and a
keyboard busy being a keyboard is not advertising at all. So pair the keyboard
with the phone first, in Android's Bluetooth settings, and the app will find it.
That also keeps the permission ask to *Nearby devices* (`BLUETOOTH_CONNECT`)
with no location permission.

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
**For Go60…** or **For Glove80…** in the ▾ menu beside **Save**. Review the
report and choose **Download migrated TOML**. This creates a standalone file
without writing to a keyboard or replacing the workspace. Send or discard
drafted keys, encoders, slots and pointing first; incomplete device reads must
be resolved before migration.

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

### Troubleshooting a disconnected configuration import

Rynkbench parses configuration files before writing them and checks changed
lighting tables against the connected firmware's capacity and advertised
tagged predicates before applying any part of the import. Layer-set,
maintenance, and split-transport conditions survive TOML import and export;
contradictory gates are rejected
on both input and device readback. A rejected file
should show a configuration error and leave the session connected.

A device request that receives no answer for five seconds closes the Rynk
session to prevent a late response from being mistaken for the next request's
answer. This does not by itself establish that the keyboard rebooted or lost
its USB/Bluetooth connection. An import in Live uses multiple writes; a timeout
after writes begin can leave earlier changes applied. The import is not lost:
it stays in the draft, which is kept for the keyboard; after reconnecting,
Restore it and Send writes only what is left.

For a failing import, retain the TOML, firmware build, Rynkbench build, and
transport used. After reconnecting, copy **Device → Session diagnostics**. A
request marked `timeout` identifies the unanswered operation; `device unplugged`
records a transport disconnect notification. Note whether ordinary typing also
stopped. Firmware updates alone do not update a cached Rynkbench page or its
protocol client; reload the current site too.
