/**
 * Artificial Analysis coding-agents leaderboard — the index, the per-task cost
 * and the wall time behind `src/data/agents.ts`.
 *
 * The page is a SPA: the data is not in the initial HTML but in the RSC
 * (React Server Components) payload streamed via `self.__next_f.push`. Each
 * chunk is a JSON string literal that must be decoded and concatenated.
 *
 * The payload contains agent variant rows with `displayLabel`, `indexScore`,
 * and a `mean` object carrying `costUsd` and `agentWallTimeSec`. The snapshot
 * stores these under the field names `agents.ts` expects: `label`, `index`,
 * `costUsd`, `wallSeconds`.
 *
 * Unlike `aa.mjs` (which fetches per-model pages), this fetches the single
 * leaderboard page and extracts all variants from the RSC payload. The page
 * is the source of truth — a variant that leaves the board is a real change,
 * not an error.
 */
import { get } from "./http.mjs";

const PAGE = "https://artificialanalysis.ai/agents/coding-agents";

/** Next.js streams the page as escaped string literals; this is one of them. */
const PUSH = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)<\/script>/g;

/** The page's own data stream, unescaped and concatenated in the order it arrived. */
function stream(page) {
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

/**
 * Extract agent variant rows from the RSC payload.
 * Each row has a `displayLabel` and, further in the same object, an
 * `indexScore` and a `mean` object with `costUsd` and `agentWallTimeSec`.
 */
function extractVariants(streamed) {
  const variants = [];
  const labelRegex = /"displayLabel":"([^"]+)"/g;

  for (const match of streamed.matchAll(labelRegex)) {
    const label = match[1];
    // Search in a large window after the label for the data fields
    const window = streamed.slice(match.index, match.index + 30000);

    const indexMatch = window.match(/"indexScore":([\d.eE+-]+)/);
    const meanMatch = window.match(/"mean":\{[^}]*?"costUsd":([\d.eE+-]+|null)[^}]*?"agentWallTimeSec":([\d.eE+-]+)/);

    if (!indexMatch || !meanMatch) {
      // A variant without score data is not an error — it may be unavailable
      continue;
    }

    const costUsd = meanMatch[1] === "null" ? null : parseFloat(meanMatch[1]);
    variants.push({
      label,
      index: parseFloat(indexMatch[1]),
      costUsd,
      wallSeconds: parseFloat(meanMatch[2]),
    });
  }

  return variants;
}

/**
 * Fetch the coding-agents leaderboard and extract all variant rows.
 * The page is the single source of truth — no per-agent pages exist.
 */
export async function fetchAaAgents() {
  const page = await get(PAGE, "text/html");
  if (!page.includes("self.__next_f")) {
    throw new Error(`${PAGE} returned no rendered page — blocked, truncated or an error page`);
  }

  const streamed = stream(page);
  const variants = extractVariants(streamed);

  if (variants.length === 0) {
    throw new Error(`${PAGE} carried no agent variants — the page markup changed`);
  }

  return {
    source_url: PAGE,
    variants,
  };
}

/** Prose the page does not carry, kept from the snapshot it is replacing. */
const CARRIED_HEADER_FIELDS = ["attribution", "note", "suites"];

/**
 * Merge fetched variants onto the previous snapshot. The leaderboard is the
 * source of truth — a variant that leaves is a real change, not an error.
 * Header fields (attribution, note, suites) are carried from the previous
 * snapshot because the page does not provide them in a structured way.
 */
export function mergeAaAgents(previous, fetched) {
  const fetchedLabels = new Set(fetched.variants.map(v => v.label));

  // Variants that were in the previous snapshot but are no longer on the board
  const gone = previous.variants.filter(v => !fetchedLabels.has(v.label)).map(v => v.label);

  const variants = fetched.variants.map(v => ({
    label: v.label,
    index: v.index,
    costUsd: v.costUsd,
    wallSeconds: v.wallSeconds,
  }));

  const header = Object.fromEntries(CARRIED_HEADER_FIELDS.map(field => [field, previous[field]]));
  return { ...header, source_url: fetched.source_url, variants, gone };
}

export function summarizeAaAgents(merged) {
  const rows = merged.variants
    .map(v => {
      const cost = v.costUsd === null ? "—" : `$${v.costUsd.toFixed(2)}`;
      const wall = (v.wallSeconds / 60).toFixed(1);
      return `  ${(v.index * 100).toFixed(1).padStart(5)}  ${cost.padStart(7)}/task  ${wall.padStart(6)}min  ${v.label}`;
    })
    .join("\n");
  const gone = merged.gone?.length
    ? `\n  gone: ${merged.gone.join(", ")}`
    : "";
  return `aa-agents · ${merged.variants.length} variants refreshed\n${rows}${gone}`;
}
