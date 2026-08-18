/**
 * The provenance ladder. Every figure the pages show carries a rung, an interval
 * and the formula that produced it — docs/methodology.md.
 *
 * Pure functions only — no DOM, no data. `data/derived/estimates.ts` is the only place it
 * meets real figures; covered by test/provenance.test.ts.
 */

/**
 * Ordered strongest to weakest. The order *is* the doctrine:
 *   measured  the provider publishes the figure in dollars
 *   observed  somebody measured it and published the trace
 *   derived   the provider publishes a countable rate, and that rate binds
 *   chained   a published ratio applied to another plan's figure
 *   modelled  fitted from the plans in the same billing class that do disclose
 */
export const RUNGS = ["measured", "observed", "derived", "chained", "modelled"] as const;
export type Rung = (typeof RUNGS)[number];

/** A chain is never stronger than its anchor. */
export function weakest(a: Rung, b: Rung): Rung {
  return RUNGS.indexOf(a) >= RUNGS.indexOf(b) ? a : b;
}

export interface Band {
  value: number;
  low: number;
  high: number;
}

/** A band plus everything a derived cell must disclose. */
export interface Estimate extends Band {
  rung: Rung;
  /** The formula employed. */
  formula: string;
  /** The numeric assumptions it rests on. */
  assumptions: string[];
  /** Where the raw figure came from. */
  source: string;
  /** When that source was last read. */
  verified: string;
}

export const exact = (value: number): Band => ({ value, low: value, high: value });

export const isExact = (band: Band): boolean => band.high - band.low < 1e-9;

/** Widen or shrink a band by a constant. A negative factor is a bug, not a mirror. */
export function scaleBand(band: Band, factor: number): Band {
  if (!(factor > 0)) throw new Error(`scaleBand needs a positive factor, got ${factor}`);
  return { value: band.value * factor, low: band.low * factor, high: band.high * factor };
}

/** a ÷ b over intervals: the widest honest quotient. */
export function divideBands(a: Band, b: Band): Band {
  if (!(b.low > 0)) throw new Error("divideBands needs a strictly positive divisor band");
  return { value: a.value / b.value, low: a.low / b.high, high: a.high / b.low };
}

/** Clamp a band's ceiling to a hard upper bound, dragging the point estimate with it. */
export function capBand(band: Band, ceiling: number): Band {
  return {
    value: Math.min(band.value, ceiling),
    low: Math.min(band.low, ceiling),
    high: Math.min(band.high, ceiling),
  };
}

/** Linear-interpolation quartiles. Throws on an empty sample rather than returning NaN. */
export function quantiles(values: number[]): { q1: number; median: number; q3: number; n: number } {
  if (!values.length) throw new Error("quantiles needs at least one sample");
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => {
    const position = p * (sorted.length - 1);
    const lower = Math.floor(position);
    return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
  };
  return { q1: at(0.25), median: at(0.5), q3: at(0.75), n: sorted.length };
}

/**
 * Below this many samples the interquartile range is a coincidence, not a spread,
 * so a thin fit reports min/max widened by this factor instead. Overstating
 * precision on n=2 is the exact failure this whole module exists to prevent.
 */
export const THIN_SAMPLE = 4;
export const THIN_SPREAD = 2;

/**
 * A single report is a point, not a range. Anything that arrives with its bounds
 * collapsed gets the thin-sample spread rather than a zero-width interval, which
 * would read as precision nobody has.
 */
export function widenIfDegenerate(band: Band): Band {
  return isExact(band)
    ? { value: band.value, low: band.low / THIN_SPREAD, high: band.high * THIN_SPREAD }
    : band;
}

/**
 * The disclosed exchange rate of a billing class: API-equivalent dollars of
 * allowance per subscription dollar, fitted on the plans in that class which
 * publish both numbers. The band is the spread of real plans — not a confidence
 * interval in any statistical sense.
 */
export function fitAllowanceMultiple(samples: { price: number; allowance: number }[]) {
  const ratios = samples
    .filter(sample => sample.price > 0 && sample.allowance > 0)
    .map(sample => sample.allowance / sample.price);
  const fit = quantiles(ratios);
  const thin = fit.n < THIN_SAMPLE;
  return {
    ...fit,
    thin,
    band: {
      value: fit.median,
      low: thin ? Math.min(...ratios) / THIN_SPREAD : fit.q1,
      high: thin ? Math.max(...ratios) * THIN_SPREAD : fit.q3,
    } as Band,
  };
}

/**
 * The configuration a plan should be judged on. Allowance and price are fixed per
 * plan, so yield is monotone in intelligence per dollar of task cost and the best
 * configuration never depends on either — which is why this takes neither.
 */
export function bestConfig<C extends { intelligence: number; costPerTask: number; outputTokens: number }>(
  configs: C[],
): C | null {
  return [...configs].sort((a, b) =>
    (b.intelligence / b.costPerTask - a.intelligence / a.costPerTask)
    || (b.intelligence - a.intelligence)
    || (a.outputTokens - b.outputTokens))[0] ?? null;
}

/** The planning strategy's pick: the smartest configuration the plan grants. */
export function strongestConfig<C extends { intelligence: number; costPerTask: number }>(
  configs: C[],
): C | null {
  return [...configs].sort((a, b) =>
    (b.intelligence - a.intelligence) || (a.costPerTask - b.costPerTask))[0] ?? null;
}

/** Tasks a monthly dollar allowance buys at a model's AA cost per task. */
export function tasksFromAllowance(allowance: Band, costPerTask: number): Band {
  if (!(costPerTask > 0)) throw new Error(`tasksFromAllowance needs a positive cost, got ${costPerTask}`);
  return scaleBand(allowance, 1 / costPerTask);
}

/** AA intelligence potential per subscription dollar, as a band. */
export function yieldBand(intelligence: number, tasks: Band, price: Band): Band {
  return scaleBand(divideBands(tasks, price), intelligence);
}

/**
 * The one month length on the site. Exported because the pages print it inside the
 * formulas they invite the reader to recompute: a rounded copy in prose would not
 * reproduce the figure beside it.
 */
export const DAYS_PER_MONTH = 365.25 / 12;

/**
 * A countable reset window expanded to a month at 100 % use. This is an upper
 * bound and nothing else: it assumes a subscriber who never sleeps through a
 * reset, which no subscriber is.
 */
export function monthlyCeiling(count: number, hours: number): number {
  if (!(count > 0) || !(hours > 0)) throw new Error("monthlyCeiling needs a positive count and window");
  return count * (24 / hours) * DAYS_PER_MONTH;
}

/** A measured share of a quota window, expanded to a month. */
export function monthlyFromWindow(perPercent: number, windowDays: number): number {
  if (!(windowDays > 0)) throw new Error("monthlyFromWindow needs a positive window");
  return perPercent * 100 * (DAYS_PER_MONTH / windowDays);
}
