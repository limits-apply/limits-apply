/** OpenCode Go — per-model request quota. Writes a dated snapshot. */
import { get } from "./http.mjs";

const GO_URL = "https://opencode.ai/fr/go";

/**
 * Fewer than this many rows means the markup moved under us. Cairn falls back to a
 * seeded snapshot here; we refuse, because a stale figure wearing today's date is
 * worse than no refresh.
 */
const MIN_EXPECTED_MODELS = 8;

const ITEM_RE =
  /data-item\b[^>]*?\bdata-kind="(free|go|promo)"(?:[^>]*?\bdata-model="([^"]*)")?[^>]*>\s*<span\b[^>]*\bdata-value\b[^>]*>([^<]*)<\/span>\s*<span\b[^>]*\bdata-name\b[^>]*>([^<]*)<\/span>/g;

/** The free tier carries no `data-model`, so its slug comes from its name. */
function slugifyName(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join("-")
    .replace(/[^a-z0-9-]/g, "");
}

function parseUsage(html) {
  const out = [];
  for (const m of html.matchAll(ITEM_RE)) {
    const requestsPer5h = Number(m[3].replace(/,/g, "").trim());
    if (!Number.isFinite(requestsPer5h)) continue;
    const rawName = m[4].trim();
    const note = rawName.match(/\(([^)]*)\)/);
    const promoNote = note ? note[1].trim() : undefined;
    const name = rawName.replace(/\s*\([^)]*\)\s*$/, "").trim();
    out.push({
      slug: m[2] || slugifyName(name),
      kind: promoNote ? "promo" : m[1],
      name,
      requestsPer5h,
      ...(promoNote ? { promoNote } : {}),
    });
  }
  return out;
}

export async function fetchOpenCode() {
  const models = parseUsage(await get(GO_URL, "text/html"))
    .sort((a, b) => a.requestsPer5h - b.requestsPer5h);
  if (models.length < MIN_EXPECTED_MODELS) {
    throw new Error(`parsed ${models.length} models, expected at least ${MIN_EXPECTED_MODELS} — the markup moved`);
  }
  return {
    source: "OpenCode Go",
    source_url: GO_URL,
    notes: "Requests per 5-hour window, per model, as published on the plan page. "
      + "A request is not a work unit of known size; it is countable, which is all the ladder asks of it.",
    models,
  };
}

export function summarizeOpenCode(snapshot) {
  const lines = snapshot.models.map(m =>
    `  ${String(m.requestsPer5h.toLocaleString("en-US")).padStart(7)} / 5h  ${m.slug}`);
  return [`opencode · ${snapshot.models.length} models`, ...lines,
    "", "  Copy the granted models into src/data/opencode.ts and bump its `verified`."].join("\n");
}
