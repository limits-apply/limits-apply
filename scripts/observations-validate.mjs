/**
 * Validate every committed observation against the schema and the registry.
 * A store that does not parse is a failed CI run, not a partially-rendered page.
 *
 *   node scripts/observations-validate.mjs [--store data/observations]
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseObservation } from "../packages/intelligence/src/telemetry.ts";

const args = process.argv.slice(2);
const at = args.indexOf("--store");
const store = at >= 0 && args[at + 1] ? args[at + 1] : "data/observations";

const files = (await readdir(store).catch(() => [])).filter(name => name.endsWith(".json")).sort();
if (files.length === 0) {
  console.log(`observations:validate: no observations in ${store} — nothing to check`);
  process.exit(0);
}

const errors = [];
for (const file of files) {
  try {
    parseObservation(await readFile(join(store, file), "utf8"));
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(`observations:validate: ${error}`);
  process.exit(1);
}
console.log(`observations:validate: ${files.length} observation(s) valid`);
