import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOUNDARY_RULES, compareWithBaseline, findViolations, importSpecifiers, key, layerOf, resolveSpecifier } from "./boundaries";

const ROOT = new URL("../../", import.meta.url);
const BASELINE = new URL("boundaries.baseline.json", import.meta.url);

function readSources(dir = "src"): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of readdirSync(new URL(`${dir}/`, ROOT))) {
    const path = `${dir}/${name}`;
    if (statSync(new URL(path, ROOT)).isDirectory()) {
      if (name !== "node_modules" && path !== "src/vendor") Object.assign(files, readSources(path));
    } else if (/\.(ts|tsx)$/.test(name)) {
      files[path] = readFileSync(new URL(path, ROOT), "utf8");
    }
  }
  return files;
}

describe("the rules themselves", () => {
  it("finds static, type-only, re-exported, multi-line and dynamic imports", () => {
    const source = [
      'import { a } from "./a";',
      'import type { B } from "../b";',
      'export { c } from "./c";',
      "import {\n  d,\n  e,\n} from './d';",
      'import "./side-effect";',
      'const f = await import("./f");',
      'import React from "react";',
    ].join("\n");
    expect(importSpecifiers(source)).toEqual(["./a", "../b", "./c", "./d", "./side-effect", "./f", "react"]);
  });

  it("resolves relative specifiers and ignores packages", () => {
    expect(resolveSpecifier("src/ui/device/x.tsx", "../state")).toBe("src/ui/state");
    expect(resolveSpecifier("src/ui/x.tsx", "../vendor/rynk-wasm/rynk_wasm.js")).toBe("src/vendor/rynk-wasm/rynk_wasm");
    expect(resolveSpecifier("src/ui/x.tsx", "react")).toBeUndefined();
  });

  it("names the layer of a path", () => {
    expect(layerOf("src/ui/App.tsx")).toBe("ui");
    expect(layerOf("src/main.tsx")).toBe("app");
    expect(layerOf("src/domain")).toBe("domain"); // a folder import resolves to its index
    expect(layerOf("src/App")).toBe("app");
  });

  it("flags each kind of violation and nothing else", () => {
    const violations = findViolations({
      "src/config/x.ts": 'import { s } from "../ui/state";',
      "src/ui/y.tsx": 'import type { K } from "../vendor/rynk-wasm/rynk_wasm";\nimport { m } from "../session/webhid";',
      "src/ui/ok.tsx": 'import { t } from "../session/types";',
      "src/ui/y.test.tsx": 'import { m } from "../session/webhid";',
      "src/capabilities/a.ts": 'import type { T } from "../model/keyboard";\nimport { u } from "./b";',
      "src/domain/graph.ts": 'import type { K } from "../vendor/rynk-wasm/rynk_wasm";\nimport { s } from "../session/types";',
      "src/domain/sources.ts": 'import type { K } from "../vendor/rynk-wasm/rynk_wasm";\nimport { c } from "../model/combos";',
    });
    expect(violations.map((v) => v.rule).sort()).toEqual([
      "capabilities-are-self-contained",
      "core-never-imports-ui",
      "domain-imports-only-model",
      "domain-wire-only-in-sources",
      "ui-never-imports-backends",
      "ui-never-imports-wire-types",
    ]);
  });

  it("keeps the workbench between the core layers and the screens", () => {
    const violations = findViolations({
      "src/workbench/a.ts": 'import { s } from "../ui/state";\nimport { m } from "../session/mock/board";',
      "src/workbench/ok.ts": 'import { p } from "../sync";\nimport type { R } from "../session/types";',
      "src/sync/b.ts": 'import { w } from "../workbench";',
      "src/ui/ok.tsx": 'import { w } from "../workbench";',
    });
    expect(violations.map((v) => `${v.rule} ${v.from}`).sort()).toEqual([
      "core-below-the-workbench src/sync/b.ts",
      "core-never-imports-ui src/workbench/a.ts",
      "workbench-uses-the-session-interface src/workbench/a.ts",
    ]);
  });
});

describe("architecture boundaries (ratchet)", () => {
  it("has no violation beyond the baseline, and the baseline holds nothing fixed", () => {
    const violations = findViolations(readSources());
    const keys = [...new Set(violations.map(key))].sort();

    if (process.env.UPDATE_ARCH_BASELINE) {
      writeFileSync(BASELINE, `${JSON.stringify(keys, null, 2)}\n`);
      return;
    }

    const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as string[];
    const { added, fixed } = compareWithBaseline(violations, baseline);
    const why = (k: string) => BOUNDARY_RULES.find((r) => k.startsWith(`${r.id} `))?.why ?? "";

    expect(
      added.map((k) => `${k}\n    ${why(k)}`),
      "New architecture violations. Fix them; do not add them to the baseline.",
    ).toEqual([]);
    expect(
      fixed,
      "These violations are fixed. Remove them from the baseline: UPDATE_ARCH_BASELINE=1 npx vitest run src/architecture",
    ).toEqual([]);
  });
});
