# Observation schema — the interval, not the marketing

Everything the observatory renders comes from one artifact: an **observation**. An
observation is one measurement of the form

> X tokens, split into input, cache read, cache write and output, consumed Y
> percentage points of quota in window Z, on plan P, with model M and harness H.

It is stored as a single JSON file under `data/observations/`, named by its content
hash, so collecting the same interval twice writes nothing. A store that does not
validate fails CI (`pnpm observations:validate`); a store carrying anything private
fails the privacy gate (`pnpm observations:check-privacy`).

## The record

```ts
interface QuotaObservationV1 {
  schemaVersion: 1;
  observationId: string;   // 16 hex chars, sha256 of the record minus the id
  reporterId: string;      // opaque, 4–64 chars: dedupes without identifying anyone

  provider: "openai" | "anthropic";
  subscriptionId: string;  // from the registry below — never a marketing name
  modelId: string;         // the exact model the tokens were billed to
  harness: "codex" | "claude-code";
  harnessVersion: string;  // the CLI version, e.g. 0.162.1 / 2.1.241
  reasoningEffort: string | null;

  observedAt: string;      // ISO instant the interval closed
  region: string | null;   // ISO-3166 alpha-2

  quotaWindow: {
    type: "5h" | "weekly" | "monthly" | "other";
    resetAt: string | null;      // the provider's stated reopen time
    usedBefore: number;          // provider-reported percentage points
    usedAfter: number;
    unit: "percentage_points";
    resetDetected: boolean;      // the counter reset inside the interval
  };

  usage: {
    inputTokens: number | null;     // uncached input
    cacheReadTokens: number | null;
    cacheWriteTokens: number | null;
    outputTokens: number | null;    // reasoning tokens are a subset, never a fifth bucket
  };

  apiRateVersion: string | null; // the rate card the interval was priced with
  workloadId: string | null;     // versioned workload id, e.g. wl-001@v1
  runs: number | null;
  successfulRuns: number | null;

  collectionMethod: "local_log" | "official_status" | "manual";
  evidenceRef: string | null;   // https URL a reviewer can open
  isolationConfirmed: boolean;  // no other session could have consumed in the interval
}
```

## Field rules

- **Missing is null, never zero.** A category the harness does not expose stays
  `null`; a zero is a claim that nothing was consumed.
- **Percentages are points.** 0–100, in the unit the provider reports. A delta
  below one point — the counters' display precision — is stored but excluded from
  every statistic.
- **Uncached input is what is left after the cache is taken out.** Codex reports
  `input_tokens` inclusive of its cache reads (its own `total_tokens` is exactly
  input + output with cached shown inside input); the collector stores
  `input_tokens − cached − cache_write` so no token is billed twice. Anthropic
  reports the four categories separately and nothing is unwrapped. Reasoning tokens
  are a subset of output and are never added to it.
- **A reset is flagged, not deleted.** An interval whose counter reset is kept with
  `resetDetected: true` as provenance, and never enters a statistic.
- **Priced means fully mixed.** An API-equivalent figure requires all four
  categories and a rate card that prices the model at the stated version; a missing
  category voids the price but keeps the raw token ratio.

## The subscription registry

`subscriptionId` is stable and independent of any marketing name — a renamed
pricing page never invalidates history:

`openai.chatgpt-free` · `openai.chatgpt-plus` · `openai.chatgpt-pro` ·
`openai.chatgpt-team` · `openai.chatgpt-business` · `openai.api-metered` ·
`anthropic.claude-free` · `anthropic.claude-pro` · `anthropic.claude-max-5x` ·
`anthropic.claude-max-20x` · `anthropic.claude-team` · `anthropic.api-metered`

A Codex rollout carrying a `plan_type` outside the registry is refused, not
guessed. A harness must match the subscription's: an `anthropic.*` subscription is
only consumed through `claude-code`.

## Rate cards

`apiRateVersion` names a versioned card in `packages/intelligence/src/api-rates.ts`
(rates are USD per million tokens, with their source). An observation keeps the
version it was priced with; history is never repriced retroactively.

## What the store may claim

| Evidence available | Status |
|---|---|
| 1 stored interval | single report — never an estimate |
| ≥ 5 admissible intervals | preliminary estimate |
| ≥ 5 intervals across ≥ 2 window types | time series |
| ≥ 5 intervals from ≥ 3 reporters | community estimate |

A quota change is reported only above a configurable threshold, on both halves of
the sample, with enough samples to persist — as `probable`, `inconclusive` or
`insufficient`. It is an observed capacity change, never a claim about a provider's
policy.

## Privacy

Refused, not cleaned: account home paths, email addresses, API keys, authorization
headers, harness config paths, environment secrets, private prompt markers. The
same scan runs on every store file in CI and on every `observe export`.

## Contributing

Collect with `limitsapply observe codex` or `limitsapply observe claude`, review
`limitsapply observe export --sanitized`, and open a pull request adding the JSON
files. For a workload campaign, pass `--workload wl-001@v1 --runs <n>
--successful-runs <m>` so the interval carries its outcome counts beside it. The
[data contributions rules](data-contributions.md) apply: attributable, dated,
reproducible at the level claimed, labelled honestly. One account is an
observation, not a market-wide quota.
