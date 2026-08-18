/**
 * Release dates and makers for the local (open-weights) tier — writes a dated
 * snapshot. Not one of the plan's six named sources, but nothing else replaces
 * it and `src/data/local-models.ts` still depends on it; kept as-is.
 */
import { get } from "./http.mjs";

const MODELS_DEV = "https://models.dev/api.json";
const HF_SEARCH = "https://huggingface.co/api/models?limit=20&search=";

const norm = s => s.toLowerCase().replace(/[^a-z0-9.]+/g, "");

/** Id segments that are a serving path or a deployment flavour, never a maker. */
const NOT_A_MAKER = new Set(["accounts", "models", "meta-models", "tee", "free", "fireworks"]);

/** The maker a `<maker>/<model>` id names, if it names one at all. */
function namespaceOf(id) {
  const parts = id.split("/");
  const slug = (parts[0].startsWith("@") ? parts[1] : parts.length === 2 ? parts[0] : "")?.toLowerCase();
  return slug && !NOT_A_MAKER.has(slug) ? slug : null;
}

/**
 * The maker, voted from the namespaces the catalogue's providers publish — one vote
 * per provider, so a maker several of them agree on beats a serving path only one
 * uses. A provider that hosts its own models (nvidia) still counts: the vote is on
 * agreement, not on who is serving.
 */
function makerOf(entries) {
  const votes = new Map();
  for (const entry of entries) {
    const slug = namespaceOf(entry.id);
    if (!slug) continue;
    if (!votes.has(slug)) votes.set(slug, new Set());
    votes.get(slug).add(entry.provider);
  }
  return [...votes].sort((a, b) => b[1].size - a[1].size)[0]?.[0] ?? null;
}

/** The date most providers agree on. Ties break to the earliest — a release, not an onboarding. */
function modalDate(dates) {
  const counts = new Map();
  for (const date of dates) counts.set(date, (counts.get(date) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null;
}

/**
 * The weights repository, for what the catalogue does not carry. Its creation date
 * is when the weights went up, which is a proxy for the release and is labelled as
 * one — never merged into the catalogue's own dates without saying so.
 */
async function weightsRepo(name) {
  const hits = await get(HF_SEARCH + encodeURIComponent(name), "application/json");
  const hit = hits.find(repo => norm(repo.id.split("/").pop()) === norm(name));
  return hit
    ? { id: hit.id, org: hit.id.split("/")[0].toLowerCase(), created: hit.createdAt.slice(0, 10) }
    : null;
}

const DATE_RE = /^\d{4}-\d{2}(-\d{2})?$/;

/** Fewer resolved than this means a feed moved under us, not that the tier is young. */
const MIN_EXPECTED_RELEASES = 8;

export async function fetchReleases(localModelNames) {
  const api = await get(MODELS_DEV, "application/json");

  const catalogue = [];
  for (const [providerId, provider] of Object.entries(api)) {
    for (const model of Object.values(provider?.models ?? {})) {
      if (model?.name && DATE_RE.test(model?.release_date ?? "")) {
        catalogue.push({ provider: providerId, id: model.id, name: model.name, date: model.release_date });
      }
    }
  }

  const rows = [];
  for (const name of [...new Set(localModelNames)]) {
    const key = norm(name);
    const hits = catalogue.filter(entry => norm(entry.name).startsWith(key));
    const agreed = modalDate(hits.map(entry => entry.date));

    let released = agreed ? { on: agreed, via: "catalogue" } : null;
    let maker = makerOf(hits);
    let repo = null;
    if (!released || !maker) {
      repo = await weightsRepo(name).catch(() => null);
      if (repo) {
        released ??= { on: repo.created, via: "weights" };
        maker ??= repo.org;
      }
    }
    rows.push({
      name, maker, released,
      listings: hits.length,
      agree: hits.filter(entry => entry.date === agreed).length,
      weights_repo: repo?.id ?? null,
    });
  }

  const resolved = rows.filter(row => row.released).length;
  if (resolved < MIN_EXPECTED_RELEASES) {
    throw new Error(`resolved ${resolved} release dates of ${rows.length}, expected at least`
      + ` ${MIN_EXPECTED_RELEASES} — a feed moved`);
  }

  return {
    source: "models.dev catalogue, with the Hugging Face weights repository as fallback",
    source_url: MODELS_DEV,
    fallback_url: "https://huggingface.co/api/models",
    notes: "via=catalogue is the release date models.dev publishes, taken as the date most of its "
      + "providers agree on. via=weights is the creation date of the weights repository, "
      + "which is when the weights went up rather than when the maker announced them — a proxy, and "
      + "labelled as one. A model with neither stays null; inventing the date is what the ladder forbids.",
    models: rows,
  };
}

export function summarizeReleases(snapshot) {
  const resolved = snapshot.models.filter(row => row.released).length;
  const lines = snapshot.models.map(row =>
    `  ${(row.released?.on ?? "——").padEnd(11)} ${(row.released?.via ?? "unresolved").padEnd(10)}`
    + ` ${(row.maker ?? "maker?").padEnd(12)} ${String(row.agree).padStart(2)}/${String(row.listings).padEnd(3)}`
    + ` ${row.name}`);
  return [`releases · ${resolved} of ${snapshot.models.length} resolved`, ...lines, "",
    "  Copy `released` and `maker` into src/data/local-models.ts and bump its `verified`.",
    "  A maker with no icon needs a line in scripts/favicons.sh — the icon test fails without one."].join("\n");
}
