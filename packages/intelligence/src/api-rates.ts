/**
 * Versioned API price cards behind every API-equivalent figure. Rates are USD
 * per million tokens. A new rate is a new version — an observation keeps the
 * version it was priced with, so history is never repriced retroactively.
 */
export interface ApiRateCard {
  /** Uncached input, cache read, cache write, output — USD per million tokens. */
  input: number;
  cachedInput: number;
  cacheWrite: number;
  output: number;
}

export interface ApiRateVersion {
  version: string;
  effectiveFrom: string;
  source: string;
  /** Model ids the card prices; matching is exact. */
  rates: Record<string, ApiRateCard>;
}

export const API_RATE_VERSIONS: ApiRateVersion[] = [
  {
    version: "2026-08-r1",
    effectiveFrom: "2026-08-01",
    source: "https://platform.claude.com/docs/en/about-claude/pricing · https://platform.openai.com/docs/pricing",
    rates: {
      "claude-opus-5": { input: 15, cachedInput: 1.5, cacheWrite: 18.75, output: 75 },
      "claude-sonnet-5": { input: 3, cachedInput: 0.3, cacheWrite: 3.75, output: 15 },
      "gpt-5.6": { input: 2, cachedInput: 0.2, cacheWrite: 0, output: 12 },
      "gpt-5.6-codex": { input: 2, cachedInput: 0.2, cacheWrite: 0, output: 12 },
    },
  },
];

export const LATEST_RATE_VERSION = API_RATE_VERSIONS[API_RATE_VERSIONS.length - 1].version;

/** Every model id any card prices — the models an observation may claim. */
export const PRICED_MODELS = [
  "claude-opus-5",
  "claude-sonnet-5",
  "gpt-5.6",
  "gpt-5.6-codex",
];

/** The card an observation was priced with; null when the model has no card. */
export function rateCardFor(modelId: string, version: string): ApiRateCard | null {
  return API_RATE_VERSIONS.find(v => v.version === version)?.rates[modelId] ?? null;
}

/** USD cost of one token mix at a card's per-million rates. */
export function apiEquivalentUsd(
  usage: { input: number; cachedInput: number; cacheWrite: number; output: number },
  card: ApiRateCard,
): number {
  const per = (tokens: number, rate: number) => (tokens / 1_000_000) * rate;
  return (
    per(usage.input, card.input) +
    per(usage.cachedInput, card.cachedInput) +
    per(usage.cacheWrite, card.cacheWrite) +
    per(usage.output, card.output)
  );
}
