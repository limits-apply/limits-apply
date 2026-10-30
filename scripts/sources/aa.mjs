/**
 * Artificial Analysis per-model pages — the index, the per-task cost, the
 * per-task output tokens and the median output speed behind `src/data/aa.ts`.
 *
 * The leaderboard carries the first two rounded and the third never, and it drops
 * a model the moment a newer one supersedes it: eleven of the twelve this site
 * maps left the board between August and October 2026 while their own pages kept
 * publishing. So the fetch is per model page, and the catalogue is the set of
 * slugs `src/data/aa.ts` maps — never the board's. A model AA adds is added by
 * mapping it there, after somebody checks which plan grants it; a model this site
 * maps either refreshes or fails the run.
 *
 * Every figure comes off the model's own page, in the payload the page ships to
 * the browser. Nothing is carried forward: a page that stops printing a cost or a
 * per-task token count fails the run with the slug named, because a figure the
 * publisher no longer prints is the one thing this file must not invent. What no
 * page carries is not fetched at all — the version is read once from the index
 * methodology page, which names it next to the methodology rather than beside the
 * scores.
 */
import { get } from "./http.mjs";

const PAGE = "https://artificialanalysis.ai/models";
const VERSION_PAGE = "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index";

/** Next.js streams the page as escaped string literals; this is one of them. */
const PUSH = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)<\/script>/g;

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'", "&#39;": "'", "&nbsp;": " " };

const text = fragment => fragment
  .replace(/<[^>]*>/g, "")
  .replace(/&(?:amp|lt|gt|quot|#x27|#39|nbsp);/g, entity => ENTITIES[entity])
  .trim();

/** The page states the version next to the index methodology, not beside the scores. */
const INDEX_VERSION = /Intelligence Index v([\d.]+)/;

/** Integer or dotted — the header must not accept "2.3.4". */
const VERSION = /^\d+(\.\d+){1,2}$/;

/** A model record in that stream: a uuid, then the slug the row is keyed on. */
const RECORD_START = /\{"id":"/g;

/** "Claude Opus 5.5 (Max, Default Fallback)" — the page names the family, then the variant. */
const FAMILY = /^(.*?)(?:\s+\(([^()]*)\))?$/;

async function fetchIndexVersion() {
  const page = await get(VERSION_PAGE, "text/html");
  const match = INDEX_VERSION.exec(page);
  const version = match && VERSION.test(text(match[1])) ? text(match[1]) : null;
  if (!version) {
    throw new Error(`${VERSION_PAGE} carries no Intelligence Index version — the snapshot cannot claim one`);
  }
  return version;
}

/** The page's own data stream, unescaped and concatenated in the order it arrived. */
export function streamFromPage(page) {
  const parts = [];
  for (const match of page.matchAll(PUSH)) {
    try {
      parts.push(JSON.parse(`"${match[1]}"`));
    } catch {
      throw new Error("a Next.js stream chunk is not a valid string literal — AA changed their markup");
    }
  }
  return parts.join("");
}

/** The JSON object starting at `start`, braces balanced outside strings. */
export function objectAt(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") {
      depth--;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

/**
 * The record for one slug. A page about a model also embeds records for every
 * model its charts compare against, so the slug is matched and the record is then
 * checked for an index — a comparison row is not the model's own page.
 */
function recordFor(streamed, slug) {
  for (const match of streamed.matchAll(RECORD_START)) {
    const raw = objectAt(streamed, match.index);
    if (!raw) continue;
    let record;
    try {
      record = JSON.parse(raw);
    } catch {
      continue;
    }
    if (record?.slug === slug && record.intelligenceIndex !== undefined) return record;
  }
  return null;
}

/** One row of the snapshot, or the reason there cannot be one. */
function rowFor(record, slug) {
  const cost = record.intelligenceIndexCostPerTask?.cost?.total;
  const tokens = record.intelligenceIndexOutputTokensPerTask?.output;
  const speed = record.timescaleData?.medianOutputSpeed;
  if (typeof cost !== "number" || typeof tokens !== "number" || typeof speed !== "number") {
    const missing = [
      typeof cost === "number" ? null : "the cost per task",
      typeof tokens === "number" ? null : "the output tokens per task",
      typeof speed === "number" ? null : "the median output speed",
    ].filter(Boolean).join(" and ");
    throw new Error(`${PAGE}/${slug} no longer publishes ${missing}. AA still scores the variant, so the `
      + "row cannot be filled: remap the plan in src/data/aa.ts to a variant AA prices, or drop the "
      + "mapping — carrying the last printed figures forward is the failure this file exists to prevent.");
  }

  const [, family] = FAMILY.exec(record.name);
  const reasoning = [record.effort?.label, /fallback/i.test(record.suffix ?? "") ? "fallback" : null]
    .filter(Boolean)
    .join(" · ");
  if (!reasoning) {
    throw new Error(`${PAGE}/${slug} names no effort level, so the snapshot's reasoning label cannot be derived`);
  }

  // Four decimals, the precision this file has always carried: the page prints one
  // and the data stream seventeen, so the figure is stored at a precision no
  // downstream cell can notice rather than at one no reader can check. Rounding
  // here also makes a refresh idempotent — `--check` reports drift when a figure
  // moves, not when the float's last digits do.
  const round = (value) => Number(value.toFixed(4));

  return {
    slug,
    name: family,
    reasoning,
    intelligence: round(record.intelligenceIndex),
    cost_per_task_usd: round(cost),
    output_tokens_per_task: round(tokens),
    output_speed_tps: round(speed),
  };
}

/**
 * Every mapped slug, one page each, plus the version those scores belong to.
 * Sequential on purpose: a sync runs once a day, and a burst of
 * parallel requests is how a scraper gets the rate limiter's attention.
 */
export async function fetchAa(slugs) {
  if (!slugs.length) throw new Error("fetchAa needs the slugs the snapshot maps — the board is not the catalogue");
  const version = await fetchIndexVersion();

  const models = [];
  for (const slug of slugs) {
    const url = `${PAGE}/${slug}`;
    const page = await get(url, "text/html");
    if (!page.includes("self.__next_f")) {
      throw new Error(`${url} returned no rendered page — blocked, truncated or an error page`);
    }
    const record = recordFor(streamFromPage(page), slug);
    if (!record) throw new Error(`${url} carries no record for "${slug}" — the page markup changed`);
    const row = rowFor(record, slug);
    if (!(row.intelligence >= 0 && row.intelligence <= 100)) {
      throw new Error(`${url} published an index of ${row.intelligence} — outside 0–100`);
    }
    models.push(row);
  }

  return { source_url: PAGE, version, models };
}

/** Prose the page does not carry, kept from the snapshot it is replacing. */
const CARRIED_HEADER_FIELDS = ["source", "data_api_docs", "notes"];

/** The fetched rows under the previous snapshot's prose header, strongest first. */
export function mergeAa(previous, fetched) {
  const header = Object.fromEntries(CARRIED_HEADER_FIELDS.map(field => [field, previous[field]]));
  const models = [...fetched.models].sort((a, b) => b.intelligence - a.intelligence);
  return { ...header, intelligence_index_version: fetched.version, source_url: fetched.source_url, models };
}

export function summarizeAa(merged) {
  const rows = merged.models
    .map(model => `  ${model.intelligence.toFixed(1).padStart(5)}  $${model.cost_per_task_usd.toFixed(2)}/task  ${model.slug}`)
    .join("\n");
  return `aa · ${merged.models.length} models refreshed · index v${merged.intelligence_index_version}\n${rows}`;
}
