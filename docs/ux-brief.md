# Rynkbench UX Redesign Brief

*Track U0 of the foundation plan: information architecture, design tokens and component inventory. Prepared November 11, 2026 from a read of the Rynkbench code and the GLIDE reference.*

## 1. What this is

The foundation work gives screens a stable way to ask what a keyboard can do (`useCapability`), what refers to what (the reference graph) and why something is blocked. This brief is the design side of that: how the app should be organized and look, so the redesign can be built screen by screen on those foundations. It needs no code changes to start.

It separates what I observed in the code from what I propose. Proposals are for you to accept, change or drop.

## 2. Where the UX stands today (observed)

- **Seven modes, named after protocol areas:** Keymap, Lighting, Effects, Live, Profiles, Advanced, Device. Effects, Live, Profiles and Device appear or disappear depending on the firmware and on whether a keyboard is connected.
- **One dark theme,** defined as named color tokens in `src/index.css` (background, panel, raised, line, ink, mute, faint, accent, danger, ok, warn, plus keycap colors) in the oklch color space. There is no light theme.
- **A small kit,** `src/ui/kit.tsx`: Panel, SectionLabel, Chip, Button, TextInput, InspectorShell, Row, Segmented, UnderlineTabs, ErrorBanner and ApplyBar.
- **Relationships are buried:** what uses a layer, macro or morse slot lives in the Usage tab under Advanced.
- **Refusals arrive late:** deleting a layer used to read the whole keyboard before saying no, and an unavailable feature simply is not shown, with no reason given.
- **Not yet audited:** phone layout, keyboard navigation and screen-reader support, and contrast. These should be checked before any visual work.

## 3. Principles

Adapted from GLIDE, which proves them for ZMK.

1. **Plain words, consequence first.** Say what a message means for the person, then why, in one sentence. Name keys by layer and place, never by index, and make the fix a button.
2. **One safety layer with one name.** It stops, asks or quietly fixes, always looks the same, and only appears when it acts. It never claims a configuration is safe in every way.
3. **Say how far a change goes.** Every control shows whether it goes live to the keyboard, needs a firmware build, or lives only in the file.
4. **Hide what the board lacks, explain what the environment blocks.** A feature the keyboard does not have is not shown. A feature that cannot work here (a USB option in a phone browser, firmware update in a browser tab) stays visible, disabled, with the reason and the fix.
5. **Nothing is lost silently.** Undo covers every change; a refused or failed step changes nothing; a crash offers the configuration to download.
6. **Relationships are one click away.** From any layer, macro, morse slot or key you can see what uses it and what it uses.

## 4. Proposed information architecture

Organize by what the person is trying to do, not by protocol area. Today’s seven modes fold into six areas.

| Area | Holds today’s | Needs (capabilities) | Appears for |
| --- | --- | --- | --- |
| Layout | Keymap, layers, encoders | keymap | every board |
| Behaviors | All your behaviors (ADR 0020), combos, forks, macros, morse, Profiles | `behaviors.*`, combos | boards that have any of them |
| (Lighting) | no area since ADR 0016: each key's light in the key editor's RGB Lighting tab and Paint; the lights as a whole, effects, status setups and rules in Layout properties (RGB Lighting, RGB Effects) | `lighting.state` and its surfaces | boards with RGB |
| Device | Device, connection, firmware update | device, `firmware.update` on desktop | connected boards |
| Library | Import and export, board transfer, backups | none | always |
| Insights | Live, health check | `live.*` for Live | Live when connected |

A plain-RMK board shows Layout, Behaviors (without lighting), Device, Library and Insights. An RGB board adds the key editor's RGB Lighting tab and Layout properties' RGB tabs. The area list comes from the capability set, never from a hard-coded list.

## 5. Flows to design first

1. **Connect and first look:** what the person sees in the first ten seconds, including a board with no profile and a board with half the features.
2. **Edit a key:** pick, assign, see how far it goes, undo.
3. **Delete or reorder a layer:** show everything that uses it before asking, with each place a link.
4. **Bring a layout from another board:** show what carries over and what does not (the loss report), and let the person decide.
5. **Apply to the keyboard:** preview what will be written, apply, and recover if it stops half-way.
6. **Something went wrong:** a failed write, a lost connection, a crash.

## 6. Design system

Build on what exists rather than replace it.

- **Tokens:** keep the current names and add a light value set under the same names, so a theme is a set of values, not a rewrite. Dark stays the default. Add contrast tests for the pairs that matter (text on panel, accent on background).
- **Type:** name the sizes (for example caption, body, label, title) and stop using free pixel sizes in components.
- **Shape and density:** one key radius, one panel radius, one spacing scale, and a compact density for dense tables such as combos and rules.
- **Motion:** short and purposeful, and off under the reduced-motion setting.
- **Accessibility baseline:** a visible focus ring, labels for every icon button, a keyboard path through every flow, and keycap legends readable by a screen reader.

## 7. Component inventory

| Component | Status | Needed for |
| --- | --- | --- |
| Panel, SectionLabel, Chip, Button, TextInput, Row, Segmented, UnderlineTabs | exists | everywhere |
| ErrorBanner, ApplyBar, InspectorShell | exists | writes, inspectors |
| Dialog and confirmation | missing (uses the browser’s confirm) | delete, reset, import |
| Reason tooltip | missing | “why is this greyed out” |
| Impact list (a place, a link) | new, from the usage report | delete layer, Insights |
| Loss report view | partly exists in the transfer report | board transfer, import |
| Health finding (tier, why, fix) | new | Insights |
| Toast | missing | undo, applied, failed |
| Command palette | missing | keyboard-first use |
| Empty state | missing | boards without a feature |

## 8. How the areas adapt

|  | Minimal RMK board | RGB board | Phone browser | Desktop app |
| --- | --- | --- | --- | --- |
| Layout | yes | yes | yes, touch layout | yes |
| Behaviors | the surfaces the board has | same | yes | yes |
| RGB Lighting and RGB Effects (key editor, Layout properties) | hidden | shown | shown | shown |
| Device | connection and info | plus lighting output | Bluetooth only, USB explained | plus firmware update |
| Library | file import and export | same | same | same |
| Insights | health check | plus lighting findings | none | plus Live |

## 9. Deliverables and exit for U0

- Audit of today’s UI for phone layout, keyboard use, screen readers and contrast.
- One page per area and per flow in section 5: a rough drawing, the parts, the states, the exact messages and what it adapts to.
- The token set with a light theme and the contrast tests.
- The finished component inventory, with the missing components specified.

**Exit:** the six areas and the six flows are specified well enough to build any one of them on `useCapability`, `useQuery` and `useCommand` without further design questions.

## 10. Decisions

1. **Light theme:** both a dark and a light theme, with dark as the default.
2. **Density:** desktop first, with mobile as a fallback. The phone layout gets the essentials, not a separate design.
3. **Wording:** both: a friendly mode and a technical mode (RMK and Rynk terms), driven by one terms table so no screen hard-codes either. Which voice is the default is still open. The first build keeps today’s technical wording as the default, so nothing changes until you choose, and ships the friendly names (for example Tap patterns for Morse, Conditional keys for Forks) as proposals to edit in one table.
