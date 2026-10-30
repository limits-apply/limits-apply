/**
 * The one command that keeps the site's third-party data current. Run daily by
 * `.github/workflows/sync.yml`, and by hand whenever `src/data/aa.ts` maps a new
 * model.
 *
 *   node scripts/sync.mjs [step]
 *
 * Every step overwrites one file, `data/<source>.json`; git history is the
 * archive. Which AA models are fetched is read from the `fromSlug(...)` calls in
 * `src/data/aa.ts`, so mapping a model there is the whole act of adding it.
 *
 * Then it proves the result: evidence rebuild, typecheck, tests, build. If any
 * fetch or check fails, every file it touched is restored and it exits non-zero —
 * a feed that broke never reaches the page, and a figure is never carried forward
 * from a page that stopped printing it.
 *
 * Steps: opencode, ecb, aa, aa-small, releases, aa-agents, aa-catalog. With no step,
 * it also prints the price and access checks, which never change a figure.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchOpenCode, summarizeOpenCode } from "./sources/opencode.mjs";
import { fetchReleases, summarizeReleases } from "./sources/releases.mjs";
import { fetchFx, summarizeFx } from "./sources/ecb.mjs";
import { fetchAa, mergeAa, summarizeAa } from "./sources/aa.mjs";
import { fetchAaCatalog, summarizeCatalog } from "./sources/aa-catalog.mjs";
import { fetchAaSmall, mergeAaSmall, summarizeAaSmall } from "./sources/aa-small.mjs";
import { fetchAaAgents, mergeAaAgents, summarizeAaAgents } from "./sources/aa-agents.mjs";
import { mappedSlugsFromSource, membershipLag, summarizeMembership } from "./sources/membership.mjs";
import { checkPricing, summarizePricing } from "./sources/pricing.mjs";
import { checkOpenRouter, summarizeOpenRouter } from "./sources/openrouter.mjs";
import { checkModelsDev, summarizeModelsDev } from "./sources/models-dev.mjs";

const ROOT = join(fileURLToPath(import.meta.url), "../..");
const today = new Date().toISOString().slice(0, 10);

const read = path => readFileSync(join(ROOT, path), "utf8");
const readJson = path => JSON.parse(read(path));

const STEPS = [
  { name: "opencode", file: "data/opencode-go.json", fetch: fetchOpenCode, summarize: summarizeOpenCode },
  { name: "ecb", file: "data/fx-rates.json", fetch: fetchFx, summarize: summarizeFx },
  {
    name: "aa", file: "data/artificial-analysis.json", summarize: summarizeAa,
    fetch: async previous => mergeAa(previous, await fetchAa(mappedSlugsFromSource(read("src/data/aa.ts")))),
  },
  {
    name: "aa-small", file: "data/artificial-analysis-small.json", summarize: summarizeAaSmall,
    fetch: async previous => mergeAaSmall(previous, await fetchAaSmall()),
  },
  {
    name: "releases", file: "data/model-releases.json", summarize: summarizeReleases,
    fetch: () => fetchReleases(readJson("data/artificial-analysis-small.json").models.map(m => m.name)),
  },
  {
    name: "aa-agents", file: "data/artificial-analysis-agents.json", summarize: summarizeAaAgents,
    fetch: async previous => mergeAaAgents(previous, await fetchAaAgents()),
  },
  { name: "aa-catalog", file: "data/aa-catalog.json", fetch: fetchAaCatalog, summarize: summarizeCatalog },
];

const only = process.argv[2];
if (only && !STEPS.some(step => step.name === only)) {
  console.error(`unknown step ${only} — expected one of ${STEPS.map(step => step.name).join(", ")}`);
  process.exit(2);
}

/** Original contents of every file this run writes, restored if anything fails. */
const backup = new Map();
function write(path, content) {
  if (!backup.has(path)) backup.set(path, existsSync(join(ROOT, path)) ? read(path) : null);
  writeFileSync(join(ROOT, path), content);
}
function rollback(reason) {
  for (const [path, content] of backup) if (content != null) writeFileSync(join(ROOT, path), content);
  console.error(`\nsync failed: ${reason}\nevery file it touched is restored.`);
  process.exit(1);
}

for (const step of STEPS.filter(step => !only || step.name === only)) {
  const previous = readJson(step.file);
  let fetched;
  try {
    fetched = await step.fetch(previous);
  } catch (error) {
    rollback(`${step.name}: ${error.message}`);
  }
  write(step.file, JSON.stringify({ retrieved_on: today, ...fetched }, null, 2) + "\n");
  console.log(`${step.summarize(fetched)}\n  → ${step.file}\n`);
}

// The landing states the AA snapshot's version and date in prose.
const aa = readJson("data/artificial-analysis.json");
write("index.html", read("index.html").replace(/Intelligence Index v[\w.-]+ · snapshot \d{4}-\d{2}-\d{2}/,
  `Intelligence Index v${aa.intelligence_index_version} · snapshot ${aa.retrieved_on}`));

// A model AA scores that no plan maps yet is a roster question for a person, not a
// figure this run can fill — printed here, turned into an issue by the workflow.
console.log(summarizeMembership(membershipLag(readJson("data/aa-catalog.json").models,
  mappedSlugsFromSource(read("src/data/aa.ts")))));

// Prices and access stay a person's call; these only say where to look.
if (!only) {
  const models = aa.models;
  const names = [...new Set(models.map(model => model.name))];
  for (const [label, check, summarize] of [
    ["pricing", () => checkPricing(readJson("src/data/plans.json")), summarizePricing],
    ["prices", () => checkOpenRouter(names, models), summarizeOpenRouter],
    ["access", () => checkModelsDev(names), summarizeModelsDev],
  ]) {
    try {
      console.log(summarize(await check()));
    } catch (error) {
      console.warn(`${label} check could not run: ${error.message}`);
    }
  }
}

backup.set("public/current.json", read("public/current.json"));
for (const command of [["evidence"], ["typecheck"], ["test"], ["build"]]) {
  console.log(`\n$ pnpm ${command.join(" ")}`);
  const run = spawnSync("pnpm", command, { cwd: ROOT, stdio: "inherit" });
  if (run.status !== 0) rollback(`pnpm ${command.join(" ")} failed on the fetched data`);
}
console.log("\nsync: data current, every check green.");
