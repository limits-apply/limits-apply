import { expect, test } from "vitest";

import {
  RUNGS,
  bestConfig,
  capBand,
  divideBands,
  exact,
  fitAllowanceMultiple,
  isExact,
  monthlyCeiling,
  monthlyFromWindow,
  quantiles,
  scaleBand,
  strongestConfig,
  tasksFromAllowance,
  weakest,
  widenIfDegenerate,
  yieldBand,
} from "../src/lib/provenance";
import { CLASS_FIT, ESTIMATES, TASK_COST } from "../src/data/derived/estimates";
import { FIRST_PARTY_MEASUREMENTS } from "../src/data/measured";
import { FX, PLANS, PUBLISHED_MULTIPLES, narrowPlan, type RawPlan } from "../src/data/plans";

/* ---------- plans.ts's validator: the trust boundary a script-writable file needs ---------- */

const VALID_RAW: RawPlan = {
  plan: "Test Plan", price: 20, quantified: true, equiv: null,
  billing: "flat", conf: "medium", src: "example.com/pricing", quota: "test",
  sourceUrl: "https://example.com/pricing", verified: "2026-08-17",
};

test("narrowPlan accepts a well-formed row unchanged", () => {
  expect(narrowPlan(VALID_RAW)).toEqual(VALID_RAW);
});

test("narrowPlan throws on a billing value outside the enum", () => {
  expect(() => narrowPlan({ ...VALID_RAW, billing: "subscription" })).toThrow(/billing/);
});

test("narrowPlan throws on a confidence value outside the enum", () => {
  expect(() => narrowPlan({ ...VALID_RAW, conf: "certain" })).toThrow(/conf/);
});

test("narrowPlan throws on an equiv.unit value outside the enum", () => {
  expect(() => narrowPlan({ ...VALID_RAW, equiv: { per: 10, hours: 5, unit: "credits" } })).toThrow(/equiv\.unit/);
});

test("narrowPlan throws on a sourceUrl that isn't https", () => {
  expect(() => narrowPlan({ ...VALID_RAW, sourceUrl: "http://example.com" })).toThrow(/sourceUrl/);
});

test("narrowPlan throws on a verified date that isn't ISO YYYY-MM-DD", () => {
  expect(() => narrowPlan({ ...VALID_RAW, verified: "Aug 17 2026" })).toThrow(/verified/);
});

test("every committed PLANS row has a real https sourceUrl and an ISO verified date", () => {
  for (const plan of PLANS) {
    expect(plan.sourceUrl.startsWith("https://"), plan.plan).toBe(true);
    expect(plan.verified, plan.plan).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }
});

/* ---------- the ladder's maths ---------- */

test("weakest keeps a chain no stronger than its anchor, in both argument orders", () => {
  expect(weakest("measured", "chained")).toBe("chained");
  expect(weakest("chained", "measured")).toBe("chained");
  expect(weakest("modelled", "chained")).toBe("modelled");
  expect(weakest("measured", "measured")).toBe("measured");
});

test("the rung order runs strongest to weakest, and every rung is distinct", () => {
  expect([...RUNGS]).toEqual(["measured", "observed", "derived", "chained", "modelled"]);
  expect(new Set(RUNGS).size).toBe(RUNGS.length);
});

test("quantiles interpolate rather than snapping to a sample", () => {
  expect(quantiles([1, 2, 3, 4]).median).toBe(2.5);
  expect(quantiles([0.5, 1, 1, 1, 1.2, 1.5, 1.795, 2]).median).toBeCloseTo(1.1, 12);
  expect(quantiles([7]).q1).toBe(7);
  expect(() => quantiles([])).toThrow();
});

test("dividing bands widens rather than narrowing: low ÷ high and high ÷ low", () => {
  const result = divideBands({ value: 100, low: 80, high: 120 }, { value: 10, low: 5, high: 20 });
  expect(result).toEqual({ value: 10, low: 4, high: 24 });
  expect(() => divideBands(exact(1), { value: 1, low: 0, high: 2 })).toThrow();
});

test("capping a band drags the point estimate down with the ceiling", () => {
  expect(capBand({ value: 100, low: 50, high: 200 }, 75)).toEqual({ value: 75, low: 50, high: 75 });
  expect(capBand({ value: 100, low: 50, high: 200 }, Infinity)).toEqual({ value: 100, low: 50, high: 200 });
});

test("scaleBand refuses a negative factor rather than mirroring the interval", () => {
  expect(scaleBand({ value: 2, low: 1, high: 4 }, 3)).toEqual({ value: 6, low: 3, high: 12 });
  expect(() => scaleBand(exact(1), -1)).toThrow();
  expect(() => scaleBand(exact(1), 0)).toThrow();
});

test("a single report is widened instead of claiming a zero-width interval", () => {
  expect(isExact(exact(10))).toBe(true);
  expect(widenIfDegenerate(exact(10))).toEqual({ value: 10, low: 5, high: 20 });
  const reported = { value: 10, low: 9, high: 11 };
  expect(widenIfDegenerate(reported)).toBe(reported);
});

test("a thin fit reports min/max widened, never an interquartile range of two points", () => {
  const thin = fitAllowanceMultiple([{ price: 10, allowance: 200 }, { price: 20, allowance: 480 }]);
  expect(thin.thin).toBe(true);
  expect(thin.band.value).toBe(22);
  expect(thin.band.low).toBe(10);  // min ratio 20 ÷ 2
  expect(thin.band.high).toBe(48); // max ratio 24 × 2

  const thick = fitAllowanceMultiple([1, 2, 3, 4].map(n => ({ price: 10, allowance: 10 * n })));
  expect(thick.thin).toBe(false);
  expect(thick.band.low).toBe(thick.q1);
  expect(thick.band.high).toBe(thick.q3);
});

test("a reset window becomes a month at 100 % use, and a quota window scales to one", () => {
  expect(monthlyCeiling(160, 3)).toBeCloseTo(160 * 8 * (365.25 / 12), 9);
  expect(monthlyFromWindow(1, 7)).toBeCloseTo(100 * (365.25 / 12) / 7, 9);
  expect(() => monthlyCeiling(160, 0)).toThrow();
  expect(() => monthlyFromWindow(1, 0)).toThrow();
});

test("allowance and price being fixed per plan, the best config maximises index per unit cost", () => {
  const configs = [
    { name: "smartest", intelligence: 63, costPerTask: 2.34, outputTokens: 40_000 },
    { name: "efficient", intelligence: 55.6, costPerTask: 0.37, outputTokens: 4_758 },
  ];
  expect(bestConfig(configs)!.name).toBe("efficient");
  expect(bestConfig([])).toBe(null);
});

test("the best config breaks an exact tie on fewer output tokens", () => {
  const terse = { name: "terse", intelligence: 60, costPerTask: 1, outputTokens: 10_000 };
  expect(bestConfig([{ ...terse, name: "verbose", outputTokens: 80_000 }, terse])!.name).toBe("terse");
});

test("the strongest config maximises intelligence, whatever it costs", () => {
  const cheap = { intelligence: 52.3, costPerTask: 0.05 };
  const smart = { intelligence: 63.1, costPerTask: 2.34 };
  expect(strongestConfig([cheap, smart])).toBe(smart);
  expect(strongestConfig([])).toBeNull();
});

test("the strongest config breaks an intelligence tie on the cheaper task", () => {
  const dear = { intelligence: 63.1, costPerTask: 2.34 };
  const fair = { intelligence: 63.1, costPerTask: 1.90 };
  expect(strongestConfig([dear, fair])).toBe(fair);
});

test("yield carries the allowance interval through to the proxy", () => {
  const tasks = tasksFromAllowance({ value: 100, low: 50, high: 200 }, 0.5);
  expect(tasks).toEqual({ value: 200, low: 100, high: 400 });
  const proxy = yieldBand(60, tasks, exact(20));
  expect(proxy).toEqual({ value: 600, low: 300, high: 1200 });
  expect(() => tasksFromAllowance(exact(10), 0)).toThrow();
});

/* ---------- the ladder applied to the real data ---------- */

test("every plan resolves to a price and an allowance — no cell is left blank", () => {
  expect(Object.keys(ESTIMATES)).toHaveLength(PLANS.length);
  for (const { plan, price, allowance } of Object.values(ESTIMATES)) {
    expect(price.value, plan.plan).toBeGreaterThan(0);
    expect(allowance.value, plan.plan).toBeGreaterThan(0);
    expect(allowance.low, plan.plan).toBeLessThanOrEqual(allowance.value);
    expect(allowance.high, plan.plan).toBeGreaterThanOrEqual(allowance.value);
    expect(RUNGS, plan.plan).toContain(allowance.rung);
    expect(allowance.formula, plan.plan).toBeTruthy();
    expect(allowance.source, plan.plan).toBeTruthy();
    expect(allowance.verified, plan.plan).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }
});

test("a figure the provider publishes in dollars is passed through untouched", () => {
  const copilot = ESTIMATES["GitHub Copilot Pro"];
  expect(copilot.allowance.rung).toBe("measured");
  expect(copilot.allowance).toMatchObject({ value: 15, low: 15, high: 15 });
  expect(copilot.allowance.assumptions).not.toHaveLength(0);
});

/**
 * Warp publishes both halves — $20 on Build, $240 on Max, and "12× Build" — so the
 * chaining rule can be checked against the provider's own arithmetic instead of
 * against itself.
 */
test("a published ratio reproduces the published allowance it points at", () => {
  const { of, times } = PUBLISHED_MULTIPLES["Warp Max"];
  expect(of).toBe("Warp Build");
  expect(ESTIMATES[of].allowance.value * times).toBe(ESTIMATES["Warp Max"].allowance.value);
});

test("a chain inherits the weakest rung in it, never the rung of its own step", () => {
  // Anchored on an observed measurement, so the chain stays chained…
  expect(ESTIMATES["Claude Max 5×"].allowance.rung).toBe("observed");
  expect(ESTIMATES["Claude Pro"].allowance.rung).toBe("chained");
  expect(ESTIMATES["Claude Max 20×"].allowance.rung).toBe("chained");
  // …but anchored on a fit, the chain can be no better than that fit.
  expect(ESTIMATES["Cursor Pro"].allowance.rung).toBe("modelled");
  expect(ESTIMATES["Cursor Ultra"].allowance.rung).toBe("modelled");
});

test("chaining Claude Pro off the measured Max tier divides rather than invents", () => {
  const pro = ESTIMATES["Claude Pro"].allowance;
  const max5 = ESTIMATES["Claude Max 5×"].allowance;
  expect(pro.value).toBeCloseTo(max5.value / 5, 9);
  expect(pro.formula).toContain("Claude Max 5×");
});

test("a published rate is only the answer while it binds below the class fit", () => {
  // Mistral's 150 answers/day converts to less than a $14.99 flat plan would
  // ordinarily return, so the rate is the binding constraint and the rung is derived.
  const mistral = ESTIMATES["Mistral Le Chat Pro"];
  expect(mistral.allowance.rung).toBe("derived");
  expect(mistral.allowance.value).toBeCloseTo(monthlyCeiling(150, 24) * TASK_COST, 9);

  // MiniMax's 1,500 requests/5h converts to far more, so the rate says nothing
  // useful about the allowance and the fit takes over.
  expect(ESTIMATES["MiniMax Starter"].allowance.rung).toBe("modelled");
});

test("a rate ceiling still caps the fit it lost to", () => {
  for (const { plan, allowance } of Object.values(ESTIMATES)) {
    if (!plan.equiv?.per || !plan.equiv.hours) continue;
    const ceiling = monthlyCeiling(plan.equiv.per, plan.equiv.hours) * TASK_COST;
    expect(allowance.high, plan.plan).toBeLessThanOrEqual(ceiling + 1e-6);
  }
});

test("the two billing classes are fitted apart, because one fit would fit neither", () => {
  expect(CLASS_FIT.metered.n).toBe(8);
  expect(CLASS_FIT.metered.thin).toBe(false);
  expect(CLASS_FIT.metered.band.value).toBeCloseTo(1.1, 6);

  expect(CLASS_FIT.flat.n).toBe(3);
  expect(CLASS_FIT.flat.thin).toBe(true);
  expect(CLASS_FIT.flat.band.value).toBeGreaterThan(10 * CLASS_FIT.metered.band.value);
});

test("a class fit is built only from plans of that class that disclose first-hand", () => {
  const disclosed = PLANS.filter(plan => plan.equiv?.usd != null);
  expect(disclosed.every(plan => ESTIMATES[plan.plan].allowance.rung === "measured")).toBe(true);
  for (const billing of ["metered", "flat"] as const) {
    const own = disclosed.filter(plan => plan.billing === billing);
    // The flat class also counts the two plans a subscriber measured, which publish
    // no dollar figure of their own — hence ≤, not an equality, on that side.
    expect(own.length, billing).toBeLessThanOrEqual(CLASS_FIT[billing].n);
  }
  expect(disclosed.filter(plan => plan.billing === "flat")).toHaveLength(1);
});

test("a price nobody publishes is derived from a currency or inverted from the allowance", () => {
  expect(ESTIMATES["Google AI Plus"].price.rung).toBe("derived");
  expect(ESTIMATES["Google AI Plus"].price.value).toBeCloseTo(4.99 * FX.rates.EUR, 9);
  expect(ESTIMATES["GLM Coding Pro"].price.rung).toBe("modelled");
  expect(ESTIMATES["GLM Coding Pro"].price.value)
    .toBeGreaterThan(ESTIMATES["GLM Coding Lite"].price.value);
  expect(PLANS.filter(plan => plan.price != null)
    .every(plan => ESTIMATES[plan.plan].price.rung === "measured")).toBe(true);
});

test("every inferred figure states its assumptions, and no measured one invents a range", () => {
  for (const { plan, allowance } of Object.values(ESTIMATES)) {
    if (allowance.rung === "measured") {
      expect(isExact(allowance), plan.plan).toBe(true);
    } else {
      expect(allowance.assumptions.length, plan.plan).toBeGreaterThan(0);
      expect(isExact(allowance), plan.plan).toBe(false);
    }
  }
});

test("every first-party measurement names a plan that exists and meets the protocol minimum", () => {
  for (const row of FIRST_PARTY_MEASUREMENTS) {
    // Only a row that feeds a plan's allowance must name a plans.json row; a
    // metered control names its access path, which has no PLANS row to claim.
    if (row.apiPerPercent !== null) expect(PLANS.some(plan => plan.plan === row.plan)).toBe(true);
    expect(row.runs).toBeGreaterThanOrEqual(10);
    expect(row.outcomes.pass + row.outcomes.partial + row.outcomes.fail).toBe(row.runs);
    expect(row.evidence).toBeTruthy();
    expect(Number.isNaN(Date.parse(row.verified))).toBe(false);
  }
});

test("a first-party trace outranks the community trace for the same plan", () => {
  // Guarded so it activates the day the first subscription row is committed.
  for (const row of FIRST_PARTY_MEASUREMENTS) {
    if (!row.apiPerPercent) continue;
    const estimate = ESTIMATES[row.plan];
    expect(estimate.allowance.rung).toBe("observed");
    expect(estimate.allowance.assumptions.join(" ")).toContain("first-party");
  }
});
