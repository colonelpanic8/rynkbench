# 0024. Lighting tools on the keymap

**Status:** Accepted. Amends ADR 0016, whose last stage removed these tools with the Lighting screen.

## Context

ADR 0016 moved each key's light to the key editor's RGB Lighting tab and removed the Lighting screen. With it went selecting several keys, picking keys on the board for a connection key or a battery bar, the effects gallery, exact timing for a key's light and trying out lights without saving them. Zones were to be replaced by selecting keys. These are wanted back, in the places ADR 0016 chose: on the keymap and in Layout properties.

## Decision

- **Several keys selected.** The selection keeps more keys beside the one the key editor shows (`Selection.more`, `model/key-selection.ts`, action `selectKeys`). ⌘ with a click on a Mac, Ctrl elsewhere, adds or removes a key, and held through a drag does it for every key crossed; Shift with a click extends to that key; the RGB Lighting tab's **Select** (beside Paint) makes a plain click or drag select. The same modifiers work with Enter or Space. A choice in the tab gives every selected key that light as one `set_key_light` operation; everything that works on one key acts on the last one selected. A secondary click never selects.
- **Clear <layer>'s lights…** at the foot of the tab, after a question: one `clear_layer_lights` operation.
- **Picking keys for a status light.** Layout properties → RGB Lighting → Advanced starts a pick for a connection key or a battery bar (`model/lighting/key-pick.ts`, `ui/lighting/keyPick.ts`). The window steps aside, the canvas collects keys with the selection, and a banner (`ui/keymap/PickBanner.tsx`) says what is picked, with Cancel (or Escape) and Done. Done is one `set_connection_key` or `set_battery_bar` operation. Showing another layer during a pick moves the pick to it, keeping the keys chosen.
- **The effects gallery.** Layout properties → RGB Effects shows the firmware's effects as cards, for the base slot ("Effect") and, where the firmware has one, the slot drawn over it ("Over it", with None).
- **Exact timing.** A colour's effect runs at Fast, Normal, Slow or Custom; Custom gives Period, Duty (Blink) or Step (Breathe), and Phase. Blink duty is a percentage. A stored duty of 100 or more is always on, and is shown and drawn so (`blinkDuty`, `model/lighting/effect.ts`); an export writes it as 100.
- **Try out (not saved)**, in the RGB Lighting tab, where the keyboard has an overlay (`lighting.overlay`) and is connected. While on, the tab's choice, the selection and Paint give try-out lights, sent after a 0.2 s pause as one overlay write (`workbench/io-try-out.ts`), optionally with a lifetime. They are not part of the draft, Send or Undo. Switching it off takes them off the keyboard; **Keep these lights on <layer>** stores them as one `set_key_effects` operation, then clears them.
- **Not coming back:** zones (selecting keys replaces them) and layer presets kept in the browser for firmware without scene storage.

## Consequences

- Drag-select relies on `pointerenter` while a button is held. A touch pointer stays captured by the key it started on, so touch has no drag-select; touch can still select with Select on, one tap per key. Not tried on a device.
- An older Rynkbench stored a new blink at duty 128 (of 255). The firmware plays 100 or more as always on, and the layout-file reader in its config crate (`rmk-config`) refuses a duty above 100. Exports now clamp it; a file saved with 128 before that is refused by that reader.
- The overlay is held in the keyboard's memory, not flash (as the io's comment states; not measured here), so trying out costs no wear.
- The pick, the lit view and trying out live in module stores that end with the workbench (`ui/workbench-end.ts`).
- None of this has been tried in a browser or on a keyboard; the screen tests render static markup only.
