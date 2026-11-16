# 0016. RGB lighting the GLIDE way

**Status:** Accepted (decided with the project owner); built in four stages, all done.

## Context
Lighting is its own top-bar area with two tabs, both named for what they are only by context: Lighting (paint keys on an "Overlay" or a layer, status-light presets, condition rules, zones, a brush) and Effects (the firmware's effects and palettes). Beginners do not know what the Overlay is (lights that are never saved and vanish on reboot) or how it relates to the layers. GLIDE has no lighting screen: a key's light is a choice in the key editor's Key Lighting tab (Off, a colour, a status light), Paint turns that choice into a brush over the canvas (one undo step per stroke), and brightness and effects live in Layout properties.

## Decision
- **Words:** "RGB Lighting" for each key's own light (per layer, status lights included); "RGB Effects" for the firmware's effects across the keyboard. Decorations, later, are "Appearance". Never "key colours".
- **RGB Lighting on the Keymap:** the key editor tab is "RGB Lighting" with GLIDE's choices for every selected key: Off, Colour (steady, blink, breathe), Status light (Caps/Num/Scroll Lock, battery level per half, Bluetooth profile, USB). Paint makes the choice a brush: click or drag over keys; one undo step per stroke. Zones are replaced by selecting or painting keys. The canvas's lit view shows the result.
- **Layout properties:** "RGB Lighting" tab: lights on or off, brightness, background; under Advanced the presets (Magic status cluster, stock Magic layer) and the condition rules. "RGB Effects" tab: one big Effects on/off first, then effect, palette, speed and the effect's settings.
- **Quick links:** the Keymap's sun button gets a small menu (Show lights, RGB settings…, RGB effects…); each properties tab links back ("Paint keys on the Keymap →"); empty states point to where things are.
- **The Overlay leaves the normal flow:** every light set is saved on its layer. A "Try out (not saved)" option can come back as an advanced choice if it is missed.
- **The Lighting area leaves the top bar** in the last stage; until then its tabs are named RGB Lighting and RGB Effects.

## Stages (each shippable)
1. Key editor "RGB Lighting" tab with GLIDE's choices and Paint (`ui/lighting/` pieces reused; writes through the draft and the one write path).
2. Layout properties "RGB Lighting" (on/off, brightness, background, Advanced) and "RGB Effects" (Effects on/off first).
3. Quick links: sun-button menu, links back, empty states.
4. Overlay out of the normal flow; Lighting area removed from the top bar (`ui/areas.ts`), its screens deleted or moved.

## Progress
- **Stage 1 (done):** the key editor tab is "RGB Lighting" with Off, Color, Layer below and Status light (Caps/Num/Scroll Lock, battery per half, and on wireless boards a Bluetooth profile or USB, in the status preset's colours; `ui/lighting/statusLight.ts`). Layer below stays: it is how a key shows the layers underneath, as in GLIDE. A light and a Paint stroke are each one undo step (`ui/draft/draftHistory.ts`), in Draft, Live and a file alike: every edit takes its place from one counter, so in Live and a file the lighting steps and the key writes undo in turn, newest first (`ui/draft/oneHistory.ts`), until ADR 0013 makes them one history. The Lighting area's tabs are named RGB Lighting and RGB Effects. Still to come: selecting several keys on the Keymap, so one choice reaches them all.
- **Stage 2 (done):** Layout properties has "RGB Lighting" (a big Lights switch, brightness, background; Advanced, closed: the status setups and the condition rules) and "RGB Effects" (a big Effects switch, then effect, overlay, palette, brightness, speed and the effect's own settings; `ui/properties/`). Effects off is the firmware's own off: the effects' value at zero, what RGB toggle does. The effects draft is one hook for the Effects screen and the tab (`ui/effects/useEffectsDraft.ts`). The status setups now stage their rules in the draft instead of writing the rule table at once; picking keys on the canvas for a connection key or a battery bar stays in the Lighting screen. The lights and effects keep their Apply: they are keyboard settings, which ADR 0013 moves to the one path last.
- **Stage 3 (done):** the Keymap's sun button is a menu (Show lights, RGB settings…, RGB effects…; `ui/keymap/LightsButton.tsx`); both Layout properties tabs link back ("Paint keys on the Keymap →"); the key's RGB Lighting tab links to RGB settings and, while the keyboard's lights are off, says so with a way to turn them on.
- **Stage 4 (done):** the Lighting area and its Lighting and Effects screens are gone (`ui/areas.ts`), with what only they used: zones, the overlay brush and its expiry, the LED selection, canvas picking for a connection key or a battery bar, the effects gallery and the overlay-based layer presets of firmware without scene storage. Their keyboard-wide parts moved to RGB Lighting's Advanced: how layers light up (top layer only or every active one, which layers wake the lights, copying lights a pre-scene Rynkbench kept in this browser into the draft) and what the firmware lights on its own. A connection key's light is now the key's own status light; a battery bar is the Glove80 preset or a battery level per key. The overlay's state stays in the reducer for the live view and can come back as "Try out (not saved)".

## Consequences
- A lighting feature goes either on a key (key editor, Paint) or in Layout properties; there is no lighting screen to add it to.
- The big lighting panels (`ConditionalRulesPanel`, `LightingMode`) shrink or go as their parts move; their size ceilings only go down.
