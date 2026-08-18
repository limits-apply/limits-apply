/**
 * The same "oldest verification wins" computation `src/ui/freshness.ts` renders
 * on the page — reimplemented here without a TypeScript runtime, for CI. Reads
 * the same five inputs: `plans.json`'s per-row `verified` dates (VERIFIED_ON),
 * the AA snapshot each of `aa.ts`/`local-models.ts` actually imports (not just
 * the newest dated file on disk — the one the app really reads), and the two
 * hand-maintained dates in `silicon.ts`/`local-measurements.ts`.
 *
 *   node scripts/freshness.mjs   prints the oldest date, nothing else
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, importedSnapshot } from "./resolve-import.mjs";

const read = path => readFileSync(join(ROOT, path), "utf8");

function constDate(tsFile, exportName) {
  const m = read(tsFile).match(new RegExp(`export const ${exportName} = "([^"]+)"`));
  if (!m) throw new Error(`${tsFile}: ${exportName} not found`);
  return m[1];
}

const plans = JSON.parse(read("src/data/plans.json"));
const verifiedOn = plans.reduce((oldest, plan) => (plan.verified < oldest ? plan.verified : oldest), plans[0].verified);

const dates = [
  verifiedOn,
  importedSnapshot("src/data/aa.ts").snapshot.retrieved_on,
  importedSnapshot("src/data/local-models.ts").snapshot.retrieved_on,
  constDate("src/data/silicon.ts", "SILICON_VERIFIED"),
  constDate("src/data/local-measurements.ts", "MEASUREMENTS_VERIFIED"),
];

console.log(dates.reduce((a, b) => (a < b ? a : b)));
