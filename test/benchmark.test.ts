import { expect, test } from "vitest";

import {
  PRICE_BRACKETS,
  apiEquivalentCost,
  bracketFor,
  breakEvenUtilization,
  modelEfficiency,
  paretoAnnotate,
  subCostPerTask,
  summarizeCommunityObservation,
  taskCost,
  tierFor,
} from "../src/lib/benchmark";
import { PLANS, type Equiv } from "../src/data/plans";
import { RATE, TASK } from "../src/data/task";
import { COMMUNITY_MEASUREMENTS, codexPlusObserved } from "../src/data/community";
import { AGENT_POINTS } from "../src/data/agents";
import { PLAN_MODEL_KEYS, SCORE_PLANS } from "../src/data/aa";
import { ESTIMATES, allowanceForConfig } from "../src/data/derived/estimates";
import { planView } from "../src/data/plan-view";
import { OPENCODE_MODEL_CAP, OPENCODE_QUOTA, UNLIMITED_OPENCODE_MODELS, UNSCORED_OPENCODE_MODELS } from "../src/data/opencode";

test("apiEquivalentCost weights uncached, cached, cache-write, and output tokens independently", () => {
  const cost = apiEquivalentCost(
    { input: 1_000_000, cachedInput: 2_000_000, cacheWrite: 400_000, output: 100_000 },
    { input: 5, cachedInput: 0.5, cacheWrite: 6.25, output: 30 },
  );

  expect(cost).toBe(11.5);
});

test("summarizeCommunityObservation normalizes one measured workload without making it rankable", () => {
  const result = summarizeCommunityObservation({
    usedPercent: 71,
    rawTokens: 118_159_982,
    apiUsd: 82.10,
  })!;

  expect(Math.round(result.rawTokensPerPercent)).toBe(1_664_225);
  expect(Number(result.apiUsdPerPercent.toFixed(3))).toBe(1.156);
  expect(result.basis).toBe("community-observed");
  expect(result.rankable).toBe(false);
});

test("summarizeCommunityObservation rejects an empty usage delta", () => {
  expect(summarizeCommunityObservation({ usedPercent: 0, rawTokens: 10, apiUsd: 1 })).toBe(null);
});

test("modelEfficiency penalizes extra output and reasoning tokens at equal intelligence", () => {
  expect(modelEfficiency({ intelligence: 60, outputTokens: 20_000 })).toBe(30);
  expect(modelEfficiency({ intelligence: 60, outputTokens: 40_000 })).toBe(15);
});

/* ---------- chart maths (was the index.html selfcheck) ---------- */

test("subCostPerTask falls with utilization and never divides by zero", () => {
  // A $20 plan covering 200 tasks costs $0.10/task fully used, $0.20 at half use.
  expect(subCostPerTask(20, 200, 1)).toBeCloseTo(0.10, 12);
  expect(subCostPerTask(20, 200, 0.5)).toBeCloseTo(0.20, 12);
  expect(subCostPerTask(20, 200, 0)).toBe(Infinity);
});

test("breakEvenUtilization reports >1 rather than clamping when a plan never pays off", () => {
  expect(breakEvenUtilization(20, 200, 0.35)).toBeCloseTo(20 / 70, 12);
  expect(breakEvenUtilization(20, 10, 0.35)).toBeGreaterThan(1);
});

test("paretoAnnotate needs cheaper AND better to dominate, and ties dominate nothing", () => {
  const annotated = paretoAnnotate([
    { label: "cheap+good", x: 1, y: 10 },
    { label: "dear+bad", x: 2, y: 5 },
    { label: "dear+best", x: 3, y: 20 },
    { label: "tie", x: 1, y: 10 },
  ]);
  const dominators = Object.fromEntries(
    annotated.map(p => [p.label, p.dominators.map(d => d.label)]));

  expect(dominators["dear+bad"]).toEqual(["cheap+good", "tie"]);
  expect(dominators["cheap+good"]).toEqual([]);
  expect(dominators["dear+best"]).toEqual([]);
  expect(dominators.tie).toEqual([]);
});

test("the agent scatter actually contains dominated points, or the chart lies", () => {
  expect(paretoAnnotate(AGENT_POINTS).some(p => p.dominators.length > 0)).toBe(true);
});

/* ---------- ledger maths (was the ledger.html selfcheck) ---------- */

test("taskCost derives the ledger's single stated assumption", () => {
  expect(taskCost(TASK, RATE)).toBeCloseTo(0.042, 12);
});

/* ---------- data invariants (the argument of both pages) ---------- */

/** A plan is convertible when it publishes either dollars or a countable rate. */
const convertible = (equiv: Equiv): boolean =>
  equiv != null && (equiv.usd != null || (equiv.per != null && (equiv.hours ?? 0) > 0));

test("the disclosure staircase descends: priced ≥ quantified ≥ convertible ≥ measured", () => {
  const steps = [
    PLANS.filter(p => p.price != null).length,
    PLANS.filter(p => p.quantified).length,
    PLANS.filter(p => convertible(p.equiv)).length,
    PLANS.filter(p => ESTIMATES[p.plan].allowance?.rung === "observed").length,
  ];

  expect(steps.every((v, i) => i === 0 || v <= steps[i - 1])).toBe(true);
  // OpenCode Go left the convertible rows on 2026-10-14: its docs stopped
  // publishing a plan-level dollar allowance, so it now resolves as modelled.
  expect(steps[2]).toBe(14);
  // Layer 2 has not run: the only measured plans are the two somebody else measured.
  expect(steps[3]).toBe(2);
});

test("every plan carries a price field, a quota, a confidence and a source", () => {
  for (const plan of PLANS) {
    expect(plan.price === null || typeof plan.price === "number").toBe(true);
    expect(plan.quota).toBeTruthy();
    expect(plan.conf).toBeTruthy();
    expect(plan.src).toBeTruthy();
  }
});

test("every plan name resolves to a provider icon that exists on disk", () => {
  const icons = new Set(Object.keys(import.meta.glob("../src/assets/icons/*.png"))
    .map(path => path.split("/").pop()!.slice(0, -4)));
  const names = [...PLANS.map(plan => plan.plan), ...COMMUNITY_MEASUREMENTS.map(row => row.plan)];
  for (const name of names) {
    expect(icons, name).toContain(name.split(" ")[0].toLowerCase());
  }
});

test("only plans with a mapped model reach the decision table, and each keeps its plan record", () => {
  expect(SCORE_PLANS.length).toBeGreaterThan(0);
  expect(SCORE_PLANS.every(plan => plan.configs.length > 0)).toBe(true);
  expect(SCORE_PLANS.every(plan => plan.capacity === plan.equiv)).toBe(true);
});

/**
 * Ledger-only rows: their provider grants a model this AA snapshot has never
 * scored, and no sibling of that family is in it either, so there is no index to
 * attach and no honest way to invent one.
 */
const NO_MODEL_MAPPING = [
  "Mistral Le Chat Pro", "GitHub Copilot Pro", "Perplexity Pro", "Perplexity Max",
  "Kimi Allegro", "Kimi Vivace", "Qwen Coding Pro", "MiniMax Starter", "MiniMax Plus", "MiniMax Max", "Replit Core",
  "Replit Pro", "Factory Pro", "Factory Plus", "Factory Max", "Devin Pro", "Devin Max", "Poe Starter",
  "Poe Premium", "Poe Premium Plus", "Poe Pro", "Poe Pro Max", "OpenCode Zen Big Pickle",
  "OpenCode Zen MiMo V2.5 Free", "OpenCode Zen Ling 3.0 Flash Fin Free",
  "OpenCode Zen Nemotron 3 Ultra Free", "OpenCode Zen Nemotron 3.5 Lightning Free",
  "OpenCode Zen Muse Spark 1.3 Contributor Free", "OpenCode Zen Jev 1.13 Free", "GitHub Copilot Free",
];

test("a plan without a model mapping is listed as deliberate, never dropped by accident", () => {
  const unmapped = PLANS.filter(p => !PLAN_MODEL_KEYS[p.plan]).map(p => p.plan);
  expect(unmapped).toEqual(NO_MODEL_MAPPING);
  expect(Object.keys(PLAN_MODEL_KEYS).filter(name => !PLANS.some(p => p.plan === name))).toEqual([]);
  expect(SCORE_PLANS.length).toBe(PLANS.length - NO_MODEL_MAPPING.length);
});

test("price brackets are contiguous and put each real price at the point a buyer would call it", () => {
  expect(PRICE_BRACKETS.every((b, i) => i === 0 || b.upTo > PRICE_BRACKETS[i - 1].upTo)).toBe(true);
  expect(PRICE_BRACKETS.at(-1)!.upTo).toBe(Infinity);

  expect(bracketFor(4.99)).toBe("10");   // Poe Starter
  expect(bracketFor(10)).toBe("10");     // GitHub Copilot Pro
  expect(bracketFor(19.99)).toBe("20");  // Google AI Pro
  expect(bracketFor(39)).toBe("50");     // GitHub Copilot Pro+
  expect(bracketFor(99.99)).toBe("100"); // Poe Pro
  expect(bracketFor(100)).toBe("100");   // GitHub Copilot Max
  expect(bracketFor(249.99)).toBe("200");// Poe Pro Max
});

test("an unpriced plan belongs to no bracket rather than being guessed into the cheapest one", () => {
  expect(bracketFor(null)).toBe(null);
  expect(bracketFor(0)).toBe("0");        // a published $0 is a price
  expect(PLANS.filter(p => bracketFor(p.price) === null).every(p => p.price == null)).toBe(true);
  expect(PLANS.filter(p => p.price != null).every(p => bracketFor(p.price) !== null)).toBe(true);
});

test("every free row carries its data terms and never a convertible allowance", () => {
  for (const plan of PLANS.filter(p => p.price === 0)) {
    expect(plan.terms, plan.plan).not.toBeNull();
    expect(convertible(plan.equiv), plan.plan).toBe(false);
  }
  expect(PLANS.filter(p => p.terms != null).every(p => p.price === 0)).toBe(true);
});

test("community observations can inform a range but never satisfy ranking eligibility", () => {
  expect(codexPlusObserved.rawTokensPerPercent).toBeCloseTo(118_159_982 / 71, 9);
  expect(COMMUNITY_MEASUREMENTS.some(row => row.rankable)).toBe(false);
});

test("every model OpenCode Go grants carries the per-model dollar cap OpenCode publishes for it", () => {
  for (const key of PLAN_MODEL_KEYS["OpenCode Go"]) {
    expect(OPENCODE_QUOTA[key]?.usdPerMonth, key).toBeGreaterThan(0);
    expect(OPENCODE_QUOTA[key]?.requestsPer5h, key).toBeGreaterThan(0);
  }
  expect(UNSCORED_OPENCODE_MODELS.length).toBeGreaterThan(0);
});

test("the quota OpenCode Go prints names the model cap the docs publish, not a plan-level total", () => {
  const quota = PLANS.find(plan => plan.plan === "OpenCode Go")!.quota;
  expect(quota).toContain("per model");
  // OpenCode's new page publishes no dollar total for the plan, only a cap per
  // model — so the row carries no equiv, and a quote pretending otherwise is wrong.
  expect(PLANS.find(plan => plan.plan === "OpenCode Go")!.equiv).toBeNull();
  // The range the quota string names is the roster's, not the granted configs'.
  expect(quota).toContain(`$${OPENCODE_MODEL_CAP.low}`);
  expect(quota).toContain(`$${OPENCODE_MODEL_CAP.high}`);
});

test("OpenCode Go publishes no plan-level total; the selected model's cap is used instead", () => {
  const openCode = PLANS.find(plan => plan.plan === "OpenCode Go")!;
  expect(openCode.quantified).toBe(true);
  expect(convertible(openCode.equiv)).toBe(false);
  expect(openCode.perModel).toBe(true);
  expect(ESTIMATES[openCode.plan].allowance).toBeNull();

  for (const key of PLAN_MODEL_KEYS["OpenCode Go"]) {
    const allowance = allowanceForConfig({ key, name: key }, null, true)!;
    expect(allowance.rung).toBe("measured");
    expect(allowance.value).toBe(OPENCODE_QUOTA[key]!.usdPerMonth);
  }

  const view = planView(SCORE_PLANS.find(plan => plan.plan === "OpenCode Go")!, "delivery")!;
  expect(view.allowance!.rung).toBe("measured");
  expect(view.allowance!.value).toBe(OPENCODE_QUOTA[view.config.key as keyof typeof OPENCODE_QUOTA]!.usdPerMonth);
  // The per-model caps are still published and still recorded — the roster keeps
  // the unlimited promotional rows the docs page carries.
  expect(UNLIMITED_OPENCODE_MODELS.length).toBeGreaterThan(0);
});

test("OpenCode's DeepSeek V4.1 Flash maps to AA's 1017 release, not the deprecated September slug", () => {
  const config = SCORE_PLANS.find(plan => plan.plan === "OpenCode Go")!
    .configs.find(entry => entry.key === "deepseek1017Max")!;

  expect(config.slug).toBe("deepseek-v4-1-flash-1017");
  expect(config.name).toBe("DeepSeek V4.1 Flash 1017");
  expect(config.reasoning).toBe("max");
  expect(config.intelligence).toBeCloseTo(32.4896, 4);
  expect(config.costPerTask).toBeCloseTo(0.6021, 4);
  expect(OPENCODE_QUOTA.deepseek1017Max!.usdPerMonth).toBe(80);
});

test("tierFor bands a model on fixed AA Index ranges", () => {
  expect(tierFor(58)).toBe("frontier");
  expect(tierFor(50)).toBe("frontier");
  expect(tierFor(49.9)).toBe("near-frontier");
  expect(tierFor(40)).toBe("near-frontier");
  expect(tierFor(39.9)).toBe("efficient");
});
