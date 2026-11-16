// Architecture boundaries, as code. The layering the foundation plan describes
// (docs/adr/0001-layering.md) is only real if a test fails when it is broken,
// so every rule here is checked against the actual imports of src/.
//
// Existing violations are recorded in boundaries.baseline.json and may only
// shrink: a new violation fails the test, and so does a baseline entry that
// has since been fixed (remove it by running the test with
// UPDATE_ARCH_BASELINE=1). That is the ratchet: the count can go down, never up.
//
// Pure on purpose: no file system access, so the rules can be tested on text.

export interface Violation {
  rule: string;
  /** Importing file, relative to the project root, e.g. `src/ui/App.tsx`. */
  from: string;
  /** Imported module, resolved and relative to the project root, no extension. */
  to: string;
}

export interface BoundaryRule {
  id: string;
  /** Why the rule exists; shown when it fails. */
  why: string;
  /** Whether `from` importing `to` breaks the rule. */
  breaks(from: string, to: string): boolean;
}

const LAYER_FOLDERS = new Set([
  "session", "config", "model", "layers", "firmware", "capabilities", "domain", "sync", "workbench", "ui", "vendor", "architecture",
]);

/** Top-level folder of a project-relative path: `src/ui/x.ts` is `ui`, and a
 *  file directly in `src/` is `app`. An import of a folder itself (`src/domain`,
 *  which resolves to its index) belongs to that folder. */
export function layerOf(path: string): string {
  const parts = path.split("/");
  if (parts[0] !== "src") return "outside";
  if (parts.length === 2 && LAYER_FOLDERS.has(parts[1])) return parts[1];
  return parts.length > 2 ? parts[1] : "app";
}

/** Below the workbench: everything the workbench may build on. */
const BELOW_WORKBENCH = ["session", "config", "model", "layers", "firmware", "capabilities", "domain", "sync"];
const CORE_LAYERS = new Set([...BELOW_WORKBENCH, "workbench"]);
const BACKENDS = ["webhid", "webserial", "webbluetooth", "native", "native-ble", "offline", "mock"];

export const BOUNDARY_RULES: BoundaryRule[] = [
  {
    id: "core-never-imports-ui",
    why: "Logic must run without the screen: session, config, model, layers, firmware, sync and the workbench never import ui or the app shell.",
    breaks: (from, to) => CORE_LAYERS.has(layerOf(from)) && ["ui", "app"].includes(layerOf(to)),
  },
  {
    id: "capabilities-are-self-contained",
    why: "The capability layer sits below everything that uses it: it imports nothing but itself, not the wire package, session, model or screens.",
    breaks: (from, to) => layerOf(from) === "capabilities" && layerOf(to) !== "capabilities",
  },
  {
    id: "domain-imports-only-model",
    why: "The domain layer reads from the model and nothing above or beside it: not the session, config, capabilities or screens.",
    breaks: (from, to) => layerOf(from) === "domain" && !["domain", "model", "vendor"].includes(layerOf(to)),
  },
  {
    id: "domain-wire-only-in-sources",
    why: "Only the edge table (src/domain/sources.ts) knows the protocol's action shapes; the rest of the domain is free of the wire package.",
    breaks: (from, to) =>
      layerOf(from) === "domain" && from !== "src/domain/sources.ts" && to.startsWith("src/vendor/"),
  },
  {
    id: "ui-never-imports-wire-types",
    why: "Screens speak domain types, not one protocol's wire types: nothing under src/ui imports the generated Rynk package.",
    breaks: (from, to) => layerOf(from) === "ui" && to.startsWith("src/vendor/rynk-wasm"),
  },
  {
    id: "sync-uses-the-session-interface",
    why: "The write path (src/sync, ADR 0012) works for every keyboard: it uses the session interface, never a transport or a simulated board.",
    breaks: (from, to) =>
      layerOf(from) === "sync" && BACKENDS.some((b) => to === `src/session/${b}` || to.startsWith(`src/session/${b}/`)),
  },
  {
    id: "core-below-the-workbench",
    why: "The workbench (ADR 0017) sits on the core layers and below the screens: nothing it builds on imports it.",
    breaks: (from, to) => BELOW_WORKBENCH.includes(layerOf(from)) && layerOf(to) === "workbench",
  },
  {
    id: "workbench-uses-the-session-interface",
    why: "The workbench writes to every keyboard the same way: through the session interface, never a transport or a simulated board.",
    breaks: (from, to) =>
      layerOf(from) === "workbench" && BACKENDS.some((b) => to === `src/session/${b}` || to.startsWith(`src/session/${b}/`)),
  },
  {
    id: "ui-never-imports-backends",
    why: "Screens never reach a transport or simulated backend directly; they use the session interface.",
    breaks: (from, to) =>
      layerOf(from) === "ui" && BACKENDS.some((b) => to === `src/session/${b}` || to.startsWith(`src/session/${b}/`)),
  },
];

const IMPORT_RE =
  /(?:\bimport|\bexport)\s+(?:type\s+)?(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;

/** Module specifiers a source text imports (static, re-exported and dynamic). */
export function importSpecifiers(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(IMPORT_RE)) found.push(match[1] ?? match[2]);
  return found;
}

function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

/** A relative specifier resolved against its importer, without extension;
 *  `undefined` for packages (react, vite, ...). */
export function resolveSpecifier(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const dir = from.split("/").slice(0, -1).join("/");
  return normalize(`${dir}/${specifier}`).replace(/\.(tsx?|jsx?|css|json|wasm)$/, "");
}

/** Whether a file is production code the rules apply to. */
export function isChecked(path: string): boolean {
  return (
    /^src\/.*\.(ts|tsx)$/.test(path) &&
    !/\.test\.(ts|tsx)$/.test(path) &&
    !path.startsWith("src/vendor/") &&
    !path.startsWith("src/architecture/")
  );
}

/** Every rule violation in the given files (path to source text), sorted. */
export function findViolations(files: Record<string, string>): Violation[] {
  const violations: Violation[] = [];
  for (const [from, source] of Object.entries(files)) {
    if (!isChecked(from)) continue;
    for (const specifier of importSpecifiers(source)) {
      const to = resolveSpecifier(from, specifier);
      if (to === undefined) continue;
      for (const rule of BOUNDARY_RULES) {
        if (rule.breaks(from, to)) violations.push({ rule: rule.id, from, to });
      }
    }
  }
  return violations.sort((a, b) => key(a).localeCompare(key(b)));
}

export const key = (v: Violation): string => `${v.rule} ${v.from} -> ${v.to}`;

/** Compare violations with the baseline: what is new and what was fixed. */
export function compareWithBaseline(
  violations: Violation[],
  baseline: string[],
): { added: string[]; fixed: string[] } {
  const now = new Set(violations.map(key));
  const before = new Set(baseline);
  return {
    added: [...now].filter((k) => !before.has(k)).sort(),
    fixed: [...before].filter((k) => !now.has(k)).sort(),
  };
}
