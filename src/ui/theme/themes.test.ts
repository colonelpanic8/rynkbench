import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeTheme } from "./index";
import { THEME_IDS, contrast, keyTextOn, themeList, themeTokens, themesCss } from "./themes";

const css = readFileSync(fileURLToPath(new URL("../../index.css", import.meta.url)), "utf8");

/** The token names index.css declares (Tailwind makes the utilities from these). */
function declaredTokens(): string[] {
  const start = css.indexOf("@theme {");
  const block = css.slice(start, css.indexOf("\n}", start));
  return [...block.matchAll(/--color-([a-z-]+):/g)].map((match) => match[1]).sort();
}

describe("themes", () => {
  it("each set exactly the tokens index.css declares", () => {
    for (const id of THEME_IDS) expect(Object.keys(themeTokens(id)).sort(), id).toEqual(declaredTokens());
  });

  it("are written as one CSS block each, chosen by <html data-theme>", () => {
    const text = themesCss();
    for (const id of THEME_IDS) expect(text).toContain(`:root[data-theme="${id}"] {`);
  });

  it("list dark themes first, each scheme with its Default first", () => {
    expect(themeList().map((theme) => `${theme.scheme}:${theme.name}`)).toEqual([
      "dark:Default Dark", "dark:Nebula", "dark:Volt", "light:Default Light", "light:Light", "light:Oat",
    ]);
  });

  it("fall back to Default Dark for anything that is not a theme, and keep saved dark and light", () => {
    expect(normalizeTheme("light")).toBe("light");
    expect(normalizeTheme("nebula")).toBe("nebula");
    expect(normalizeTheme("sepia")).toBe("dark");
    expect(normalizeTheme(null)).toBe("dark");
  });
});

// Text needs 4.5:1 (WCAG AA); a dimmed keycap legend, which is graphical, 3:1.
const surfaces = ["bg", "well", "panel", "raised", "hover"];
const pairs: { fg: string; on: string[]; min: number }[] = [
  { fg: "ink", on: surfaces, min: 4.5 },
  { fg: "mute", on: surfaces, min: 4.5 },
  { fg: "faint", on: ["bg", "panel", "raised"], min: 4.5 },
  { fg: "accent", on: ["bg", "panel", "raised"], min: 4.5 },
  { fg: "danger", on: ["bg", "panel", "raised"], min: 4.5 },
  { fg: "ok", on: ["bg", "panel", "raised"], min: 4.5 },
  { fg: "warn", on: ["bg", "panel", "raised"], min: 4.5 },
  { fg: "cap-ink", on: ["cap"], min: 4.5 },
  { fg: "cap-ink-dim", on: ["cap"], min: 3 },
  // Primary buttons: on-accent text on the accent fill.
  { fg: "on-accent", on: ["accent-fill", "accent-deep"], min: 4.5 },
  // The selected key's outline against the canvas.
  { fg: "select", on: ["well"], min: 3 },
];

for (const id of THEME_IDS) {
  describe(`${id} theme contrast`, () => {
    const tokens = themeTokens(id);
    for (const { fg, on, min } of pairs) {
      for (const surface of on) {
        it(`${fg} on ${surface} is at least ${min}:1`, () => {
          expect(contrast(tokens[fg], tokens[surface])).toBeGreaterThanOrEqual(min);
        });
      }
    }
    it("has readable text on every special-key colour", () => {
      for (const kind of ["special-custom", "special-bluetooth", "special-action"]) {
        expect(contrast(keyTextOn(tokens[kind], tokens), tokens[kind]), kind).toBeGreaterThanOrEqual(4.5);
        expect(tokens[`${kind}-ink`], kind).toBe(keyTextOn(tokens[kind], tokens));
      }
    });
  });
}
