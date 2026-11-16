# 0014. GLIDE's themes, Settings and key faces

**Status:** Accepted (asked by the project owner: GLIDE's Settings, its themes and its key pictures, all but "Ask to convert custom behaviors"). Replaces how ADR 0005 makes a theme; its token names and its test stay.

## Context
Rynkbench had two hand-written themes (dark, light) in `index.css`, a small Settings popover (theme, wording, keyboard layout), and text-only key legends ("Boot", "U2", "L⌘"). GLIDE has six themes made from twelve main colours each, a Settings panel, pictures for system keys and modifiers that read the way the user's computer writes them.

## Decision
- **Themes are data.** `ui/theme/themes.ts` holds GLIDE's six themes as their main colours (copied from GLIDE's `core/themes.js`) and works out every Rynkbench token from them (`themeTokens`), each text colour made readable on every surface it sits on. The page gets one CSS block per theme (`<style id="rynk-themes">`, chosen by `<html data-theme>`). `index.css` `@theme` still declares the token names (Tailwind makes the utilities from it) with the Default Dark values. The colour guard (`colours.test.ts`) skips `themes.ts`, as it skips `index.css`: both are where colours are defined, not used.
- **Preferences are small stores** (`ui/preferences.ts`, on `ui/settings.ts`): computer (Auto, Mac, Windows, Linux), Highlight special keys, Show shifted characters, Key editor (Bottom, Side), Layers panel (Left, Right). Each has its default in one place and a hook; `resetPreferences` puts them, the theme, the wording and the keyboard layout back. Browser-local, never written to the keyboard.
- **Settings** (`ui/SettingsPanel.tsx`) is GLIDE's panel: Look, Your computer, Screen, then Reset. It opens away from the Layers panel.
- **Key faces** (`ui/keyface/`): `keyFace(action, morse, context)` adds to the text legend the pictures GLIDE draws (Bluetooth profiles and clear, USB, bootloader, lighting, media, arrows, Backspace, Tab, Menu, Return on the Mac), modifiers per computer (`modifiers.ts`, GLIDE's table: Mac pictures, the Windows key, Super, AltGr, Hyper), a chord's modifiers above its key, and the special-key kind (`specialKind`, GLIDE's rule: Bluetooth, else anything but a plain key press). The pictures are copied from GLIDE (`keyIconData.ts`, single colour, `currentColor`). A board names the pictures of its own User actions in its profile (`userActions[].icon`). Lists and messages keep the text (`keyActionGlyph`). Pictures take GLIDE's measured proportions (`canvas/legend.ts` `faceLayout`); a key that does nothing shows GLIDE's faint slash; a light set to black leaves the key as itself (GLIDE's `isDark`); the key editor's heading draws the key with the same face (`canvas/KeyPreview.tsx`).
- **Layers by name, everywhere:** as GLIDE does, a layer key reads as its layer's name under the layers mark (the number only for an unnamed layer), a key to the layer named Magic shows the MoErgo logo, and every screen line names layers. The label functions take the layout's names (`LayerNames`); screens get them bound through `ui/useKeyText.ts`.
- **The canvas pans as GLIDE's does:** drag any empty spot at any zoom; at least 80% of the keyboard stays in view (`canvas/pan.ts`, GLIDE's `clampPan`).

## Consequences
- A new colour token: its name in `index.css` `@theme`, its value in `themeTokens`; `themes.test.ts` fails otherwise and checks every theme's contrast.
- A new key picture: an entry in `keyIconData.ts` and a line in `keyFace.ts`; never a colour in the picture.
- No custom key decorations yet (GLIDE's per-key pictures and colours); `special-custom` is kept for them.
