/**
 * Artificial Analysis' small open-weights board — the tier behind
 * `src/data/local-models.ts`. Read from the page the snapshot already names as its
 * source, not from the API `aa.mjs` uses: the API returns the whole catalogue and
 * no tier, and the 4B–40B boundary is AA's to draw, not ours to reconstruct.
 *
 * Membership is the thing this watches. `aa.mjs` merges by slug onto a curated
 * subset, where a model AA added is simply not ours; here the board *is* the tier,
 * so a model entering it and a model falling off it are both drift.
 */
import { get } from "./http.mjs";

const PAGE = "https://artificialanalysis.ai/models/open-source/small";

/** The band the board is supposed to cover. Its absence means the page moved under us. */
const TIER = "4B-40B";

/** Fewer rows than this is a parse that failed, not a tier that emptied. */
const MIN_EXPECTED_MODELS = 8;

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'", "&#39;": "'", "&nbsp;": " " };

const text = fragment => fragment
  .replace(/<[^>]*>/g, "")
  .replace(/&(?:amp|lt|gt|quot|#x27|#39|nbsp);/g, entity => ENTITIES[entity])
  .trim();

/** "Qwen3.6 27B (Reasoning)" → name and reasoning mode; a model with one mode has none. */
const NAME = /^(.*?)(?:\s+\(([^()]*)\))?$/;

/** "36B3B active at inference time" — two figures in one cell, the second only for a mixture. */
const PARAMS = /^([\d.]+)B(?:([\d.]+)B active at inference time)?$/;

const INDEX_VERSION = /Intelligence Index v([\d.]+)/;

export async function fetchAaSmall() {
  const page = await get(PAGE, "text/html");
  if (!page.includes(TIER)) {
    throw new Error(`${PAGE} no longer states the ${TIER} band it is supposed to cover — the page moved,`
      + " and parsing it as if it had not would rewrite the tier under the reader");
  }
  const version = INDEX_VERSION.exec(page)?.[1];
  if (!version) throw new Error(`${PAGE} carries no Intelligence Index version — the snapshot cannot claim one`);

  const models = [...page.matchAll(/<tr\b[^>]*>(.*?)<\/tr>/gs)]
    .map(([, row]) => [...row.matchAll(/<t[dh]\b[^>]*>(.*?)<\/t[dh]>/gs)].map(([, cell]) => text(cell)))
    .filter(cells => cells.length > 3 && /^[\d.]+$/.test(cells[2]) && PARAMS.test(cells[3]))
    .map(cells => {
      const [, name, variant = ""] = NAME.exec(cells[0]);
      const [, total, active] = PARAMS.exec(cells[3]);
      return {
        name,
        variant,
        intelligence: Number(cells[2]),
        total_params_b: Number(total),
        active_params_b: active ? Number(active) : null,
      };
    });

  if (models.length < MIN_EXPECTED_MODELS) {
    throw new Error(`parsed ${models.length} models from ${PAGE}, expected at least ${MIN_EXPECTED_MODELS}`
      + " — the table markup changed; the previous snapshot is untouched");
  }

  return { source_url: PAGE, intelligence_index_version: version, models };
}

/** Prose the page does not carry, kept from the snapshot it is replacing. */
const CARRIED_HEADER_FIELDS = ["source", "data_api_docs", "tier", "notes"];

const rowKey = model => `${model.name}${model.variant ? ` (${model.variant})` : ""}`;

/**
 * The board replaces the previous one whole — a row that left the tier must leave
 * the snapshot, or `local-models.ts` would keep serving a model AA no longer ranks.
 * What entered and what left is reported, never silently applied.
 */
export function mergeAaSmall(previous, fetched) {
  const before = new Set(previous.models.map(rowKey));
  const after = new Set(fetched.models.map(rowKey));
  const header = Object.fromEntries(CARRIED_HEADER_FIELDS.map(field => [field, previous[field]]));
  return {
    ...header,
    ...fetched,
    entered: [...after].filter(key => !before.has(key)),
    left: [...before].filter(key => !after.has(key)),
  };
}

export function summarizeAaSmall(merged) {
  const lines = [`aa-small · ${merged.models.length} models · index v${merged.intelligence_index_version}`];
  if (merged.entered.length) lines.push(`  entered the tier: ${merged.entered.join(" · ")}`);
  if (merged.left.length) lines.push(`  left the tier: ${merged.left.join(" · ")}`);
  for (const model of merged.models) {
    lines.push(`  ${String(model.intelligence).padStart(3)}  ${model.total_params_b}B`
      + `${model.active_params_b ? `/${model.active_params_b}B active` : ""}  ${rowKey(model)}`);
  }
  if (merged.entered.length || merged.left.length) {
    lines.push("", "  Membership moved — remap LOCAL_MODELS in src/data/local-models.ts onto the new snapshot.",
      "  A maker with no icon needs a line in scripts/favicons.sh — the icon test fails without one.");
  }
  return lines.join("\n");
}
