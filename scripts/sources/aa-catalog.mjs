/**
 * Artificial Analysis' model catalogue — every scored model the site could
 * discover, not just the curated slugs `src/data/aa.ts` maps.
 *
 * `aa.mjs` refreshes the mapped rows and keeps its curated set. This module reads
 * the same page for the opposite job: a model AA adds must appear in the registry
 * even when no plan grants it yet. Discovery is not evaluation — nothing here is
 * allowed to attach an index to a subscription.
 *
 * The page ships a small default selection in its own Next.js stream and the full
 * table as an encrypted manifest referenced from that stream. Both carry the same
 * record shape, so both go through the same filter: a slug and a numeric index.
 * Only records with an index are catalogue rows; evaluation rows have a slug too.
 */
import { createDecipheriv, createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { objectAt, streamFromPage } from "./aa.mjs";
import { UA, get } from "./http.mjs";

const PAGE = "https://artificialanalysis.ai/models";

/** Fewer scored models than this means a parse or manifest failed, not a catalogue that shrank. */
const MIN_EXPECTED_MODELS = 50;

const OBJECT_START = /\{"(?:id|slug|name)":"|\{"intelligenceIndex":/g;

const MANIFEST = /"manifest":\{"path":"([^"]+)"(?:,"key":"([^"]+)")?\}/g;

function scoredModel(record) {
  if (!record || typeof record.slug !== "string" || !record.slug) return null;
  if (!Number.isFinite(record.intelligenceIndex)) return null;
  const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : record.slug;
  return {
    slug: record.slug,
    name,
    intelligence: Number(record.intelligenceIndex.toFixed(4)),
  };
}

function recordsFromStream(streamed) {
  const records = [];
  for (const match of streamed.matchAll(OBJECT_START)) {
    const raw = objectAt(streamed, match.index);
    if (!raw) continue;
    try {
      records.push(JSON.parse(raw));
    } catch {}
  }
  return records;
}

function sortModels(models) {
  return models.sort((a, b) => b.intelligence - a.intelligence || a.slug.localeCompare(b.slug));
}

function modelsFromRecords(records) {
  const bySlug = new Map();
  for (const record of records) {
    const model = scoredModel(record);
    if (model && !bySlug.has(model.slug)) bySlug.set(model.slug, model);
  }
  return sortModels([...bySlug.values()]);
}

function catalogFromStream(streamed) {
  const models = modelsFromRecords(recordsFromStream(streamed));
  if (!models.length) {
    throw new Error(`${PAGE} carries no scored model records — the page markup changed`);
  }
  return models;
}

/**
 * The scored catalogue the page's own stream carries. Pure, so the extraction is
 * tested against a synthetic page rather than a live fetch.
 */
export function catalogFromPage(html) {
  if (!html.includes("self.__next_f")) {
    throw new Error(`${PAGE} returned no rendered page — blocked, truncated or an error page`);
  }
  return { source_url: PAGE, models: catalogFromStream(streamFromPage(html)) };
}

function manifestRefs(streamed) {
  return [...streamed.matchAll(MANIFEST)].map(match => ({ path: match[1], key: match[2] ?? null }));
}

async function fetchManifest(ref) {
  const url = new URL(ref.path, PAGE);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} returned ${res.status} while reading the model catalogue manifest`);
  if (!ref.key) return res.json();

  const key = Buffer.from(ref.key, "hex");
  const iv = createHash("sha256").update(key).digest().subarray(0, 12);
  const cipher = Buffer.from(await res.arrayBuffer());
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(cipher.subarray(cipher.length - 16));
  const plain = Buffer.concat([decipher.update(cipher.subarray(0, cipher.length - 16)), decipher.final()]);
  return JSON.parse(gunzipSync(plain).toString("utf8"));
}

function payloadRecords(payload) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.models) ? payload.models : [];
}

/**
 * Every scored model AA publishes, default selection and full manifest merged by
 * slug. The full manifest wins a duplicate: the stream's selection is a default
 * view, the manifest is the catalogue. A page that carries a manifest but parses
 * below `MIN_EXPECTED_MODELS` fails the run instead of dating a truncated
 * catalogue today.
 */
export async function fetchAaCatalog() {
  const page = await get(PAGE, "text/html");
  if (!page.includes("self.__next_f")) {
    throw new Error(`${PAGE} returned no rendered page — blocked, truncated or an error page`);
  }

  const streamed = streamFromPage(page);
  const fromStream = catalogFromStream(streamed);
  const refs = manifestRefs(streamed);

  const bySlug = new Map();
  for (const ref of refs) {
    for (const model of modelsFromRecords(payloadRecords(await fetchManifest(ref)))) {
      if (!bySlug.has(model.slug)) bySlug.set(model.slug, model);
    }
  }
  for (const model of fromStream) {
    if (!bySlug.has(model.slug)) bySlug.set(model.slug, model);
  }

  const models = sortModels([...bySlug.values()]);
  if (refs.length && models.length < MIN_EXPECTED_MODELS) {
    throw new Error(`parsed ${models.length} scored models from ${PAGE}, expected at least ${MIN_EXPECTED_MODELS}`
      + " — the catalogue or its manifest changed; the previous snapshot is untouched");
  }
  return { source_url: PAGE, models };
}

export function summarizeCatalog(catalog) {
  const rows = catalog.models
    .slice(0, 12)
    .map(model => `  ${model.intelligence.toFixed(1).padStart(5)}  ${model.slug}`)
    .join("\n");
  return `aa-catalog · ${catalog.models.length} scored models discovered\n${rows}`;
}
