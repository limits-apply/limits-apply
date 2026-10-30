/**
 * Fixed-budget strategies — the plan's §8.4 bis, with the terms position each one
 * inherits. Every dollar figure is either a published subscription price or an
 * explicit estimate; capacity no provider publishes stays absent rather than being
 * invented. Covered by test/strategies.test.ts.
 */
import { OPENCODE_MODEL_CAP } from "./opencode";
import { openCodeWindows } from "./coding";
import { positionFor, isRecommendable } from "../lib/compliance";

export const STRATEGY_BUDGETS = [10, 20, 40, 100] as const;
export type StrategyBudget = (typeof STRATEGY_BUDGETS)[number];

export type StrategyConfidence = "official" | "derived" | "estimated" | "unknown";

export interface StrategyScenario {
  id: string;
  budget: number;
  label: string;
  monthlyCostUsd: number;
  mix: { name: string; usd: number }[];
  advantage: string;
  toMeasure: string[];
  complianceKey: string;
  confidence: StrategyConfidence;
  sourceUrl: string | null;
}

/** The day §8.1, §8.4 bis and the terms positions were read. */
export const STRATEGY_VERIFIED_ON = "2026-10-18";

const GO_DOCS = "https://dev.opencode.ai/v2/docs/console/go";
const GO_MAX_MONTH = OPENCODE_MODEL_CAP.high;
const GO_WINDOWS = openCodeWindows(GO_MAX_MONTH);
const GO_PER_FIVE_HOURS = GO_WINDOWS.find(window => window.window === "5h")!.amount;
const GO_PER_WEEK = GO_WINDOWS.find(window => window.window === "7d")!.amount;
const GO_RANGE = `$${OPENCODE_MODEL_CAP.low}–$${OPENCODE_MODEL_CAP.high}`;
const GO_DOUBLE = `$${GO_PER_FIVE_HOURS * 2} / 5 h, $${GO_PER_WEEK * 2} / week and $${GO_MAX_MONTH * 2} / month`;
const OPENAI_PRICING = "https://learn.chatgpt.com/docs/pricing";
const CLAUDE_PRICING = "https://claude.com/pricing";
const OPENROUTER_PRICING = "https://openrouter.ai/pricing";

const NO_MEASUREMENT = ["Nothing: prohibited, so it is never ranked, exported or run"];

export const STRATEGY_SCENARIOS: StrategyScenario[] = [
  {
    id: "go-alone-10",
    budget: 10,
    label: "OpenCode Go alone",
    monthlyCostUsd: 10,
    mix: [{ name: "OpenCode Go", usd: 10 }],
    advantage:
      `One published $10 seat. Usage is rationed per model (${GO_RANGE} a month on the roster we read), so the model you point at sets the ceiling; the plan publishes no total dollar allowance.`,
    toMeasure: [
      "Successful tasks and accepted PRs before the 5-hour and weekly windows bind",
      "Which granted model the work actually routes through",
    ],
    complianceKey: "single-plan",
    confidence: "official",
    sourceUrl: GO_DOCS,
  },
  {
    id: "payg-10",
    budget: 10,
    label: "$10 of pay-as-you-go API",
    monthlyCostUsd: 10,
    mix: [{ name: "API pay-as-you-go", usd: 10 }],
    advantage:
      "No subscription and no reset window: $10 buys the tokens the published rates allow, and nothing is left unused at month end.",
    toMeasure: [
      "Token cost of one accepted PR at the model and harness you would use",
      "Whether $10 covers a real week of iterative work",
    ],
    complianceKey: "single-plan",
    confidence: "estimated",
    sourceUrl: OPENROUTER_PRICING,
  },
  {
    id: "multi-account-10",
    budget: 10,
    label: "Two Go accounts, one person — counterfactual",
    monthlyCostUsd: 20,
    mix: [{ name: "OpenCode Go × 2 personal accounts", usd: 20 }],
    advantage:
      `The arithmetic is the temptation: two independently capped accounts would double every window on paper, to ${GO_DOUBLE} of valued usage. Two accounts cost twice this budget, and the terms prohibit using them to get around one person's caps.`,
    toMeasure: NO_MEASUREMENT,
    complianceKey: "multi-account-same-plan",
    confidence: "derived",
    sourceUrl: GO_DOCS,
  },
  {
    id: "codex-plus-20",
    budget: 20,
    label: "ChatGPT Plus / Codex",
    monthlyCostUsd: 20,
    mix: [{ name: "ChatGPT Plus", usd: 20 }],
    advantage:
      "Frontier model access through Codex at the entry subscription price. OpenAI does not publish a dollar-equivalent capacity for the plan, so its throughput is unknown rather than convertible into OpenCode's units.",
    toMeasure: [
      "Accepted PRs per $20 on one fixed workload",
      "Model- and task-dependent rate limits, including any credit top-ups",
    ],
    complianceKey: "single-plan",
    confidence: "unknown",
    sourceUrl: OPENAI_PRICING,
  },
  {
    id: "go-plus-payg-20",
    budget: 20,
    label: "OpenCode Go + $10 API",
    monthlyCostUsd: 20,
    mix: [
      { name: "OpenCode Go", usd: 10 },
      { name: "API pay-as-you-go", usd: 10 },
    ],
    advantage:
      "Diversification: the subscription carries routine work and the metered credit is the reserve when a 5-hour window binds.",
    toMeasure: [
      "Cost per accepted PR and continuity when the Go window is exhausted",
      "How often the metered reserve is actually used",
    ],
    complianceKey: "multi-provider",
    confidence: "estimated",
    sourceUrl: GO_DOCS,
  },
  {
    id: "multi-account-20",
    budget: 20,
    label: "Two Go accounts, one person — counterfactual",
    monthlyCostUsd: 20,
    mix: [{ name: "OpenCode Go × 2 personal accounts", usd: 20 }],
    advantage:
      `At $20 this is the arithmetic the terms forbid: two $10 accounts would theoretically carry ${GO_DOUBLE} of valued usage. The caps are theoretical and the purchase is prohibited.`,
    toMeasure: NO_MEASUREMENT,
    complianceKey: "multi-account-same-plan",
    confidence: "derived",
    sourceUrl: GO_DOCS,
  },
  {
    id: "go-plus-40",
    budget: 40,
    label: "OpenCode Go Plus",
    monthlyCostUsd: 40,
    mix: [{ name: "OpenCode Go Plus", usd: 40 }],
    advantage:
      "The vendor's own higher tier: the same roster with larger per-model monthly caps ($60–$240 on the docs page we read).",
    toMeasure: [
      "Which model's cap binds first",
      "Whether the higher tier changes accepted PRs per dollar or only the ceiling",
    ],
    complianceKey: "higher-tier",
    confidence: "official",
    sourceUrl: GO_DOCS,
  },
  {
    id: "go-payg-40",
    budget: 40,
    label: "OpenCode Go + $30 API",
    monthlyCostUsd: 40,
    mix: [
      { name: "OpenCode Go", usd: 10 },
      { name: "API pay-as-you-go", usd: 30 },
    ],
    advantage:
      "Most of the budget stays metered: the subscription covers a base and $30 buys overflow without buying a second subscription surface.",
    toMeasure: [
      "Split of spend between subscription and metered API",
      "Accepted PRs per $40 across the month",
    ],
    complianceKey: "multi-provider",
    confidence: "estimated",
    sourceUrl: GO_DOCS,
  },
  {
    id: "multi-provider-40",
    budget: 40,
    label: "Three independent offers",
    monthlyCostUsd: 40,
    mix: [
      { name: "OpenCode Go", usd: 10 },
      { name: "Claude Pro", usd: 20 },
      { name: "API pay-as-you-go", usd: 10 },
    ],
    advantage:
      "Three distinct companies and three contracts: a coding subscription, a second vendor's coding surface and a metered reserve. No surface is bought twice.",
    toMeasure: [
      "Accepted PRs per surface",
      "Human review minutes and the cost of switching tools",
      "Whether the second subscription earns its $20",
    ],
    complianceKey: "multi-provider",
    confidence: "estimated",
    sourceUrl: CLAUDE_PRICING,
  },
  {
    id: "codex-pro-100",
    budget: 100,
    label: "ChatGPT Pro 5× / Codex",
    monthlyCostUsd: 100,
    mix: [{ name: "ChatGPT Pro 5×", usd: 100 }],
    advantage:
      "Frontier quality and more agent capacity than Plus, sold as a multiple of Plus limits. The multiple is not a dollar allowance, so capacity stays unknown.",
    toMeasure: [
      "Accepted PRs per $100 against the permitted portfolio",
      "Observed rate limits and human supervision per task",
    ],
    complianceKey: "higher-tier",
    confidence: "unknown",
    sourceUrl: OPENAI_PRICING,
  },
  {
    id: "portfolio-100",
    budget: 100,
    label: "Permitted portfolio of offers and API",
    monthlyCostUsd: 100,
    mix: [
      { name: "OpenCode Go Plus", usd: 40 },
      { name: "Claude Pro", usd: 20 },
      { name: "GitHub Copilot Pro", usd: 10 },
      { name: "API pay-as-you-go", usd: 30 },
    ],
    advantage:
      "Four independent contracts: two coding subscriptions on different harnesses, a third vendor's agent plan and a metered reserve. Coverage is a ceiling, not a sum — the plans substitute on overlapping work.",
    toMeasure: [
      "Accepted PRs and review time per surface",
      "How much of each subscription is actually consumed",
      "Which surface contributes coverage the others do not",
    ],
    complianceKey: "multi-provider",
    confidence: "estimated",
    sourceUrl: GO_DOCS,
  },
];

export function scenariosForBudget(budget: number): StrategyScenario[] {
  return STRATEGY_SCENARIOS.filter(scenario => scenario.budget === budget);
}

export function scenarioStatus(scenario: StrategyScenario) {
  return positionFor(scenario.complianceKey)?.status ?? "unknown";
}

export function recommendableScenarios(
  scenarios: StrategyScenario[] = STRATEGY_SCENARIOS,
): StrategyScenario[] {
  return scenarios.filter(scenario => isRecommendable(scenarioStatus(scenario)));
}
