/**
 * Fold the observation store into the aggregate the Observatory page renders.
 * The output is generated, deterministic, and never fetched from the network.
 *
 *   node scripts/observations-aggregate.mjs [--store data/observations] [--out public/observatory.json]
 */
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseObservation } from "../packages/intelligence/src/telemetry.ts";
import { aggregateObservations } from "../packages/intelligence/src/telemetry-aggregate.ts";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const store = flag("store", "data/observations");
const out = flag("out", "public/observatory.json");

const files = (await readdir(store).catch(() => [])).filter(name => name.endsWith(".json")).sort();
const observations = [];
for (const file of files) {
  try {
    observations.push(parseObservation(await readFile(join(store, file), "utf8")));
  } catch (error) {
    console.error(`observations:aggregate: ${file}: ${error.message}`);
    process.exit(1);
  }
}

const aggregate = aggregateObservations(observations);
await mkdir(dirname(out), { recursive: true });
const next = `${out}.next`;
await writeFile(next, `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");
await rename(next, out);
console.log(
  `observations:aggregate: ${aggregate.observations} observation(s), ${aggregate.admissibleIntervals} usable interval(s), ${aggregate.groups.length} group(s) → ${out}`,
);
