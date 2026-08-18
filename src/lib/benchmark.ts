/**
 * The base figures: tiering, the API rate card, token efficiency and the chart
 * geometry. Anything that has to carry a provenance rung lives in `provenance.ts`
 * instead, and a reset window is only ever expanded to a month there.
 *
 * Pure functions only — no DOM, no data. Covered by test/benchmark.test.ts.
 */
import type { KeyedConfig } from "../data/aa";

export type Tier = "frontier" | "near-frontier" | "efficient";

export function tierFor(intelligence: number, bestIntelligence: number): Tier {
  if (intelligence >= bestIntelligence * 0.85) return "frontier";
  if (intelligence >= bestIntelligence * 0.70) return "near-frontier";
  return "efficient";
}

/** The budget brackets the landing filters on — docs/methodology.md. */
export const PRICE_BRACKETS = [
  { key: "10", label: "~$10", upTo: 12 },
  { key: "20", label: "~$20", upTo: 29 },
  { key: "50", label: "~$50", upTo: 69 },
  { key: "100", label: "~$100", upTo: 149 },
  { key: "200", label: "$200+", upTo: Infinity },
] as const;

export type BracketKey = (typeof PRICE_BRACKETS)[number]["key"];

/** A plan with no published USD price belongs to no bracket. */
export function bracketFor(price: number | null | undefined): BracketKey | null {
  if (!(price != null && price > 0)) return null;
  return PRICE_BRACKETS.find(bracket => price <= bracket.upTo)!.key;
}

/** AA intelligence per 10k output tokens — a token-efficiency proxy, not a value claim. */
export function modelEfficiency(config: Pick<KeyedConfig, "intelligence" | "outputTokens">): number | null {
  if (!config?.intelligence || !config?.outputTokens) return null;
  return config.intelligence * 10_000 / config.outputTokens;
}

export interface Usage {
  input?: number;
  cachedInput?: number;
  cacheWrite?: number;
  output?: number;
}

/** Token counts × published per-million rates. */
export function apiEquivalentCost(usage: Usage | null | undefined, rates: Usage | null | undefined): number {
  return (["input", "cachedInput", "cacheWrite", "output"] as const)
    .reduce((total, key) => total + ((usage?.[key] || 0) / 1_000_000) * (rates?.[key] || 0), 0);
}

export interface CommunityObservation {
  usedPercent: number;
  rawTokens: number;
  apiUsd: number;
}

/** Community reports can inform a range. They can never become rankable. */
export function summarizeCommunityObservation({ usedPercent, rawTokens, apiUsd }: CommunityObservation) {
  if (!(usedPercent > 0) || !(rawTokens >= 0) || !(apiUsd >= 0)) return null;
  return {
    rawTokensPerPercent: rawTokens / usedPercent,
    apiUsdPerPercent: apiUsd / usedPercent,
    basis: "community-observed" as const,
    rankable: false as const,
  };
}

/* ---------- ledger maths ---------- */

export interface TaskShape { inTok: number; outTok: number }
export interface RateCard { in: number; out: number }

/** API cost of one modelled task. The ledger's single stated assumption. */
export function taskCost(task: TaskShape, rate: RateCard): number {
  return apiEquivalentCost({ input: task.inTok, output: task.outTok }, { input: rate.in, output: rate.out });
}

/* ---------- chart maths ---------- */

/** Effective cost per task on a subscription at utilization u (0..1]. */
export function subCostPerTask(price: number, tasksAtFullUse: number, u: number): number {
  return u <= 0 ? Infinity : price / (tasksAtFullUse * u);
}

/** Utilization at which the subscription matches PAYG. >1 means it never pays off. */
export function breakEvenUtilization(price: number, tasksAtFullUse: number, apiCostPerTask: number): number {
  return price / (tasksAtFullUse * apiCostPerTask);
}

export interface Point { label: string; x: number; y: number }

/**
 * Pareto: lower x is better, higher y is better.
 * Returns each point tagged with its dominators (empty array = on the frontier).
 */
export function paretoAnnotate<T extends Point>(points: T[]): (T & { dominators: T[] })[] {
  return points.map(p => ({
    ...p,
    dominators: points.filter(q =>
      q !== p && q.x <= p.x && q.y >= p.y && (q.x < p.x || q.y > p.y)
    ),
  }));
}
