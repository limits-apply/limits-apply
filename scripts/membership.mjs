/**
 * Prints which provider's newest AA-scored model outranks the one the site maps,
 * and exits non-zero if any of them is not on `src/data/mapping-lag.json`, or if an
 * allowlisted provider no longer lags.
 *
 * This is the half of freshness the daily sync cannot cover: `sync.mjs` fetches
 * every slug already mapped, so a model AA starts scoring (GPT-6 was the one that
 * got through) moves no figure on the page. `.github/workflows/sync.yml` runs this
 * after each sync so a new flagship becomes an issue instead of a surprise.
 *
 *   node scripts/membership.mjs   prints the table, exits 1 on an unallowlisted or stale lag
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./resolve-import.mjs";
import { mappedSlugsFromSource, membershipLag, summarizeMembership } from "./sources/membership.mjs";

const catalog = JSON.parse(readFileSync(join(ROOT, "data/aa-catalog.json"), "utf8"));
const mapped = mappedSlugsFromSource(readFileSync(join(ROOT, "src/data/aa.ts"), "utf8"));
const allowed = new Set(
  JSON.parse(readFileSync(join(ROOT, "src/data/mapping-lag.json"), "utf8")).allowed.map((row) => row.provider),
);

const rows = membershipLag(catalog.models, mapped);
console.log(`AA catalogue: ${catalog.retrieved_on}\n`);
console.log(summarizeMembership(rows));

const lagging = new Set(rows.filter((row) => row.lagging).map((row) => row.provider));
const stale = [...allowed].filter((provider) => !lagging.has(provider));
if (stale.length) {
  console.error(`\n${stale.join(", ")} no longer lag(s) — delete the row(s) from src/data/mapping-lag.json.`);
}

const unattended = rows.filter((row) => row.lagging && !allowed.has(row.provider));
if (unattended.length) {
  console.error(`\n${unattended.length} provider(s) behind the catalogue and not allowlisted: `
    + `${unattended.map((row) => row.provider).join(", ")}`);
  console.error("Open the provider's model page, remap, or record the reason in src/data/mapping-lag.json.");
}
if (stale.length || unattended.length) process.exit(1);
