/**
 * Every plan resolved through the ladder, so no figure on either table is blank.
 *
 * This is the only place data meets `lib/provenance.ts`. A cell is filled here or
 * it is not filled at all — pages read the result, they never re-derive it.
 */
import { taskCost } from "../../lib/benchmark";
import {
  type Estimate,
  DAYS_PER_MONTH, THIN_SPREAD, capBand, exact, fitAllowanceMultiple, isExact, monthlyCeiling,
  monthlyFromWindow, scaleBand, weakest, widenIfDegenerate,
} from "../../lib/provenance";
import { COMMUNITY_MEASUREMENTS } from "../community";
import { FIRST_PARTY_MEASUREMENTS } from "../measured";
import {
  ALT_PRICES, FX, PLANS, PUBLISHED_MULTIPLES, VERIFIED_ON,
  type Billing, type Plan,
} from "../plans";
import { RATE, TASK } from "../task";

/** The ledger's stated assumption, in dollars per modelled task. */
export const TASK_COST = taskCost(TASK, RATE);

/**
 * Three significant figures at the small end, because these strings are printed as
 * arithmetic the reader is invited to redo. A per-task cost shown as `$0.04` does
 * not reproduce the ceiling standing next to it; `$0.042` does.
 */
const usd = (n: number) =>
  "$" + n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 3 : n < 1000 ? 2 : 0 });
const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

const BY_NAME = new Map(PLANS.map(plan => [plan.plan, plan]));

/** The strongest trace for a plan — first-party ahead of community — expanded from its quota window to a month. */
function observedAllowance(name: string) {
  const firstParty = FIRST_PARTY_MEASUREMENTS.find(
    measurement => measurement.plan === name && measurement.apiPerPercent !== null,
  );
  const row = firstParty ?? COMMUNITY_MEASUREMENTS.find(measurement => measurement.plan === name);
  if (!row) return null;
  const [low, high] = row.apiPerPercent!.map(perPercent => monthlyFromWindow(perPercent, row.windowDays));
  const perPercent = (row.apiPerPercent![0] + row.apiPerPercent![1]) / 2;
  const reported = { value: (low + high) / 2, low, high };
  return {
    band: widenIfDegenerate(reported),
    single: isExact(reported),
    perPercent,
    row,
    source: row.sources[0][1],
    protocol: firstParty ? `first-party protocol ${firstParty.workload} · n=${firstParty.runs} runs` : null,
    verified: firstParty ? firstParty.verified : VERIFIED_ON,
  };
}

/** The published reset rate expanded to a month, in dollars — an upper bound only. */
function publishedCeiling(plan: Plan): number | null {
  const { per, hours } = plan.equiv ?? {};
  return per == null || hours == null ? null : monthlyCeiling(per, hours) * TASK_COST;
}

/** Plans whose allowance needs no fit — they anchor everything else. */
const ANCHORS = PLANS.flatMap(plan => {
  const observed = observedAllowance(plan.plan);
  const band = plan.equiv?.usd != null ? exact(plan.equiv.usd) : observed?.band;
  return band && plan.price != null ? [{ plan, allowance: band.value, price: plan.price }] : [];
});

/**
 * One exchange rate per billing class, fitted only on that class's anchors. The
 * two classes disagree by a factor of twenty, which is the finding, not the noise:
 * metered plans hand back roughly what you pay, flat plans hand back far more to
 * whoever pushes them hardest.
 */
export const CLASS_FIT: Record<Billing, ReturnType<typeof fitAllowanceMultiple>> =
  Object.fromEntries((["metered", "flat"] as const).map(billing => {
    const samples = ANCHORS.filter(anchor => anchor.plan.billing === billing);
    if (!samples.length) throw new Error(`no anchor plan discloses an allowance for billing class ${billing}`);
    return [billing, fitAllowanceMultiple(samples)];
  })) as Record<Billing, ReturnType<typeof fitAllowanceMultiple>>;

const fitNote = (billing: Billing) => {
  const fit = CLASS_FIT[billing];
  return `${billing} class fit: ×${num(fit.band.value)} of price, band ×${num(fit.band.low)}–×${num(fit.band.high)}`
    + ` (n=${fit.n}${fit.thin ? ", thin sample — band widened" : ""})`;
};

export interface PlanEstimate {
  plan: Plan;
  /** USD / month. */
  price: Estimate;
  /** API-equivalent USD of usage the allowance covers per month. */
  allowance: Estimate;
}

const allowances = new Map<string, Estimate>();
const prices = new Map<string, Estimate>();
const resolving = new Set<string>();

function enter(name: string, what: string): Plan {
  const plan = BY_NAME.get(name);
  if (!plan) throw new Error(`unknown plan ${name}`);
  const key = `${what}:${name}`;
  if (resolving.has(key)) throw new Error(`circular ladder at ${key}`);
  resolving.add(key);
  return plan;
}

function resolvePrice(name: string): Estimate {
  const cached = prices.get(name);
  if (cached) return cached;
  const plan = enter(name, "price");

  let estimate: Estimate;
  const alt = ALT_PRICES[name];
  if (plan.price != null) {
    estimate = {
      ...exact(plan.price),
      rung: "measured",
      formula: `${usd(plan.price)} / month, as published`,
      assumptions: [],
      source: plan.sourceUrl,
      verified: plan.verified,
    };
  } else if (alt) {
    const rate = FX.rates[alt.currency];
    estimate = {
      ...exact(alt.amount * rate),
      rung: "derived",
      formula: `${alt.amount} ${alt.currency} × ${rate} = ${usd(alt.amount * rate)} / month`,
      assumptions: [`${alt.currency}/USD ${rate} on ${FX.verified}`],
      source: FX.source,
      verified: FX.verified,
    };
  } else {
    // No price anywhere: invert the class fit against an allowance that reached a
    // rung above `modelled` on its own. Nothing else could have got here.
    const allowance = resolveAllowance(name);
    const fit = CLASS_FIT[plan.billing];
    estimate = {
      value: allowance.value / fit.band.value,
      low: allowance.low / fit.band.high,
      high: allowance.high / fit.band.low,
      rung: "modelled",
      formula: `allowance ${usd(allowance.value)} ÷ ×${num(fit.band.value)} = ${usd(allowance.value / fit.band.value)} / month`,
      assumptions: [fitNote(plan.billing), "the provider publishes a quota for this tier but no price"],
      source: plan.sourceUrl,
      verified: plan.verified,
    };
  }

  resolving.delete(`price:${name}`);
  prices.set(name, estimate);
  return estimate;
}

function resolveAllowance(name: string): Estimate {
  const cached = allowances.get(name);
  if (cached) return cached;
  const plan = enter(name, "allowance");

  const ceiling = publishedCeiling(plan);
  const ceilingNote = ceiling == null ? [] : [
    `published rate caps the month at ${usd(ceiling)} of API-equivalent work`
    + ` (${num(plan.equiv!.per!)} ${plan.equiv!.unit} / ${plan.equiv!.hours} h at ${usd(TASK_COST)} per modelled task)`,
  ];

  const estimate = resolveAllowanceRung(plan, ceiling, ceilingNote);
  resolving.delete(`allowance:${name}`);
  allowances.set(name, estimate);
  return estimate;
}

function resolveAllowanceRung(plan: Plan, ceiling: number | null, ceilingNote: string[]): Estimate {
  const observed = observedAllowance(plan.plan);
  const multiple = PUBLISHED_MULTIPLES[plan.plan];

  if (plan.equiv?.usd != null) {
    return {
      ...exact(plan.equiv.usd),
      rung: "measured",
      formula: `${usd(plan.equiv.usd)} / month of usage, as published`,
      assumptions: ["the provider's credits are priced at its own API rates"],
      source: plan.sourceUrl,
      verified: plan.verified,
    };
  }

  if (observed) {
    return {
      ...observed.band,
      rung: "observed",
      formula: `${usd(observed.perPercent)} per 1 % of the window × 100 × (${DAYS_PER_MONTH} ÷ ${observed.row.windowDays} days)`
        + ` = ${usd(observed.band.value)} / month`,
      assumptions: [
        ...(observed.protocol ? [observed.protocol] : []),
        `${observed.row.evidence} — one account's workload, not a cohort`,
        "the window resets exactly as documented",
        ...(observed.single ? [`a single report carries no range, so the band is widened ×${THIN_SPREAD} either side`] : []),
        ...ceilingNote,
      ],
      source: observed.source,
      // For a community trace this is not plan.verified: that is the date a report
      // was read, which has nothing to do with when the plan's own price/quota was
      // last re-checked — COMMUNITY_MEASUREMENTS carries no date of its own, so the
      // site-wide oldest is the least-wrong fallback until it does. A first-party
      // row carries the date of its own last run instead.
      verified: observed.verified,
    };
  }

  if (multiple) {
    const base = resolveAllowance(multiple.of);
    const scaled = capBand(scaleBand(base, multiple.times), ceiling ?? Infinity);
    return {
      ...scaled,
      rung: weakest(base.rung, "chained"),
      formula: `${multiple.of} ${usd(base.value)} × ${num(multiple.times)} = ${usd(scaled.value)} / month`,
      assumptions: [multiple.basis, `inherits the ${base.rung} rung of ${multiple.of}`, ...ceilingNote],
      source: plan.sourceUrl,
      verified: plan.verified,
    };
  }

  // Only the two fitted branches below need a price, and a plan that has neither a
  // price nor a stronger rung above would be a genuine hole — the ladder has none.
  const fit = CLASS_FIT[plan.billing];
  const price = resolvePrice(plan.plan);
  const atMarketRate = {
    value: fit.band.value * price.value,
    low: fit.band.low * price.low,
    high: fit.band.high * price.high,
  };
  const fitted = capBand(atMarketRate, ceiling ?? Infinity);

  if (ceiling != null && ceiling < atMarketRate.value) {
    return {
      value: ceiling,
      low: Math.min(fitted.low, ceiling),
      high: ceiling,
      rung: "derived",
      formula: `${num(plan.equiv!.per!)} ${plan.equiv!.unit} / ${plan.equiv!.hours} h → ${usd(ceiling)} / month`,
      assumptions: [
        "every reset window used in full, which no subscriber does",
        `one ${plan.equiv!.unit!.replace(/s$/, "")} costs one modelled task at ${usd(TASK_COST)}`,
        `the published rate binds below the ${plan.billing} class fit of ${usd(atMarketRate.value)}`,
      ],
      source: plan.sourceUrl,
      verified: plan.verified,
    };
  }

  return {
    ...fitted,
    rung: "modelled",
    formula: `${usd(price.value)} × ${num(fit.band.value)} = ${usd(fitted.value)} / month`,
    assumptions: [
      fitNote(plan.billing),
      "no allowance published, and nobody has measured this plan",
      ...ceilingNote,
    ],
    source: plan.sourceUrl,
    verified: plan.verified,
  };
}

export const ESTIMATES: Record<string, PlanEstimate> = Object.fromEntries(
  PLANS.map(plan => [plan.plan, {
    plan,
    price: resolvePrice(plan.plan),
    allowance: resolveAllowance(plan.plan),
  }]),
);

export const estimateFor = (name: string): PlanEstimate => {
  const estimate = ESTIMATES[name];
  if (!estimate) throw new Error(`no estimate for ${name}`);
  return estimate;
};

