/**
 * The Observatory page's surface: the build entry and nav that reach it, the
 * seats and stylesheet the page declares, and the states src/ui/observatory.ts
 * renders when the store is empty, unreachable or not the file it claims to be.
 * The arithmetic behind every figure belongs to test/telemetry.test.ts — this
 * guards the page, not the ladder.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

import { aggregateObservations, validateObservationV1, type QuotaObservationV1 } from "../packages/intelligence/src/index";
import { pageBase, renderSiteHeader } from "../src/site-header";
import {
  groupFor, insufficientData, modelOptions, planOptions, readObservatory, resolveSelection,
  seriesCsv, windowOptions,
} from "../src/ui/observatory";

const ROOT = join(__dirname, "..");
const observatoryHtml = readFileSync(join(ROOT, "observatory.html"), "utf8");
const observatoryTs = readFileSync(join(ROOT, "src", "observatory.ts"), "utf8");
const viteConfig = readFileSync(join(ROOT, "vite.config.ts"), "utf8");

/** Every page that carries the site nav; Observatory's own mark is in the renderer. */
const NAV = ["index.html", "break-even.html", "local.html", "gate.html", "docs/index.html"];

const VALID: QuotaObservationV1 = {
  schemaVersion: 1,
  observationId: "0123456789abcdef",
  reporterId: "reporter-7f3a",
  provider: "openai",
  subscriptionId: "openai.chatgpt-plus",
  modelId: "gpt-5.6-codex",
  harness: "codex",
  harnessVersion: "0.55.0",
  reasoningEffort: "high",
  observedAt: "2026-10-14T11:25:02.416Z",
  region: "FR",
  quotaWindow: {
    type: "weekly",
    resetAt: "2026-10-16T12:00:00.000Z",
    usedBefore: 10,
    usedAfter: 25,
    unit: "percentage_points",
    resetDetected: false,
  },
  usage: { inputTokens: 100_000, cacheReadTokens: 40_000, cacheWriteTokens: 10_000, outputTokens: 20_000 },
  apiRateVersion: "2026-08-r1",
  workloadId: "wl-001@v1",
  runs: 10,
  successfulRuns: 9,
  collectionMethod: "local_log",
  evidenceRef: "https://github.com/limits-apply/limits-apply/pull/1",
  isolationConfirmed: true,
};

const dayOf = (n: number) => `2026-10-${String(n).padStart(2, "0")}T10:00:00.000Z`;
let ids = 0;
const nextId = () => (++ids).toString(16).padStart(16, "0");
const windowOf = (over: Partial<QuotaObservationV1["quotaWindow"]>): QuotaObservationV1["quotaWindow"] =>
  ({ ...VALID.quotaWindow, ...over });

/** A fixed token mix scaled by `scale`, so per-point figures move with nothing else. */
function interval(at: string, scale: number, over: Partial<QuotaObservationV1> = {}): QuotaObservationV1 {
  return {
    ...VALID,
    ...over,
    observationId: nextId(),
    observedAt: at,
    quotaWindow: { ...VALID.quotaWindow, ...over.quotaWindow },
    usage: {
      inputTokens: Math.round(100_000 * scale),
      cacheReadTokens: Math.round(40_000 * scale),
      cacheWriteTokens: Math.round(10_000 * scale),
      outputTokens: Math.round(20_000 * scale),
    },
  };
}

const plus = (n: number, scale: number, over: Partial<QuotaObservationV1> = {}) =>
  interval(dayOf(n), scale, over);

/** Six priced intervals, one refused reset, one interval with no rate card behind it. */
const plusWeekly = [
  ...[1, 2, 3, 4, 5, 6].map(n => plus(n, 6.2)),
  plus(7, 6.2, { quotaWindow: windowOf({ usedBefore: 90, usedAfter: 2, resetDetected: true }) }),
  plus(8, 6.2, { apiRateVersion: null }),
];
const plusFiveHour = [1, 2].map(n => plus(n, 4, {
  quotaWindow: windowOf({ type: "5h", resetAt: "2026-10-02T15:00:00.000Z", usedBefore: 3, usedAfter: 12 }),
}));
const maxWeekly = [1, 2, 3, 4, 5, 6].map(n => interval(dayOf(n), 3.9, {
  provider: "anthropic",
  subscriptionId: "anthropic.claude-max-5x",
  modelId: "claude-opus-5",
  harness: "claude-code",
  harnessVersion: "2.1.241",
  reporterId: `reporter-${n}`,
}));
const metered = (n: number, harness: "codex" | "claude-code") => interval(dayOf(n), 5, {
  subscriptionId: "openai.api-metered",
  modelId: "gpt-5.6",
  harness,
  harnessVersion: harness === "codex" ? "0.55.0" : "2.1.241",
});

const aggregate = aggregateObservations([
  ...plusWeekly,
  ...plusFiveHour,
  ...maxWeekly,
  ...[1, 2].map(n => metered(n, "codex")),
  ...[3, 4].map(n => metered(n, "claude-code")),
]);

test("the build declares the Observatory page as an entry", () => {
  expect(viteConfig).toContain(`observatory: "observatory.html"`);
});

test("every page's site nav reaches the Observatory, after Gate, at a relative href", () => {
  for (const page of NAV) {
    const nav = renderSiteHeader(page);
    expect(nav, `${page} has no site nav`).toContain(`<a href="${pageBase(page)}observatory.html">Observatory</a>`);
    expect(nav.indexOf(">Gate</a>"), `${page} nav puts Observatory before Gate`).toBeLessThan(nav.indexOf(">Observatory</a>"));
  }
  expect(renderSiteHeader("observatory.html")).toContain('<a href="./observatory.html" aria-current="page">Observatory</a>');
});

test("observatory.html carries every seat the UI module mounts into, and its own stylesheet", () => {
  for (const seat of ["controls", "summary", "history", "export", "provenance", "empty"]) {
    expect(observatoryHtml, `missing seat #observatory-${seat}`).toContain(`id="observatory-${seat}"`);
  }
  expect(observatoryHtml).toContain(`<script type="module" src="/src/observatory.ts"></script>`);
  expect(observatoryHtml).toContain(`<link rel="stylesheet" href="/src/styles/parts/gate.css">`);
  expect(observatoryHtml).toContain(`<link rel="stylesheet" href="/src/styles/parts/observatory.css">`);
  expect(existsSync(join(ROOT, "src/styles/parts/observatory.css"))).toBe(true);
  expect(observatoryHtml).toContain("https://github.com/limits-apply/limits-apply/blob/main/docs/observations-schema.md");
});

test("every section the page links to exists, and the page stays out of the node bundle", () => {
  const ids = new Set([...observatoryHtml.matchAll(/id="([\w-]+)"/g)].map(m => m[1]));
  for (const match of observatoryHtml.matchAll(/href="#([\w-]+)"/g)) {
    expect(ids.has(match[1]), `observatory.html links to #${match[1]}, which has no matching id`).toBe(true);
  }
  expect(observatoryHtml).not.toContain("node:");
  expect(observatoryTs).not.toContain("node:");
  expect(observatoryTs).not.toContain("packages/");
  expect(observatoryTs).toContain(`fetch("observatory.json")`);
});

test("the fixture rows are observations the schema accepts, not shaped for this test", () => {
  const rows = [...plusWeekly, ...plusFiveHour, ...maxWeekly, ...[1, 2, 3, 4].map(n => metered(n, n < 3 ? "codex" : "claude-code"))];
  for (const row of rows) expect(validateObservationV1(row), `invalid fixture row ${row.observationId}`).toEqual([]);
});

test("every combination the three controls can express is a group the store holds", () => {
  expect(aggregate.groups.length).toBe(5);
  for (const [subscription] of planOptions(aggregate.groups)) {
    for (const [model] of modelOptions(aggregate.groups, subscription)) {
      for (const [window] of windowOptions(aggregate.groups, subscription, model)) {
        expect(groupFor(aggregate.groups, { subscription, model, window }),
          `${subscription} / ${model} / ${window} is not a group`).not.toBeNull();
      }
    }
  }
});

test("a selection naming nothing in the store falls back to a group that exists", () => {
  const selection = resolveSelection(aggregate.groups, {
    subscription: "anthropic.claude-nope",
    model: "claude-nope",
    window: "decade",
  });
  expect(groupFor(aggregate.groups, selection)).not.toBeNull();
  expect(modelOptions(aggregate.groups, selection.subscription).some(([value]) => value === selection.model)).toBe(true);
  expect(windowOptions(aggregate.groups, selection.subscription, selection.model).some(([value]) => value === selection.window)).toBe(true);
});

test("a model reported through two harnesses is two options, and each resolves to its own group", () => {
  const models = modelOptions(aggregate.groups, "openai.api-metered").map(([value]) => value);
  expect(models).toContain("gpt-5.6|codex");
  expect(models).toContain("gpt-5.6|claude-code");
  for (const model of models) {
    for (const [window] of windowOptions(aggregate.groups, "openai.api-metered", model)) {
      const group = groupFor(aggregate.groups, { subscription: "openai.api-metered", model, window });
      expect(group?.key.harness).toBe(model.split("|")[1]);
    }
  }
});

test("the series CSV carries exactly the columns the export promises", () => {
  const group = aggregate.groups.find(g => g.key.subscriptionId === "openai.chatgpt-plus" && g.key.windowType === "weekly")!;
  expect(group.status).toBe("preliminary");
  expect(group.excluded).toEqual([{ observationId: group.excluded[0].observationId, reason: "the counter reset inside the interval" }]);
  const [header, ...rows] = seriesCsv(group).split("\n");
  expect(header).toBe("observedAt,tokensPerPoint,apiUsdPerPoint,cacheShare,collectionMethod,isolationConfirmed,observationId");
  expect(rows).toHaveLength(group.series.length);
  for (const row of rows) expect(row.split(",")).toHaveLength(7);
  const unpriced = group.series.findIndex(p => p.apiUsdPerPoint == null);
  expect(unpriced).toBe(group.series.length - 1);
  expect(rows[unpriced].split(",")[2]).toBe("");
  expect(rows[0].split(",")[6]).toBe(group.series[0].observationId);
});

test("an empty store renders the insufficient-data state, not a figure", () => {
  const empty = aggregateObservations([]);
  expect(empty.groups).toEqual([]);
  const { heading, detail } = insufficientData(empty);
  expect(heading).toBe("Insufficient data — no intervals in the store yet.");
  const copy = [heading, ...detail].join(" ");
  expect(copy).toContain("insufficient data");
  expect(copy).toContain("single report — not an estimate");
  expect(copy).toContain("0 observations and 0 admissible intervals");
});

test("a payload that is not this page's store is refused rather than rendered", () => {
  expect(readObservatory(null)).toBeNull();
  expect(readObservatory("observatory.json")).toBeNull();
  expect(readObservatory({ schemaVersion: 2, observations: 0, admissibleIntervals: 0, groups: [] })).toBeNull();
  expect(readObservatory({ schemaVersion: 1, observations: 0, admissibleIntervals: 0 })).toBeNull();
  expect(readObservatory(JSON.parse(JSON.stringify(aggregate)))).toEqual(aggregate);
});
