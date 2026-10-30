/**
 * Privacy gate over the observation store: no account path, credential,
 * personal identifier or private prompt text may reach the repository.
 *
 *   node scripts/observations-check-privacy.mjs [--store data/observations]
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { privacyScan } from "../packages/intelligence/src/telemetry-privacy.ts";

const args = process.argv.slice(2);
const at = args.indexOf("--store");
const store = at >= 0 && args[at + 1] ? args[at + 1] : "data/observations";

const files = (await readdir(store).catch(() => [])).filter(name => name.endsWith(".json")).sort();
if (files.length === 0) {
  console.log(`observations:check-privacy: no observations in ${store} — nothing to scan`);
  process.exit(0);
}

const leaks = [];
for (const file of files) {
  const hits = privacyScan(await readFile(join(store, file), "utf8"));
  if (hits.length) leaks.push(`${file}: ${hits.join(", ")}`);
}

if (leaks.length) {
  for (const leak of leaks) console.error(`observations:check-privacy: ${leak}`);
  process.exit(1);
}
console.log(`observations:check-privacy: ${files.length} file(s) clean`);
