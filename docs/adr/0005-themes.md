# 0005. Dark and light themes under one set of token names

**Status:** Accepted (decided with the project owner: both themes, dark by default).

## Context
The app had one dark theme, defined as named color tokens in `src/index.css`. The UX redesign needs a light theme as well, without touching every component.

## Decision
- A theme is a set of values for the same `--color-*` names. Dark stays the `@theme` default; light is a second set under `:root[data-theme="light"]`, so components, which use the token names, do not change.
- The choice is a browser-local preference (`src/ui/theme/index.ts`, `localStorage` key `rynk:theme`) applied as `<html data-theme>` before the first render. Anything unknown means dark. The top bar has a toggle.
- `src/ui/theme/themes.test.ts` reads `index.css` and fails if the light theme lacks a token the dark one has, or the other way round, or if a text pair falls below 4.5:1 (a dimmed keycap legend, 3:1) in either theme. The contrast math is in `src/ui/theme/contrast.ts`.

## Consequences
- A new color token must be added to both sets; the test enforces it.
- The test proves legibility, not appearance. Whether the light theme looks right (keycap depth, the lighting preview, the keyboard canvas well) needs a visual review in a browser; the first pass of values is a proposal.
- Hard-coded colors in components (the LED colors and the hue gradients are data, not theme) are not themed. The only black or white classes found are the two `border-white` colour-picker handles.
- The connect screen, shown before a keyboard is open, has no toggle yet; it follows the saved choice.
