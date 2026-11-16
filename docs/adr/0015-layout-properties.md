# 0015. Layout properties, as in GLIDE

**Status:** Accepted (asked by the project owner: GLIDE's Layout properties with what Rynkbench has, GLIDE's icons for it and for Settings).

## Context
GLIDE has one Layout properties window (sliders by the layout's name): Details (name, made by, tags, keyboard and Convert), Notes, Firmware options, Lighting, and two code texts. Rynkbench's layout files (RMK TOML, the keyboard's own storage) carry no title, tags, notes or custom code, and its keyboard-wide settings were spread over a Behaviors section (global timing), the Save menu (convert to the other MoErgo board) and the Lighting screen.

## Decision
- **One window, GLIDE's frame** (`ui/properties/`): tabs on the left, opened from the sliders by the layout's name or from links elsewhere (`openProperties(tab)`, `properties/store.ts`). Settings keeps GLIDE's cog.
- **Details:** the layout's name (the saved file takes it), the keyboard with Convert to the other board (the existing migration), and what the keyboard can hold, from its capabilities.
- **Firmware options:** the keyboard-wide timings. The Behaviors area's Behavior section is gone; Combos links here for the combo timeout.
- **Lighting:** the output, brightness and background panel, the same component as in Lighting. Now RGB Lighting and RGB Effects (ADR 0016).
- **No Notes, Tags or code tabs** until the file format can keep them.
- Each part saves as it does elsewhere (Draft or the keyboard). GLIDE's one Apply for the whole window waits for one history (ADR 0013).

## Consequences
- A new keyboard-wide setting goes in a Layout properties tab, not a new section.
- When the format can store a title or notes, they join Details and a Notes tab.
