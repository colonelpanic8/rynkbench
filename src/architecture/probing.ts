// Screens ask what the keyboard can do through capabilities (src/capabilities),
// not by testing the nullable reads connecting left on the bundle. This guard
// finds the old pattern in src/ui so it can only shrink, the same ratchet as
// the import boundaries (docs/adr/0002-capability-contract.md).
//
// A probe is either of:
//  - any read of a connect-time capability field through `bundle.`, which a
//    screen should take from the capability set instead; or
//  - an explicit null test of a capability-backed field, on `bundle.` or on
//    the live `state.`, which asks for presence the long way round.
//
// Not covered: reading a live value (`state.lightingOutputMode.wake_layers`),
// which is use of the value rather than a presence test. `state.tsx` and
// `bundle.ts` build and seed that state and are exempt.
//
// Pure: it works on file text, so the rule can be tested without a file system.

import type { Violation } from "./boundaries";

const FIELDS = "sceneStatus|runtimeConditionalStatus|compiledSceneStatus|lightingExtension|pointingConfig|lightingState|lightingOutputMode";

export const PROBE_RULE = "ui-never-probes-capability-fields";

export const PROBE_WHY =
  "Ask the capability set (useCapability / useCapabilities) whether the keyboard has a surface, not whether a connect-time read came back null.";

const BUNDLE_READ = new RegExp(`\\bbundle\\.(?:${FIELDS})\\b`, "g");
const NULL_TEST = new RegExp(`\\b(?:state|bundle)\\.(?:${FIELDS})\\s*(?:!==|===|!=|==)\\s*null\\b`, "g");

const EXEMPT = new Set(["src/ui/state.tsx", "src/ui/bundle.ts"]);

/** Whether the guard applies to a file: production code under src/ui. */
export function isProbeChecked(path: string): boolean {
  return (
    path.startsWith("src/ui/") &&
    /\.(ts|tsx)$/.test(path) &&
    !/\.test\.(ts|tsx)$/.test(path) &&
    !EXEMPT.has(path)
  );
}

function occurrences(source: string): string[] {
  const nullTests = [...source.matchAll(NULL_TEST)];
  // A null test on `bundle.` also matches the plain read at the same spot;
  // count each place once, as the longer match.
  const testStarts = new Set(nullTests.map((m) => m.index));
  const reads = [...source.matchAll(BUNDLE_READ)].filter((m) => !testStarts.has(m.index));
  const texts = [...reads, ...nullTests]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((m) => m[0].replace(/\s+/g, " "));
  const seen = new Map<string, number>();
  const out: string[] = [];
  for (const text of texts) {
    const n = (seen.get(text) ?? 0) + 1;
    seen.set(text, n);
    out.push(`${text}#${n}`);
  }
  return out;
}

/** Every probe in the given files (path to source text), sorted. Repeats of the
 *  same text in one file are numbered, so adding a second one is a new entry. */
export function findProbes(files: Record<string, string>): Violation[] {
  const found: Violation[] = [];
  for (const [from, source] of Object.entries(files)) {
    if (!isProbeChecked(from)) continue;
    for (const to of occurrences(source)) found.push({ rule: PROBE_RULE, from, to });
  }
  return found.sort((a, b) => `${a.from} ${a.to}`.localeCompare(`${b.from} ${b.to}`));
}
