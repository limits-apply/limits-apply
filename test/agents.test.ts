import { expect, test } from "vitest";
import { AA_AGENTS, AGENTS_SNAPSHOT, AGENT_POINTS, PLAN_AGENT_KEYS } from "../src/data/agents";
import { PLANS } from "../src/data/plans";
import { paretoAnnotate } from "../src/lib/benchmark";

test("the agents snapshot is dated and sourced like every other snapshot", () => {
  expect(AGENTS_SNAPSHOT.verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(AGENTS_SNAPSHOT.source).toMatch(/^https:\/\//);
});

test("every agent variant carries a plausible index and an honest cost", () => {
  for (const variant of Object.values(AA_AGENTS)) {
    expect(variant.index).toBeGreaterThan(0);
    expect(variant.index).toBeLessThanOrEqual(100);
    expect(variant.wallMinutes).toBeGreaterThan(0);
    if (variant.costPerTask != null) expect(variant.costPerTask).toBeGreaterThan(0);
  }
});

test("plan→agent mappings point at real plans and real variants, and never invent one", () => {
  for (const [plan, key] of Object.entries(PLAN_AGENT_KEYS)) {
    expect(PLANS.some(p => p.plan === plan), plan).toBe(true);
    expect(AA_AGENTS[key], key).toBeDefined();
  }
});

test("an unpublished agent cost never reaches the scatter", () => {
  expect(AGENT_POINTS.every(p => p.x > 0)).toBe(true);
  expect(AGENT_POINTS.length).toBe(
    Object.values(AA_AGENTS).filter(v => v.costPerTask != null).length);
});

test("the real agent scatter still contains dominated points, or the chart lies", () => {
  expect(paretoAnnotate(AGENT_POINTS).some(p => p.dominators.length > 0)).toBe(true);
});
