// Text uses only the named sizes from src/index.css (caption, small, body, ui,
// title, heading, display). A free size such as `text-[11.5px]` or Tailwind's
// own `text-sm` would drift from the scale, so both fail here. Keycap legends
// are drawn in key units by the canvas and are not class names.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../../", import.meta.url);
const SCALE = ["caption", "small", "body", "ui", "title", "heading", "display"];

function sources(dir = "src"): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const name of readdirSync(new URL(`${dir}/`, ROOT))) {
    const path = `${dir}/${name}`;
    if (statSync(new URL(path, ROOT)).isDirectory()) {
      if (path !== "src/vendor") out.push(...sources(path));
    } else if (name.endsWith(".tsx")) {
      out.push([path, readFileSync(new URL(path, ROOT), "utf8")]);
    }
  }
  return out;
}

const FREE_SIZE = /\btext-\[[0-9.]+(?:px|rem|em)\]/g;
const TAILWIND_SIZE = /\btext-(?:xs|sm|base|lg|[2-9]?xl)\b/g;

describe("typography", () => {
  it("uses only the named text sizes", () => {
    const found: string[] = [];
    for (const [path, text] of sources()) {
      for (const match of [...text.matchAll(FREE_SIZE), ...text.matchAll(TAILWIND_SIZE)]) {
        found.push(`${path}: ${match[0]}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("defines every named size in the stylesheet", () => {
    const css = readFileSync(new URL("src/index.css", ROOT), "utf8");
    for (const name of SCALE) expect(css).toContain(`--text-${name}:`);
  });

  it("would catch a free size", () => {
    expect("a text-[11.5px] b".match(FREE_SIZE)).toEqual(["text-[11.5px]"]);
    expect("a text-sm b text-2xl".match(TAILWIND_SIZE)).toEqual(["text-sm", "text-2xl"]);
    expect("text-small text-body".match(TAILWIND_SIZE)).toBeNull();
  });
});
