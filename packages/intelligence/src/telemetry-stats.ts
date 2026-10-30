import { apiEquivalentUsd, rateCardFor, type ApiRateCard } from "./api-rates.ts";
import type { QuotaObservationV1 } from "./telemetry.ts";

/**
 * The whole quota arithmetic. Every figure an aggregation publishes is built
 * here, so an interval is admissible or it is nothing.
 *
 * Sibling imports carry the `.ts` extension so `scripts/*.mjs` can load this
 * module directly under Node's type stripping.
 */

export interface TokenTotals {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  /** Sum of the four categories, nulls counted as absent. */
  total: number;
  /** Categories the reporter could not expose. */
  missing: number;
}

export function tokenTotals(o: QuotaObservationV1): TokenTotals {
  const values = [o.usage.inputTokens, o.usage.cacheReadTokens, o.usage.cacheWriteTokens, o.usage.outputTokens];
  const missing = values.filter(v => v === null).length;
  const total = values.reduce<number>((sum, v) => sum + (v ?? 0), 0);
  return {
    input: o.usage.inputTokens ?? 0,
    cacheRead: o.usage.cacheReadTokens ?? 0,
    cacheWrite: o.usage.cacheWriteTokens ?? 0,
    output: o.usage.outputTokens ?? 0,
    total,
    missing,
  };
}

/** Quota points consumed in the interval, or null when the record carries no interval. */
export function quotaDelta(o: QuotaObservationV1): number {
  return o.quotaWindow.usedAfter - o.quotaWindow.usedBefore;
}

/** Percentage points a counter can actually resolve; below that a delta is noise. */
export const MIN_QUOTA_DELTA = 1;
/** An API-equivalent figure needs the full mix; a missing category voids the price. */
export const EXACT_MIX = 0;

export interface Admissibility {
  ok: boolean;
  reason: string | null;
}

export function admissible(o: QuotaObservationV1): Admissibility {
  const delta = quotaDelta(o);
  if (o.quotaWindow.resetDetected) return { ok: false, reason: "the counter reset inside the interval" };
  if (!(delta > 0)) return { ok: false, reason: "non-positive quota delta" };
  if (delta < MIN_QUOTA_DELTA) return { ok: false, reason: `delta below ${MIN_QUOTA_DELTA}-point display precision` };
  const totals = tokenTotals(o);
  if (totals.total <= 0) return { ok: false, reason: "no tokens observed in the interval" };
  return { ok: true, reason: null };
}

/** Usable intervals keep pieces of an interval for provenance but never for stats. */
export function isAdmissible(o: QuotaObservationV1): boolean {
  return admissible(o).ok;
}

export interface Rate {
  tokensPerPoint: number;
  apiUsdPerPoint: number | null;
  cacheShare: number | null;
  apiRateVersion: string | null;
}

/** The one ratio the project exists to measure: tokens and USD per quota point. */
export function intervalRate(o: QuotaObservationV1): Rate | null {
  if (!isAdmissible(o)) return null;
  const delta = quotaDelta(o);
  const totals = tokenTotals(o);
  const card = o.apiRateVersion ? rateCardFor(o.modelId, o.apiRateVersion) : null;
  const priced = totals.missing === EXACT_MIX && card !== null;
  return {
    tokensPerPoint: totals.total / delta,
    apiUsdPerPoint: priced
      ? apiEquivalentUsd({ input: totals.input, cachedInput: totals.cacheRead, cacheWrite: totals.cacheWrite, output: totals.output }, card as ApiRateCard) / delta
      : null,
    cacheShare: totals.total > 0 ? (totals.cacheRead + totals.cacheWrite) / totals.total : null,
    apiRateVersion: priced ? o.apiRateVersion : null,
  };
}

/* ---------- robust statistics ---------- */

export interface Band {
  value: number;
  low: number;
  high: number;
}

function sorted(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/** Linear-interpolation quantile, matching `src/lib/provenance.ts`. */
export function quantile(values: number[], q: number): number {
  if (!values.length) throw new Error("quantile of an empty sample");
  const s = sorted(values);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const THIN_SAMPLE = 4;
export const THIN_SPREAD = 2;

/**
 * A median with a spread that never claims more than the sample: one point is
 * widened ×2 either side, fewer than four is min…max×2, the rest is the IQR.
 * Same contract as `widenIfDegenerate` in the provenance ladder.
 */
export function robustBand(values: number[]): Band | null {
  const n = values.length;
  if (!n) return null;
  const s = sorted(values);
  const median = quantile(s, 0.5);
  if (n === 1) return { value: median, low: median / THIN_SPREAD, high: median * THIN_SPREAD };
  if (n < THIN_SAMPLE) return { value: median, low: s[0] / THIN_SPREAD, high: s[n - 1] * THIN_SPREAD };
  return { value: median, low: quantile(s, 0.25), high: quantile(s, 0.75) };
}

/* ---------- what the sample is allowed to claim ---------- */

export type EvidenceStatus = "single-report" | "preliminary" | "series" | "community";

export const PRELIMINARY_INTERVALS = 5;
export const COMMUNITY_REPORTERS = 3;

export function evidenceStatus(o: {
  intervals: number;
  windowTypes: number;
  reporters: number;
}): EvidenceStatus {
  if (o.intervals < 1) return "single-report";
  if (o.intervals < PRELIMINARY_INTERVALS) return "single-report";
  if (o.reporters >= COMMUNITY_REPORTERS) return "community";
  if (o.windowTypes >= 2) return "series";
  return "preliminary";
}

/* ---------- historical quota-change detection ---------- */

export const CHANGE_THRESHOLD = 0.25;
export const MIN_PERIOD_SAMPLES = 2;
export const PERSISTENT_SAMPLES = 3;

export type ChangeState = "probable" | "inconclusive" | "insufficient";

export interface ChangeVerdict {
  state: ChangeState;
  change: number | null;
  baseline: number | null;
  current: number | null;
  baselineSamples: number;
  currentSamples: number;
  threshold: number;
}

/**
 * Compare a baseline period against a recent one. A change is only "probable"
 * above the threshold, on both sides, on enough samples to persist — a step in
 * a provider's capacity is not a single noisy interval.
 */
export function detectQuotaChange(
  baseline: number[],
  recent: number[],
  threshold: number = CHANGE_THRESHOLD,
): ChangeVerdict {
  const verdict: ChangeVerdict = {
    state: "insufficient",
    change: null,
    baseline: null,
    current: null,
    baselineSamples: baseline.length,
    currentSamples: recent.length,
    threshold,
  };
  if (baseline.length < MIN_PERIOD_SAMPLES || recent.length < MIN_PERIOD_SAMPLES) return verdict;
  const b = quantile(baseline, 0.5);
  const c = quantile(recent, 0.5);
  verdict.baseline = b;
  verdict.current = c;
  if (!(b > 0)) return verdict;
  verdict.change = (c - b) / b;
  const persistent = baseline.length >= PERSISTENT_SAMPLES && recent.length >= PERSISTENT_SAMPLES;
  verdict.state = persistent && Math.abs(verdict.change) >= threshold ? "probable" : "inconclusive";
  return verdict;
}
