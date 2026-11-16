// Runs vitest and prints only what needs attention: each failing test with the
// start of its message, then the totals (after GLIDE's scripts/testQuiet.mjs).
// Made for Claude: a failing test can otherwise print a whole keymap as a diff.
//   npm run t -- src/sync src/ui/draft/sendStaged.test.ts      (no paths: everything)
// Unlike `npm test` it does not build the WASM clients first (see npm run wasm:ci).
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const out = path.join(tmpdir(), `rynkbench-vitest-${process.pid}.json`);
spawnSync("npx", ["vitest", "run", "--reporter=json", `--outputFile=${out}`, ...process.argv.slice(2)], {
  stdio: ["ignore", "ignore", "ignore"],
});
let report;
try {
  report = JSON.parse(readFileSync(out, "utf8"));
  rmSync(out);
} catch {
  console.log("vitest gave no report: run it directly (npx vitest run …) to see why.");
  process.exit(1);
}

const cut = (text, n) => (text.length > n ? `${text.slice(0, n)} …` : text);
const indent = (text) => text.replace(/\n/g, "\n  ");
let unrunnable = 0;
for (const file of report.testResults) {
  const name = path.relative(process.cwd(), file.name);
  const failed = file.assertionResults.filter((test) => test.status === "failed");
  if (file.status === "failed" && failed.length === 0) {
    unrunnable += 1;
    console.log(`✗ ${name}\n  ${indent(cut(String(file.message || "failed to run"), 800))}`);
  }
  for (const test of failed) {
    const message = (test.failureMessages ?? []).join("\n").replace(/\n\s+at [\s\S]*$/, "");
    console.log(`✗ ${name} › ${test.fullName}\n  ${indent(cut(message, 800))}`);
  }
}
const { numPassedTests: passed, numFailedTests: failedTests } = report;
const bad = failedTests > 0 || unrunnable > 0;
const files = report.testResults.length;
console.log(
  `${bad ? "✗" : "✓"} ${passed} passed, ${failedTests} failed` +
    `${unrunnable ? `, ${unrunnable} file${unrunnable === 1 ? "" : "s"} could not run` : ""} (${files} files)`,
);
process.exit(bad ? 1 : 0);
