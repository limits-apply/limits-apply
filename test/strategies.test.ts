import { describe, expect, test } from "vitest";

import {
  STRATEGY_BUDGETS, STRATEGY_SCENARIOS, STRATEGY_VERIFIED_ON, recommendableScenarios,
  scenarioStatus, scenariosForBudget, type StrategyScenario,
} from "../src/data/strategies";
import { positionFor, type ComplianceStatus } from "../src/lib/compliance";

const isProhibited = (scenario: StrategyScenario) =>
  scenarioStatus(scenario) === "prohibited";

const codexScenarios = STRATEGY_SCENARIOS.filter(scenario =>
  /Codex/i.test(`${scenario.label} ${scenario.mix.map(item => item.name).join(" ")}`));

test("the four budgets each carry at least two scenarios", () => {
  expect(STRATEGY_BUDGETS).toEqual([10, 20, 40, 100]);
  for (const budget of STRATEGY_BUDGETS) {
    expect(scenariosForBudget(budget).length, `budget ${budget}`).toBeGreaterThanOrEqual(2);
    expect(recommendableScenarios(scenariosForBudget(budget)).length, `budget ${budget}`)
      .toBeGreaterThanOrEqual(2);
  }
});

test("scenario ids are unique", () => {
  const ids = STRATEGY_SCENARIOS.map(scenario => scenario.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("every scenario names a compliance position that exists", () => {
  for (const scenario of STRATEGY_SCENARIOS) {
    expect(positionFor(scenario.complianceKey), scenario.id).not.toBeNull();
  }
});

test("no prohibited scenario survives the recommendable filter", () => {
  const recommended = recommendableScenarios(STRATEGY_SCENARIOS);
  for (const scenario of recommended) {
    expect(scenarioStatus(scenario), scenario.id).not.toBe("prohibited");
  }
  expect(recommended.some(scenario => scenario.id.startsWith("multi-account"))).toBe(false);
});

test("the mix adds up to the advertised monthly cost", () => {
  for (const scenario of STRATEGY_SCENARIOS) {
    const total = scenario.mix.reduce((sum, item) => sum + item.usd, 0);
    expect(total, scenario.id).toBeCloseTo(scenario.monthlyCostUsd, 6);
  }
});

test("a numeric dollar figure cites a source unless it is labelled an estimate", () => {
  for (const scenario of STRATEGY_SCENARIOS) {
    expect(scenario.monthlyCostUsd, scenario.id).toBeGreaterThan(0);
    if (scenario.sourceUrl === null) {
      expect(["unknown", "estimated"], scenario.id).toContain(scenario.confidence);
    } else {
      expect(scenario.sourceUrl, scenario.id).toMatch(/^https:\/\//);
    }
    if (scenario.confidence === "official") {
      expect(scenario.sourceUrl, scenario.id).not.toBeNull();
    }
  }
});

test("the multi-account arithmetic is present at 10 and 20, and prohibited", () => {
  for (const budget of [10, 20]) {
    const counterfactual = scenariosForBudget(budget)
      .filter(scenario => scenario.complianceKey === "multi-account-same-plan");
    expect(counterfactual.length, `budget ${budget}`).toBeGreaterThan(0);
    for (const scenario of counterfactual) {
      expect(scenario.monthlyCostUsd, scenario.id).toBe(20);
      expect(scenario.mix[0].name, scenario.id).toMatch(/× 2/);
      expect(isProhibited(scenario), scenario.id).toBe(true);
      expect(scenario.toMeasure.join(" "), scenario.id).toMatch(/prohibited/i);
    }
    expect(recommendableScenarios(scenariosForBudget(budget))
      .some(scenario => scenario.complianceKey === "multi-account-same-plan")).toBe(false);
  }
});

test("Codex scenarios carry no invented dollar capacity", () => {
  expect(codexScenarios.length).toBeGreaterThan(0);
  for (const scenario of codexScenarios) {
    expect(scenario.confidence, scenario.id).toBe("unknown");
    expect(Object.hasOwn(scenario, "capacity"), scenario.id).toBe(false);
    expect(scenario.advantage, scenario.id).not.toMatch(/\$\d[\d,.]*\s*(?:of usage|\/\s*month|\/mo)/i);
  }
});

test("the status vocabulary is one of the four the page renders", () => {
  const statuses = new Set<ComplianceStatus>(STRATEGY_SCENARIOS.map(scenarioStatus));
  for (const status of statuses) {
    expect(["allowed", "requires_confirmation", "prohibited", "unknown"]).toContain(status);
  }
});

test("STRATEGY_VERIFIED_ON is an ISO date", () => {
  expect(STRATEGY_VERIFIED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

describe("the three scenarios the plan names for each budget", () => {
  test("the 40 budget offers the higher tier and two permitted mixes", () => {
    const scenarios = scenariosForBudget(40);
    expect(scenarios.some(scenario => scenario.complianceKey === "higher-tier")).toBe(true);
    expect(scenarios.filter(scenario => scenario.complianceKey === "multi-provider").length)
      .toBeGreaterThanOrEqual(2);
  });

  test("the 100 budget contrasts Codex Pro with a permitted portfolio", () => {
    const scenarios = scenariosForBudget(100);
    expect(scenarios.some(scenario => /Codex/i.test(scenario.label))).toBe(true);
    expect(scenarios.some(scenario => scenario.mix.length >= 3)).toBe(true);
  });
});
