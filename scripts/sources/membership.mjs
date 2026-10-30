/**
 * Membership lag — which provider's newest AA-scored model outranks the one this
 * site maps.
 *
 * The ladder refreshes *figures* on its own (`sync.mjs` re-reads every slug
 * `src/data/aa.ts` maps) but never *membership*: a model AA starts scoring
 * tomorrow stays invisible until a human adds it. That is how GPT-6 was scored
 * for weeks while the plan table still mapped GPT-5.6 Sol — the figures were
 * current, the roster was not.
 *
 * This is discovery, never evaluation: a lagging row is a prompt to open the
 * provider page and remap (or record why the sibling is deliberate), not a claim
 * that any subscription grants the newer model.
 */

/** Slug prefixes that name a vendor in AA's catalogue. */
const PROVIDERS = [
  { id: "anthropic", match: /^claude-/ },
  { id: "openai", match: /^gpt-|^o[1-9]/ },
  { id: "google", match: /^gemini-|^gemma-/ },
  { id: "xai", match: /^grok-/ },
  { id: "zai", match: /^glm-/ },
  { id: "moonshot", match: /^kimi-/ },
  { id: "qwen", match: /^qwen/ },
  { id: "deepseek", match: /^deepseek-/ },
  { id: "nvidia", match: /^nemotron-/ },
  { id: "minimax", match: /^minimax-/ },
  { id: "xiaomi", match: /^mimo-/ },
  { id: "meta", match: /^llama-?/ },
  { id: "mistral", match: /^mistral-|^magistral-/ },
];

/** A provider lags when its best catalogue model beats the best mapped one by this much. */
const LAG = 1.0;

function providerOf(slug) {
  return PROVIDERS.find((provider) => provider.match.test(slug))?.id ?? null;
}

const round = (n) => Number(n.toFixed(2));

/**
 * The best model AA scores per provider against the best one this site maps.
 *
 * `models` is a catalogue (`{ slug, name, intelligence }`), `mappedSlugs` what
 * `src/data/aa.ts` registers. A provider with no mapped row is skipped — an
 * unmapped vendor is a scope choice, not a stale mapping.
 */
export function membershipLag(models, mappedSlugs) {
  const mapped = new Set(mappedSlugs);
  const rows = [];
  for (const provider of PROVIDERS) {
    const scored = models.filter((model) => providerOf(model.slug) === provider.id);
    const known = scored.filter((model) => mapped.has(model.slug));
    if (!scored.length || !known.length) continue;
    const best = scored.reduce((a, b) => (b.intelligence > a.intelligence ? b : a));
    const bestMapped = known.reduce((a, b) => (b.intelligence > a.intelligence ? b : a));
    const gap = round(best.intelligence - bestMapped.intelligence);
    rows.push({
      provider: provider.id,
      best: { slug: best.slug, name: best.name, intelligence: round(best.intelligence) },
      mapped: { slug: bestMapped.slug, name: bestMapped.name, intelligence: round(bestMapped.intelligence) },
      gap,
      lagging: gap >= LAG,
    });
  }
  return rows.sort((a, b) => b.gap - a.gap);
}

/**
 * The slugs `src/data/aa.ts` maps, read straight from source. `sync` runs
 * without a TypeScript runtime, and the source of truth is the `fromSlug(...)`
 * calls themselves — `test/membership.test.ts` holds this against
 * `MAPPED_AA_SLUGS` so the two can never drift.
 */
export function mappedSlugsFromSource(source) {
  return [...new Set([...source.matchAll(/fromSlug\("([^"]+)"\)/g)].map((match) => match[1]))];
}

/** A markdown table for a console report or an issue body. */
export function summarizeMembership(rows) {
  const lagging = rows.filter((row) => row.lagging);
  const header = lagging.length
    ? `${lagging.length} provider${lagging.length === 1 ? "" : "s"} behind the AA catalogue:`
    : "membership: every mapped provider is the newest AA scores for it";
  const lines = [
    header,
    "",
    "| provider | mapped | newest scored | gap |",
    "| --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    lines.push(`| ${row.provider} | \`${row.mapped.slug}\` (${row.mapped.intelligence}) | `
      + `\`${row.best.slug}\` (${row.best.intelligence}) | ${row.gap > 0 ? "+" : ""}${row.gap} |`);
  }
  return lines.join("\n");
}
