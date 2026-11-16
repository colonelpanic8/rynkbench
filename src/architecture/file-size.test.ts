// Source files stay small enough to read in one sitting: at most 500 lines. A
// few older files are larger; they may shrink but never grow, and each one
// leaves this list once it is split. Tests and generated code are exempt.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../", import.meta.url);
const BUDGET = 500;

/** Files already over budget, with the size they may not exceed. */
const OVER_BUDGET: Record<string, number> = {
  "src/session/link-session.ts": 1513,
  "src/session/mock/board.ts": 1499,
  "src/ui/lighting/ConditionalRulesPanel.tsx": 1059,
  "src/ui/keymap/ActionEditor.tsx": 696,
  "src/session/mock/glove80.ts": 625,
};

function sources(dir = "src"): string[] {
  const out: string[] = [];
  for (const name of readdirSync(new URL(`${dir}/`, ROOT))) {
    const path = `${dir}/${name}`;
    if (statSync(new URL(path, ROOT)).isDirectory()) {
      if (path !== "src/vendor") out.push(...sources(path));
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts")) {
      out.push(path);
    }
  }
  return out;
}

const lines = (path: string) => (readFileSync(new URL(path, ROOT), "utf8").match(/\n/g) ?? []).length;

describe("file size budget", () => {
  it(`keeps every source file at ${BUDGET} lines or fewer`, () => {
    const over = sources()
      .filter((path) => !(path in OVER_BUDGET))
      .map((path) => [path, lines(path)] as const)
      .filter(([, count]) => count > BUDGET)
      .map(([path, count]) => `${path}: ${count} lines; split it by job`);
    expect(over).toEqual([]);
  });

  it("lets an older large file shrink but never grow", () => {
    const grown = Object.entries(OVER_BUDGET)
      .map(([path, limit]) => [path, lines(path), limit] as const)
      .filter(([, count, limit]) => count > limit)
      .map(([path, count, limit]) => `${path}: ${count} lines, more than its ${limit}`);
    expect(grown).toEqual([]);
  });

  it("drops a file from the list once it is within budget", () => {
    const done = Object.keys(OVER_BUDGET).filter((path) => lines(path) <= BUDGET);
    expect(done).toEqual([]);
  });
});
