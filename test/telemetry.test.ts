import { expect, test } from "vitest";

import {
  API_RATE_VERSIONS,
  SUBSCRIPTIONS,
  aggregateObservations,
  apiEquivalentUsd,
  detectQuotaChange,
  evidenceStatus,
  intervalRate,
  isAdmissible,
  observationsCsv,
  parseObservation,
  quantile,
  rateCardFor,
  robustBand,
  subscriptionForPlanType,
  validateObservationV1,
  type QuotaObservationV1,
} from "../packages/intelligence/src/index";

/* ---------- the schema: an observation is valid or it is nothing ---------- */

const VALID: QuotaObservationV1 = {
  schemaVersion: 1,
  observationId: "0123456789abcdef",
  reporterId: "reporter-7f3a",
  provider: "anthropic",
  subscriptionId: "anthropic.claude-max-5x",
  modelId: "claude-opus-5",
  harness: "claude-code",
  harnessVersion: "2.1.241",
  reasoningEffort: "high",
  observedAt: "2026-10-14T11:25:02.416Z",
  region: "FR",
  quotaWindow: {
    type: "weekly",
    resetAt: "2026-10-16T12:00:00.000Z",
    usedBefore: 40,
    usedAfter: 55,
    unit: "percentage_points",
    resetDetected: false,
  },
  usage: { inputTokens: 2, cacheReadTokens: 26_264, cacheWriteTokens: 34_193, outputTokens: 472 },
  apiRateVersion: "2026-08-r1",
  workloadId: "wl-001@v1",
  runs: 10,
  successfulRuns: 9,
  collectionMethod: "local_log",
  evidenceRef: "https://github.com/limits-apply/limits-apply/pull/1",
  isolationConfirmed: true,
};

test("validateObservationV1 accepts a well-formed observation", () => {
  expect(validateObservationV1(VALID)).toEqual([]);
});

test("token categories stay null when unknown — never zero", () => {
  expect(validateObservationV1({
    ...VALID,
    usage: { inputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, outputTokens: 12 },
  })).toEqual([]);
});

test("the validator rejects a schema version it cannot read", () => {
  expect(validateObservationV1({ ...VALID, schemaVersion: 2 })).toEqual(["schemaVersion must be 1"]);
});

test("the validator refuses an unregistered subscription and a wrong harness", () => {
  expect(validateObservationV1({ ...VALID, subscriptionId: "openai.chatgpt-mystery" })).toContain(
    "subscriptionId is not in the registry",
  );
  expect(validateObservationV1({ ...VALID, harness: "codex" })).toContain(
    "anthropic.claude-max-5x is consumed through claude-code",
  );
});

test("the validator refuses a reporter id that is an identity", () => {
  expect(validateObservationV1({ ...VALID, reporterId: "guillaume@example.com" })).toContain(
    "reporterId looks like an identity",
  );
});

test("the validator keeps percentage points inside 0–100 and resets declared", () => {
  expect(validateObservationV1({ ...VALID, quotaWindow: { ...VALID.quotaWindow, usedBefore: 101 } })).toEqual([
    "quotaWindow.usedBefore must be a number in 0–100",
  ]);
  expect(
    validateObservationV1({ ...VALID, quotaWindow: { ...VALID.quotaWindow, resetDetected: "yes" } }),
  ).toEqual(["quotaWindow.resetDetected must be a boolean"]);
});

test("an observation may only be priced with a card that exists for its model", () => {
  expect(validateObservationV1({ ...VALID, modelId: "gpt-5.6", apiRateVersion: "2026-08-r1" })).toEqual([]);
  expect(validateObservationV1({ ...VALID, apiRateVersion: "2027-01-r1" })).toContain(
    "no rate card for model claude-opus-5 at version 2027-01-r1",
  );
});

test("evidence is https or nothing, and runs never exceed successful runs", () => {
  expect(validateObservationV1({ ...VALID, evidenceRef: "http://example.com/log" })).toEqual([
    "evidenceRef must be null or an https URL",
  ]);
  expect(validateObservationV1({ ...VALID, runs: 3, successfulRuns: 4 })).toEqual(
    expect.arrayContaining(["successfulRuns cannot exceed runs"]),
  );
});

test("parseObservation rejects non-JSON and invalid observations", () => {
  expect(() => parseObservation("{ not json")).toThrow(/not JSON/);
  expect(() => parseObservation(JSON.stringify({ ...VALID, region: "france" }))).toThrow(/region/);
});

/* ---------- the interval engine ---------- */

test("a negative delta is a reset, not consumption — unless the reset was declared", () => {
  const reset = { ...VALID, quotaWindow: { ...VALID.quotaWindow, usedBefore: 95, usedAfter: 3 } };
  expect(isAdmissible(reset)).toBe(false);
  expect(
    isAdmissible({ ...reset, quotaWindow: { ...reset.quotaWindow, resetDetected: true } }),
  ).toBe(false);
});

test("a delta below the counter's display precision is noise, not data", () => {
  const tiny = { ...VALID, quotaWindow: { ...VALID.quotaWindow, usedBefore: 40.2, usedAfter: 40.7 } };
  expect(isAdmissible(tiny)).toBe(false);
  expect(isAdmissible({ ...VALID, quotaWindow: { ...VALID.quotaWindow, usedBefore: 40, usedAfter: 41 } })).toBe(true);
});

test("an interval with no observed tokens is not consumable", () => {
  expect(
    isAdmissible({ ...VALID, usage: { inputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, outputTokens: null } }),
  ).toBe(false);
});

test("tokens per quota point and USD per quota point come from one interval", () => {
  const rate = intervalRate(VALID);
  const total = 2 + 26_264 + 34_193 + 472;
  expect(rate?.tokensPerPoint).toBe(total / 15);
  const card = rateCardFor("claude-opus-5", "2026-08-r1");
  const usd = apiEquivalentUsd(
    { input: 2, cachedInput: 26_264, cacheWrite: 34_193, output: 472 },
    card!,
  );
  expect(rate?.apiUsdPerPoint).toBeCloseTo(usd / 15, 12);
  expect(rate?.cacheShare).toBeCloseTo((26_264 + 34_193) / total, 12);
});

test("a missing token category voids the price but keeps the raw ratio", () => {
  const rate = intervalRate({
    ...VALID,
    usage: { inputTokens: 2, cacheReadTokens: null, cacheWriteTokens: null, outputTokens: 472 },
  });
  expect(rate?.tokensPerPoint).toBe(474 / 15);
  expect(rate?.apiUsdPerPoint).toBeNull();
});

test("quantiles interpolate the same way the provenance ladder does", () => {
  expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
});

test("a single sample is a point widened ×2, never a range", () => {
  expect(robustBand([40])).toEqual({ value: 40, low: 20, high: 80 });
  expect(robustBand([])).toBeNull();
});

test("below four samples the band is min…max ×2, not an IQR of two points", () => {
  expect(robustBand([10, 30, 90])).toEqual({ value: 30, low: 5, high: 180 });
});

test("four samples earn a real interquartile band", () => {
  const band = robustBand([10, 20, 30, 40]);
  expect(band?.value).toBe(25);
  expect(band?.low).toBeCloseTo(17.5, 9);
  expect(band?.high).toBeCloseTo(32.5, 9);
});

/* ---------- what a sample may claim ---------- */

test("one interval is a report, five an estimate, three reporters a community figure", () => {
  expect(evidenceStatus({ intervals: 1, windowTypes: 1, reporters: 1 })).toBe("single-report");
  expect(evidenceStatus({ intervals: 4, windowTypes: 1, reporters: 1 })).toBe("single-report");
  expect(evidenceStatus({ intervals: 5, windowTypes: 1, reporters: 1 })).toBe("preliminary");
  expect(evidenceStatus({ intervals: 5, windowTypes: 2, reporters: 1 })).toBe("series");
  expect(evidenceStatus({ intervals: 5, windowTypes: 2, reporters: 3 })).toBe("community");
});

test("a step in capacity needs a threshold, a base and samples to persist", () => {
  expect(detectQuotaChange([], []).state).toBe("insufficient");
  expect(detectQuotaChange([6.2], [3.9]).state).toBe("insufficient");
  expect(detectQuotaChange([6.2, 6.4, 6.1], [3.9, 4.0, 3.8]).state).toBe("probable");
  expect(detectQuotaChange([6.2, 6.4, 6.1], [3.9, 4.0, 3.8]).change).toBeCloseTo((3.9 - 6.2) / 6.2, 9);
  expect(detectQuotaChange([6.2, 6.4, 6.1], [6.0, 6.3, 5.9]).state).toBe("inconclusive");
  expect(detectQuotaChange([6.2, 6.1], [3.9, 4.0]).state).toBe("inconclusive");
});

/* ---------- aggregation ---------- */

/** A fixed token mix scaled by `scale` — per-point figures scale linearly with it. */
function interval(id: string, at: string, before: number, after: number, scale: number): QuotaObservationV1 {
  return {
    ...VALID,
    observationId: id,
    observedAt: at,
    quotaWindow: { ...VALID.quotaWindow, usedBefore: before, usedAfter: after },
    usage: {
      inputTokens: Math.round(100_000 * scale),
      cacheReadTokens: Math.round(40_000 * scale),
      cacheWriteTokens: Math.round(10_000 * scale),
      outputTokens: Math.round(20_000 * scale),
    },
  };
}

const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}T10:00:00.000Z`;
const rowId = (n: number) => `aaaaaaaaaaaaaa${String(n).padStart(2, "0")}`;

test("aggregation keeps inadmissible intervals as provenance, out of the statistics", () => {
  const good = interval("aaaaaaaaaaaaaaaa", day(1), 10, 25, 6.2);
  const reset = {
    ...good,
    observationId: "bbbbbbbbbbbbbbbb",
    observedAt: day(2),
    quotaWindow: { ...good.quotaWindow, usedBefore: 90, usedAfter: 2, resetDetected: true },
  };
  const aggregate = aggregateObservations([good, reset]);
  expect(aggregate.observations).toBe(2);
  expect(aggregate.admissibleIntervals).toBe(1);
  const [group] = aggregate.groups;
  expect(group.intervals).toBe(1);
  expect(group.reporters).toBe(1);
  expect(group.status).toBe("single-report");
  expect(group.excluded).toEqual([{ observationId: "bbbbbbbbbbbbbbbb", reason: "the counter reset inside the interval" }]);
  expect(group.tokensPerPoint).not.toBeNull();
});

test("a group's change verdict splits the sample into baseline and current halves", () => {
  const early = [1, 2, 3, 4, 5].map(n => interval(rowId(n), day(n), 10, 20, 6.2));
  const late = [6, 7, 8, 9].map(n => interval(rowId(n), day(n), 30, 40, 3.9));
  const [group] = aggregateObservations([...early, ...late]).groups;
  expect(group.intervals).toBe(9);
  expect(group.status).toBe("preliminary");
  expect(group.change?.state).toBe("probable");
  expect(group.change?.change).toBeLessThan(0);
  expect(group.firstObservedAt).toBe(day(1));
  expect(group.lastObservedAt).toBe(day(9));
});

test("distinct reporters promote the group to a community estimate", () => {
  const rows = [1, 2, 3, 4, 5].map(n => ({ ...interval(rowId(n), day(n), 10, 20, 6.2), reporterId: `reporter-${n}` }));
  const [group] = aggregateObservations(rows).groups;
  expect(group.reporters).toBe(5);
  expect(group.status).toBe("community");
});

test("the CSV export carries every interval, empty for a missing category", () => {
  const csv = observationsCsv([
    { ...VALID, usage: { inputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, outputTokens: 5 } },
  ]);
  const [header, row] = csv.split("\n");
  expect(header.startsWith("observationId,provider,")).toBe(true);
  expect(row.split(",").slice(13, 17)).toEqual(["", "", "", "5"]);
  expect(row).toContain("anthropic.claude-max-5x");
});

/* ---------- registries ---------- */

test("every subscription has a stable id and a plan the ledger can name", () => {
  for (const subscription of SUBSCRIPTIONS) {
    expect(subscription.subscriptionId).toMatch(/^(openai|anthropic)\./);
    expect(subscription.plan.length).toBeGreaterThan(2);
  }
  expect(new Set(SUBSCRIPTIONS.map(s => s.subscriptionId)).size).toBe(SUBSCRIPTIONS.length);
});

test("a provider's own plan token maps to the registry or refuses to attribute", () => {
  expect(subscriptionForPlanType("openai", "plus")?.subscriptionId).toBe("openai.chatgpt-plus");
  expect(subscriptionForPlanType("openai", "mystery")).toBeNull();
  expect(subscriptionForPlanType("anthropic", "plus")).toBeNull();
});

test("rate cards are versioned and an old version is never silently repriced", () => {
  expect(API_RATE_VERSIONS.length).toBeGreaterThan(0);
  expect(rateCardFor("claude-opus-5", "2026-08-r1")?.output).toBe(75);
  expect(rateCardFor("claude-opus-5", "1999-01-r1")).toBeNull();
  expect(rateCardFor("mystery-model", "2026-08-r1")).toBeNull();
});
