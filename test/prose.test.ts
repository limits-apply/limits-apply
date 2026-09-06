/**
 * Every figure `index.html`/`local.html` restates in prose, checked against the
 * `src/data` value it claims to match. CLAUDE.md: "the formula is printed on the
 * page, so keep the two in sync" — this is the guard, not the markup.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { AA_SNAPSHOT } from "../src/data/aa";
import { TASK_COST } from "../src/data/derived/estimates";
import { BREAK_EVEN } from "../src/data/illustrative";
import { PLANS } from "../src/data/plans";
import { CHIPS } from "../src/data/silicon";
import { RATE, TASK } from "../src/data/task";
import { PRICE_BRACKETS } from "../src/lib/benchmark";
import { SPEED_KNEE, STRATEGY } from "../src/lib/throughput";
import { DAYS_PER_MONTH, monthlyCeiling } from "../src/lib/provenance";

const ROOT = join(__dirname, "..");
const indexHtml = readFileSync(join(ROOT, "index.html"), "utf8");
const localHtml = readFileSync(join(ROOT, "local.html"), "utf8");

test("the AA snapshot version and date match AA_SNAPSHOT", () => {
  expect(indexHtml).toContain(`Intelligence Index v${AA_SNAPSHOT.version} · snapshot ${AA_SNAPSHOT.verified}`);
});

test("the AA snapshot download link points at a file that exists on disk", () => {
  expect(indexHtml).toContain(`id="aa-snapshot-link"`);
  const m = readFileSync(join(ROOT, "src", "main.ts"), "utf8")
    .match(/import aaSnapshotUrl from "\.\.\/data\/(artificial-analysis-[\w-]+\.json)\?url/);
  expect(m, "no artificial-analysis-*.json?url import found in src/main.ts").toBeTruthy();
  expect(m![1]).toBe(`artificial-analysis-${AA_SNAPSHOT.verified}.json`);
  expect(existsSync(join(ROOT, "data", m![1]))).toBe(true);
});

test("the price-point bracket boundaries match PRICE_BRACKETS", () => {
  const byKey = Object.fromEntries(PRICE_BRACKETS.map(b => [b.key, b.upTo]));
  expect(indexHtml).toContain(`~$10 is up to $${byKey["10"]},\n    ~$20 up to $${byKey["20"]}, ~$50 up to $${byKey["50"]}, ~$100 up to $${byKey["100"]}`);
});

test("the worked ceiling example matches TASK, RATE, TASK_COST and ChatGPT Plus's published rate", () => {
  const chatgptPlus = PLANS.find(p => p.plan === "ChatGPT Plus")!;
  const { per, hours } = chatgptPlus.equiv!;
  const tasksPerMonth = monthlyCeiling(per!, hours!);
  const ceiling = tasksPerMonth * TASK_COST;

  expect(indexHtml).toContain(`RATE = <code>$${RATE.in.toFixed(2)}</code> / M in · <code>$${RATE.out.toFixed(2)}</code> / M out`);
  expect(indexHtml).toContain(`12,000 × $${RATE.in}/M + 1,500 × $${RATE.out}/M = <strong>$${TASK_COST.toFixed(3)}</strong>`);
  expect(TASK).toEqual({ inTok: 12000, outTok: 1500 });
  expect(indexHtml).toContain(`160 × (24 ÷ 3) × ${DAYS_PER_MONTH}`);
  expect(indexHtml).toContain(`<strong>${Math.round(tasksPerMonth).toLocaleString("en-US")}</strong>`);
  expect(indexHtml).toContain(`<strong>$${Math.round(ceiling).toLocaleString("en-US")}</strong>`);
});

test("the illustrative break-even figures match BREAK_EVEN", () => {
  expect(indexHtml).toContain(
    `Assumes a $${BREAK_EVEN.price} plan whose allowance covers ${BREAK_EVEN.tasks} tasks at`);
  expect(indexHtml).toContain(`$${BREAK_EVEN.apiCostPerTask}/task at API prices`);
});

test("local.html's two M4 Max bandwidth bins match silicon.ts", () => {
  const bySlim = Object.fromEntries(CHIPS.map(c => [c.id, c.bandwidth.value]));
  expect(localHtml).toContain(`runs at ${bySlim.m4max32} GB/s; the 16-core part runs at ${bySlim.m4max40}`);
});

test("local.html's two strategy buttons carry the factors STRATEGY defines", () => {
  expect(localHtml).toContain(`data-value="${STRATEGY.plan}">Plan`);
  expect(localHtml).toContain(`data-value="${STRATEGY.build}">Build`);
});

test("local.html's printed score formula matches the speed knee in throughput.ts", () => {
  expect(localHtml).toContain(`<strong>tok/s ÷ ${SPEED_KNEE}</strong> up to ${SPEED_KNEE} tok/s`);
  expect(localHtml).toContain(`<strong>1 + ln(tok/s ÷ ${SPEED_KNEE})</strong> above it`);
});

test("the landing links to the docs roadmap, which names the local+PAYG gap as the frontier's alone", () => {
  expect(indexHtml).toContain(`href="./docs/index.html#roadmap"`);
  const docsIndexHtml = readFileSync(join(ROOT, "docs", "index.html"), "utf8");
  expect(docsIndexHtml).toContain("Local plans inside a budget combination");
  expect(docsIndexHtml).toContain("Gate already <em>routes</em> to a local endpoint");
});
