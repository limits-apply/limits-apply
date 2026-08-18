/**
 * Reads the drift report `pnpm refresh:check` just wrote and decides whether it
 * is real signal or noise. `aa` failing with no `AA_API_KEY` is expected in any
 * environment without one — CI included — and must never by itself open a PR;
 * every other error or a `drifted: true` on any step is real and does.
 *
 *   node scripts/drift-summary.mjs   prints a markdown summary, exits 1 if real
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPORTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "reports");

const file = existsSync(REPORTS_DIR)
  ? readdirSync(REPORTS_DIR).filter(f => /^drift-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().pop()
  : undefined;
if (!file) {
  console.error("no drift report found — run `pnpm refresh:check` first");
  process.exit(2);
}
const report = JSON.parse(readFileSync(join(REPORTS_DIR, file), "utf8"));

const EXPECTED_AA_NO_KEY = "AA_API_KEY not set";

const lines = [`## Drift report — ${report.date}`, ""];
let real = false;

for (const [name, step] of Object.entries(report.steps)) {
  if (step.error) {
    const expected = name === "aa" && step.error.startsWith(EXPECTED_AA_NO_KEY);
    lines.push(`- **${name}**: error${expected ? " (expected — no AA_API_KEY configured)" : ""} — ${step.error}`);
    if (!expected) real = true;
  } else if (step.drifted) {
    lines.push(`- **${name}**: drifted`);
    real = true;
  } else {
    lines.push(`- **${name}**: unchanged`);
  }
}

console.log(lines.join("\n"));

// The caller reads `real` from this process's exit code (refresh.yml does), not
// from a GITHUB_OUTPUT write here — writing it in both places invites the two
// falling out of sync.
if (real) process.exit(1);
