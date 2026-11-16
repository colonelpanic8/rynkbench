import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareWithBaseline, key } from "./boundaries";
import { findProbes, isProbeChecked, PROBE_WHY } from "./probing";

const ROOT = new URL("../../", import.meta.url);
const BASELINE = new URL("probing.baseline.json", import.meta.url);

function readUiSources(dir = "src/ui"): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of readdirSync(new URL(`${dir}/`, ROOT))) {
    const path = `${dir}/${name}`;
    if (statSync(new URL(path, ROOT)).isDirectory()) Object.assign(files, readUiSources(path));
    else if (/\.(ts|tsx)$/.test(name)) files[path] = readFileSync(new URL(path, ROOT), "utf8");
  }
  return files;
}

describe("the probing rule itself", () => {
  it("applies to production UI code only", () => {
    expect(isProbeChecked("src/ui/lighting/BackgroundPanel.tsx")).toBe(true);
    expect(isProbeChecked("src/ui/lighting/BackgroundPanel.test.tsx")).toBe(false);
    expect(isProbeChecked("src/ui/state.tsx")).toBe(false);
    expect(isProbeChecked("src/ui/bundle.ts")).toBe(false);
    expect(isProbeChecked("src/session/link-session.ts")).toBe(false);
  });

  it("finds bundle reads and null tests, and leaves value reads alone", () => {
    const probes = findProbes({
      "src/ui/a.tsx": [
        "const s = bundle.sceneStatus;",
        "if (state.lightingExtension !== null) {}",
        "if (state.pointingConfig === null) {}",
        "const w = state.lightingOutputMode?.wake_layers;",
        "const ok = capabilities.has('lighting.scenes');",
      ].join("\n"),
    });
    expect(probes.map((p) => p.to)).toEqual([
      "bundle.sceneStatus#1",
      "state.lightingExtension !== null#1",
      "state.pointingConfig === null#1",
    ]);
  });

  it("counts a null test on the bundle once, not as a read and a test", () => {
    const probes = findProbes({ "src/ui/a.tsx": "if (bundle.sceneStatus !== null) {}" });
    expect(probes.map((p) => p.to)).toEqual(["bundle.sceneStatus !== null#1"]);
  });

  it("numbers repeats, so a second identical probe is a new entry", () => {
    const probes = findProbes({ "src/ui/a.tsx": "bundle.sceneStatus; bundle.sceneStatus;" });
    expect(probes.map((p) => p.to)).toEqual(["bundle.sceneStatus#1", "bundle.sceneStatus#2"]);
  });
});

describe("capability probing (ratchet)", () => {
  it("has no probe beyond the baseline, and the baseline holds nothing fixed", () => {
    const probes = findProbes(readUiSources());
    const keys = [...new Set(probes.map(key))].sort();

    if (process.env.UPDATE_ARCH_BASELINE) {
      writeFileSync(BASELINE, `${JSON.stringify(keys, null, 2)}\n`);
      return;
    }

    const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as string[];
    const { added, fixed } = compareWithBaseline(probes, baseline);
    expect(
      added.map((k) => `${k}\n    ${PROBE_WHY}`),
      "New capability probing in a screen. Use useCapability / useCapabilities instead; do not add it to the baseline.",
    ).toEqual([]);
    expect(
      fixed,
      "These probes are gone. Remove them from the baseline: UPDATE_ARCH_BASELINE=1 npx vitest run src/architecture",
    ).toEqual([]);
  });
});
