# 0008. GLIDE's main screen and look

**Status:** Accepted (supersedes the area rail and the Library of 0007)

## Context

GLIDE, the MoErgo layout editor by the same author, is organized and drawn in a way people find clearer: a top bar with Open and Save, a side panel of layers and combos, the keyboard in the middle; its colours and keys look better. Rynkbench follows it.

## Decision

- Colours are GLIDE's Default Dark and Default Light (MoErgo's palette); keys are drawn as GLIDE draws them on a dot-grid canvas; the Glove80 profile draws GLIDE's key geometry.
- The top bar holds the wordmark (back to the keymap), the layout's name, Open and Save ▾ (every format, and a copy for the sibling board), the screens that open over the keymap (Behaviors, Lighting, Device, Insights, as the board offers them), history, batch, status, display settings and Close.
- The keymap screen has GLIDE's side panel: Layers and Combos as lists; a layer's actions are in its ⋮ menu or a right-click (`src/ui/RowMenu.tsx`). On a phone the panel is a drawer.
- Which screens and sections exist is still decided by `src/ui/areas.ts`.

## Consequences

- No area rail and no Library screen.
- The key editor sits below the keyboard with GLIDE's slots and Pick Key; keys have a right-click menu.
- A combo is edited on the canvas in GLIDE's Focus Mode: the selection can be a combo, and the keymap screen then shows `ComboFocusCanvas` and `ComboEditor` in place of the canvas and the key editor (both in `EditorPanel`'s frame).
