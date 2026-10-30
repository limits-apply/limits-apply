/**
 * The same "oldest verification wins" computation `src/ui/freshness.ts` renders
 * on the page — reimplemented here without a TypeScript runtime, for CI. Reads
 * the dated inputs the two share: `plans.json`'s per-row `verified` dates
 * (VERIFIED_ON), the AA snapshot each of `aa.ts`/`local-models.ts` actually
 * imports (not just the newest dated file on disk — the one the app really
 * reads), the oldest access record in `aa.ts` (`PLAN_ACCESS_VERIFIED`), and the
 * two hand-maintained dates in `silicon.ts`/`local-measurements.ts`.
 *
 *   node scripts/freshness.mjs           prints the oldest date, nothing else
 *   node scripts/freshness.mjs --table   prints every source with its age, so
 *                                        one fresh file cannot hide a stale one
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, importedSnapshot } from "./resolve-import.mjs";

const read = (path) => readFileSync(join(ROOT, path), "utf8");

function constValue(tsFile, exportName, pattern) {
  const m = read(tsFile).match(new RegExp(`export const ${exportName} = ${pattern}`));
  if (!m) throw new Error(`${tsFile}: ${exportName} not found`);
  return m[1];
}
const constDate = (tsFile, exportName) => constValue(tsFile, exportName, '"([^"]+)"');

/**
 * The oldest `verified:` literal in `aa.ts` — the per-plan access records in
 * `VERIFIED_PLAN_ACCESS`. `PLAN_ACCESS_VERIFIED` is the same value computed in
 * TypeScript; `test/freshness.test.ts` holds this read to the page's own.
 */
function planAccessVerifiedOn() {
  const dates = [...read("src/data/aa.ts").matchAll(/verified: "(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]);
  if (!dates.length) throw new Error("src/data/aa.ts: no access `verified:` dates found");
  return dates.reduce((a, b) => (a < b ? a : b));
}

const plans = JSON.parse(read("src/data/plans.json"));
const verifiedOn = plans.reduce((oldest, plan) => (plan.verified < oldest ? plan.verified : oldest), plans[0].verified);
const staleDays = Number(constValue("src/data/plans.ts", "STALE_DAYS", "(\\d+)"));

const SOURCES = [
  ["plan pricing (`plans.json`)", verifiedOn],
  ["AA snapshot (`aa.ts`)", importedSnapshot("src/data/aa.ts").snapshot.retrieved_on],
  ["AA small-tier (`local-models.ts`)", importedSnapshot("src/data/local-models.ts").snapshot.retrieved_on],
  ["plan access (`aa.ts`)", planAccessVerifiedOn()],
  ["silicon (`silicon.ts`)", constDate("src/data/silicon.ts", "SILICON_VERIFIED")],
  ["local measurements (`local-measurements.ts`)", constDate("src/data/local-measurements.ts", "MEASUREMENTS_VERIFIED")],
];

const oldest = SOURCES.reduce((a, [, date]) => (date < a ? date : a), SOURCES[0][1]);

if (!process.argv.includes("--table")) {
  console.log(oldest);
} else {
  const age = (date) => Math.floor((Date.now() - Date.parse(date)) / 86400000);
  const state = (date) => (age(date) > staleDays ? "**stale**" : "ok");
  console.log("| source | oldest | age (days) | state |");
  console.log("| --- | --- | --- | --- |");
  for (const [name, date] of SOURCES) console.log(`| ${name} | ${date} | ${age(date)} | ${state(date)} |`);
  console.log(`| **oldest across the site** | **${oldest}** | ${age(oldest)} | ${state(oldest)} |`);
}
