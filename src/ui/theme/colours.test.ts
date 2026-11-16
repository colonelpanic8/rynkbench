// The app's own colours come from theme tokens (src/index.css, values in
// src/ui/theme/themes.ts), never from a
// literal (#e55f2e, rgb(…), oklch(…)) or Tailwind's palette (text-red-400,
// bg-white): a literal looks wrong in the other theme and drifts from the
// design. A few files handle colour as data, not as styling, and say why.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../../", import.meta.url);

/** Where the theme tokens get their values (ADR 0014): like index.css, the
 *  definition of the tokens, so it holds the colours themselves. */
const TOKEN_SOURCES = new Set(["src/ui/theme/themes.ts"]);

/** Files that work with colour as data: what they hold is content, not chrome. */
const COLOUR_AS_DATA: Record<string, string> = {
  "src/ui/lighting/ColorPicker.tsx":
    "the hue spectrum, and a picker thumb that must show on every hue in either theme",
  "src/ui/lighting/BackgroundPanel.tsx": "the hue spectrum of the hue slider",
};

const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(/g;
const PALETTE =
  /\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|divide|placeholder|caret|accent)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|white|black)(?:-\d{2,3})?\b/g;

function sources(dir = "src/ui"): string[] {
  const out: string[] = [];
  for (const name of readdirSync(new URL(`${dir}/`, ROOT))) {
    const path = `${dir}/${name}`;
    if (statSync(new URL(path, ROOT)).isDirectory()) out.push(...sources(path));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

describe("colours", () => {
  it("come from theme tokens everywhere in the UI", () => {
    const found: string[] = [];
    for (const path of sources()) {
      if (path in COLOUR_AS_DATA || TOKEN_SOURCES.has(path)) continue;
      const text = readFileSync(new URL(path, ROOT), "utf8");
      // Comments may name a colour; only code counts.
      const code = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      for (const match of [...code.matchAll(LITERAL), ...code.matchAll(PALETTE)]) found.push(`${path}: ${match[0]}`);
    }
    expect(found).toEqual([]);
  });

  it("would catch a literal or a palette class", () => {
    expect("a #fff b rgb(0 0 0) c".match(LITERAL)).toEqual(["#fff", "rgb("]);
    expect("text-red-400 bg-white text-ink bg-accent".match(PALETTE)).toEqual(["text-red-400", "bg-white"]);
  });

  it("lists only files that still need the exception", () => {
    for (const path of Object.keys(COLOUR_AS_DATA)) {
      const code = readFileSync(new URL(path, ROOT), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect([...code.matchAll(LITERAL), ...code.matchAll(PALETTE)].length, path).toBeGreaterThan(0);
    }
  });
});
