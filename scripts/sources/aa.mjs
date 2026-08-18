/**
 * Artificial Analysis — the models index and pricing behind `src/data/aa.ts`.
 *
 * `GET /api/v2/language/models` with no key returns `401 {"error":"API key is
 * required"}` — so "free endpoint" means free-tier key, not keyless. The tier
 * decides which fields come back: a free key returns indices and pricing; a Pro
 * key adds per-task output tokens and cost. No key at all → refuse outright,
 * because reporting drift on a fetch we can't make would be theatre.
 */
import { get } from "./http.mjs";

const ENDPOINT = "https://artificialanalysis.ai/api/v2/language/models";

export async function fetchAa() {
  const key = process.env.AA_API_KEY;
  if (!key) {
    throw new Error("AA_API_KEY not set — get a free-tier key at artificialanalysis.ai and set it "
      + "to refresh indices and pricing. Per-task output tokens and cost need a Pro key; without one "
      + "those fields stay hand-maintained and this step cannot check them.");
  }
  const body = await get(ENDPOINT, "application/json", { "x-api-key": key });
  const models = (body.data ?? []).map(m => ({
    slug: m.slug ?? m.id,
    name: m.name,
    intelligence: m.evaluations?.artificial_analysis_intelligence_index ?? null,
    // Only present with a Pro key. `undefined` here means "carry the old value forward", never 0.
    cost_per_task_usd: m.pricing?.cost_per_task_usd ?? undefined,
    output_tokens_per_task: m.output_tokens_per_task ?? undefined,
  }));
  return { source_url: ENDPOINT, models };
}

/** Header fields the snapshot carries besides `models` — none of them come from this endpoint. */
const CARRIED_HEADER_FIELDS = ["source", "source_url", "data_api_docs", "intelligence_index_version", "notes"];

/**
 * Merges a fetched row onto the previous snapshot's row for the same slug.
 * `AA_MODELS` in `src/data/aa.ts` maps a fixed, curated subset of AA's full
 * catalogue (12 slugs, not ~250) — a model AA added that we don't map is the
 * normal state of the world, not an error, so it is simply ignored, never
 * merged in. A slug we DO map vanishing from the fetch is the real signal
 * (AA renamed or removed a model this file maps) — the same case
 * `src/data/aa.ts`'s own `fromSlug` throws on, surfaced here before a corrupt
 * file is ever written.
 *
 * Every field the tier didn't return (`undefined`, including `reasoning` —
 * this repo's own effort-label vocabulary, never returned by AA at all) keeps
 * its old value: `{ ...old, ...row }` would otherwise let `undefined` win and
 * `JSON.stringify` silently drop the field from the written file.
 */
export function mergeAa(previous, fetched) {
  const byOldSlug = new Map(previous.models.map(m => [m.slug, m]));
  const fetchedSlugs = new Set(fetched.models.map(m => m.slug));

  const vanished = previous.models.filter(m => !fetchedSlugs.has(m.slug)).map(m => m.slug);
  if (vanished.length) {
    throw new Error(`aa.mjs: AA no longer publishes ${vanished.join(", ")}, which the previous `
      + "snapshot maps — investigate before refreshing; the previous snapshot is untouched.");
  }

  const needsProKey = [];
  const models = fetched.models.filter(row => byOldSlug.has(row.slug)).map(row => {
    const old = byOldSlug.get(row.slug);
    const merged = { ...old, ...row, reasoning: old.reasoning };
    for (const field of ["cost_per_task_usd", "output_tokens_per_task"]) {
      if (row[field] === undefined) {
        merged[field] = old[field];
        needsProKey.push(`${row.slug}.${field}`);
      }
    }
    return merged;
  });

  const header = Object.fromEntries(CARRIED_HEADER_FIELDS.map(field => [field, previous[field]]));
  return { ...header, source_url: fetched.source_url, models, needsProKey };
}

export function summarizeAa(merged) {
  const lines = [`aa · ${merged.models.length} models refreshed`];
  if (merged.needsProKey.length) {
    lines.push(`  needs a Pro key — carried over unchanged: ${[...new Set(merged.needsProKey)].join(", ")}`);
  }
  return lines.join("\n");
}
