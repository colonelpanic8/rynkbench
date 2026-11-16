# 0007. Six areas, named type sizes

**Status:** Accepted

## Context

The workbench had seven modes named after protocol surfaces (Keymap, Lighting, Effects, Live, Profiles, Advanced, Device). Usage sat inside Advanced, file actions sat in the top bar, and text used sixteen free pixel sizes. The UX brief (`docs/ux-brief.md` §4 and §6) proposes organizing by what the person is doing and naming the sizes.

## Decision

- The rail shows six areas: Layout, Behaviors, Lighting, Device, Library and Insights. Each holds sections, one screen each; the workbench state's `mode` names the section on show. `src/ui/areas.ts` decides which areas and sections exist from what the keyboard and session offer (`areasFor`), and is tested on its own.
- An area with more than one section shows one shared tab strip; screens no longer draw their own navigation.
- Library holds opening, importing, saving and migrating layouts; the top bar keeps identity, history, batch, status, display settings (theme, wording, OS layout, behind one button) and disconnect.
- Text uses seven named sizes (`caption` 10, `small` 11, `body` 12, `ui` 13, `title` 15, `heading` 20, `display` 30), defined in `src/index.css`. `src/ui/theme/typography.test.ts` fails on a free size. Inter and JetBrains Mono ship with the app.

- Questions before something that cannot be taken back go through one dialog (`askConfirm`, `src/ui/messages`), never the browser's `confirm`; short notes that something happened are toasts (`showToast`). A greyed-out `Button` with a `reason` stays focusable and says why.
- The connect screen lists the ways of connecting that work in this browser first; those that cannot are one line each saying what they need.

## Consequences

- A plain RMK board shows five areas; an RGB board adds Lighting. A link from one screen to another names a section, and a section the board lacks falls back to the keymap.
- Sizes moved to the nearest name (11.5 px to 11, 12.5 px to 12), so some text is half a pixel smaller.
