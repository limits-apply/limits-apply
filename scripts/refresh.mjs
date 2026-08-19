/**
 * Refreshes the third-party snapshots under `data/`. Run by hand, never by
 * the build: a figure that moved without a verification date is the failure the
 * whole ladder exists to prevent, and `pnpm test` asserts counts that a live fetch
 * would make non-deterministic.
 *
 * Acquisition ported from cairn `apps/landing/src/discover/lib/{opencode,openrouter,
 * modelsdev}.ts`, with one deliberate inversion: cairn degrades to a seeded fallback
 * so its page never hard-fails, which here would manufacture a figure with no honest
 * rung. Every failure below exits non-zero instead, leaving the last good snapshot
 * standing.
 *
 * Two modes:
 *   node scripts/refresh.mjs [step]          fetch and write dated snapshots
 *   node scripts/refresh.mjs --check [step]   fetch, diff against the committed
 *                                             snapshots, write a dated drift
 *                                             report, exit non-zero if anything
 *                                             moved. Never writes a snapshot file.
 *
 *   step is one of: opencode, releases, prices, access, aa, ecb, pricing
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { importedSnapshot } from "./resolve-import.mjs";
import { fetchOpenCode, summarizeOpenCode } from "./sources/opencode.mjs";
import { fetchReleases, summarizeReleases } from "./sources/releases.mjs";
import { checkOpenRouter, summarizeOpenRouter } from "./sources/openrouter.mjs";
import { checkModelsDev, summarizeModelsDev } from "./sources/models-dev.mjs";
import { fetchFx, summarizeFx } from "./sources/ecb.mjs";
import { fetchAa, mergeAa, summarizeAa } from "./sources/aa.mjs";
import { fetchAaSmall, mergeAaSmall, summarizeAaSmall } from "./sources/aa-small.mjs";
import { checkPricing, summarizePricing } from "./sources/pricing.mjs";

const DATA_DIR = new URL("../data/", import.meta.url).pathname;
const REPORTS_DIR = new URL("../public/reports/", import.meta.url).pathname;
const today = new Date().toISOString().slice(0, 10);

/* ---------- shared snapshot lookups ---------- */

/** The AA models snapshot `src/data/aa.ts` actually imports right now. */
function aaModels() {
  const { file, snapshot } = importedSnapshot("src/data/aa.ts");
  const names = [...new Set(snapshot.models.map(m => m.name))];
  return { file, names, ...snapshot };
}

/** The AA small-tier snapshot `src/data/local-models.ts` actually imports right now. */
function aaSmall() {
  const { file, snapshot } = importedSnapshot("src/data/local-models.ts");
  return { file, ...snapshot };
}

function loadPlans() {
  return JSON.parse(readFileSync(new URL("../src/data/plans.json", import.meta.url).pathname, "utf8"));
}

/** True when the meaningful payload changed — ignores `retrieved_on`, which always differs. */
function drifted(previous, fetched, key = "models") {
  if (!previous) return true;
  return JSON.stringify(previous[key]) !== JSON.stringify(fetched[key]);
}

/* ---------- the two modes ---------- */

const STEP_NAMES = ["opencode", "releases", "ecb", "aa", "aa-small", "prices", "access", "pricing"];
const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const only = args.find(a => a !== "--check");
if (only && !STEP_NAMES.includes(only)) {
  console.error(`unknown step ${only} — expected one of ${STEP_NAMES.join(", ")}`);
  process.exit(2);
}

const report = { date: today, check: CHECK, steps: {} };
let anyDrift = false;
let anyError = false;

/** A write-capable step: fetches, then either writes a dated file or diffs against the latest one. */
async function runWriteStep(name, prefix, fetcher, summarize, diffKey = "models", resolvePrevious) {
  if (only && only !== name) return;
  try {
    const fetched = await fetcher();
    if (CHECK) {
      const previous = resolvePrevious();
      const changed = drifted(previous, fetched, diffKey);
      report.steps[name] = changed ? { drifted: true, detail: summarize(fetched) } : { drifted: false };
      if (changed) anyDrift = true;
      console.log(`${name} · ${changed ? "drift detected" : "unchanged"} vs. the committed snapshot`);
      if (changed) console.log(summarize(fetched));
    } else {
      const file = join(DATA_DIR, `${prefix}${today}.json`);
      writeFileSync(file, JSON.stringify({ retrieved_on: today, ...fetched }, null, 2) + "\n");
      console.log(summarize(fetched));
      console.log(`  → data/${prefix}${today}.json`);
    }
  } catch (error) {
    anyError = true;
    report.steps[name] = { error: error.message };
    console.error(`${name} failed: ${error.message}`);
    console.error("  the previous snapshot is untouched — fix the feed, do not hand-write its output.");
  }
}

/** A report-only step: never writes a snapshot, in either mode. */
async function runReportStep(name, fetcher, summarize, isDrift) {
  if (only && only !== name) return;
  try {
    const result = await fetcher();
    console.log(summarize(result));
    if (CHECK) {
      const changed = isDrift(result);
      report.steps[name] = { drifted: changed, result };
      if (changed) anyDrift = true;
    }
  } catch (error) {
    anyError = true;
    report.steps[name] = { error: error.message };
    console.error(`${name} failed: ${error.message}`);
  }
}

await runWriteStep("opencode", "opencode-go-", fetchOpenCode, summarizeOpenCode, "models",
  () => importedSnapshot("src/data/opencode.ts").snapshot);

await runWriteStep("releases", "model-releases-", async () => fetchReleases(aaSmall().models.map(m => m.name)), summarizeReleases,
  "models", () => importedSnapshot("src/data/local-releases.ts").snapshot);

await runWriteStep("ecb", "fx-rates-", fetchFx, summarizeFx, "rates",
  () => importedSnapshot("src/data/plans.ts").snapshot);

await runWriteStep("aa", "artificial-analysis-", async () => {
  const fetched = await fetchAa();
  const previous = aaModels();
  return mergeAa(previous, fetched);
}, summarizeAa, "models", () => aaModels());

await runWriteStep("aa-small", "artificial-analysis-small-", async () => {
  const fetched = await fetchAaSmall();
  return mergeAaSmall(aaSmall(), fetched);
}, summarizeAaSmall, "models", () => aaSmall());

await runReportStep("prices", async () => {
  const { names, models } = aaModels();
  return checkOpenRouter(names, models);
}, summarizeOpenRouter, r => r.misses.length > 0 || r.belowOutputCost.length > 0);

await runReportStep("access", async () => checkModelsDev(aaModels().names), summarizeModelsDev,
  r => r.leads.some(lead => lead.providers.length === 0));

await runReportStep("pricing", async () => checkPricing(loadPlans()), summarizePricing,
  r => r.results.some(row => row.outcome === "changed" || row.outcome === "blocked"));

/* ---------- drift report ---------- */

if (CHECK && Object.keys(report.steps).length) {
  mkdirSync(REPORTS_DIR, { recursive: true });
  const file = join(REPORTS_DIR, `drift-${today}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
  console.log(`\ndrift report → public/reports/drift-${today}.json`);
}

if (anyError || (CHECK && anyDrift)) process.exit(1);
