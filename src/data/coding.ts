import snapshot from "../../data/opencode-go.json";
import type { QuotaPolicy, QuotaWindow } from "../lib/quota";

type CodingConfidence = "official" | "estimated" | "unknown";
interface CodingSource {
  title: string;
  url: string;
  checkedAt: string;
}

export interface CodingSetup {
  id: string;
  plan: string;
  provider: string;
  model: string;
  harness: string;
  priceUsd: number;
  /** Null is unknown, never unlimited: no published dollar-equivalent cap. */
  policy: QuotaPolicy | null;
  source: CodingSource;
  confidence: CodingConfidence;
  note: string;
}

const roundCents = (n: number): number => Math.round(n * 100) / 100;

/**
 * The snapshot states the three windows as fixed shares of the monthly cap
 * (5-hour 20%, weekly 50%, monthly 100%) and does not state how any of them
 * resets. The words are OpenCode's; the reset kind stays unknown.
 */
export function openCodeWindows(monthlyUsd: number): QuotaWindow[] {
  return [
    { window: "5h", amount: roundCents(monthlyUsd * 0.2), kind: "unknown" },
    { window: "7d", amount: roundCents(monthlyUsd * 0.5), kind: "unknown" },
    { window: "month", amount: roundCents(monthlyUsd * 1), kind: "unknown" },
  ];
}

const OPENCODE_SOURCE: CodingSource = {
  title: "OpenCode Go — plans, models and usage limits",
  url: snapshot.source_url,
  checkedAt: snapshot.retrieved_on,
};

const TIERS = {
  go: { plan: "OpenCode Go", key: "go" },
  "go-plus": { plan: "OpenCode Go Plus", key: "go-plus" },
} as const;

type Tier = keyof typeof TIERS;

function openCodeRow(tier: Tier, slug: string): CodingSetup {
  const plan = snapshot.plans[tier];
  const model = plan.models.find(entry => entry.slug === slug);
  if (!model || model.usdPerMonth == null) {
    throw new Error(`OpenCode ${tier} no longer publishes a monthly cap for ${slug}`);
  }
  const monthly = model.usdPerMonth;
  const requests = model.requestsPer5h == null
    ? "no request estimate"
    : `OpenCode estimates ${model.requestsPer5h.toLocaleString("en-US")} requests per 5 h from observed token patterns; that estimate is recorded, never converted`;
  return {
    id: `${tier}-${slug}`,
    plan: TIERS[tier].plan,
    provider: "OpenCode",
    model: model.name,
    harness: "OpenCode",
    priceUsd: plan.price,
    policy: {
      metric: "vendor-valued usage",
      model: model.name,
      windows: openCodeWindows(monthly),
      isCashCredit: false,
    },
    source: OPENCODE_SOURCE,
    confidence: "official",
    note: `Publishes a $${monthly}/month cap for ${model.name}, with the 5-hour and weekly caps at 20% and 50% of it; ${requests}. No plan-level total is published, reset semantics are unknown, and the dollars are vendor-valued usage rather than refundable credit.`,
  };
}

const CODEX: CodingSetup = {
  id: "chatgpt-plus-codex",
  plan: "ChatGPT Plus",
  provider: "OpenAI",
  model: "Codex (model varies by plan and task)",
  harness: "Codex",
  priceUsd: 20,
  policy: null,
  source: {
    title: "OpenAI — ChatGPT and Codex pricing",
    url: "https://learn.chatgpt.com/docs/pricing",
    checkedAt: "2026-10-18",
  },
  confidence: "unknown",
  note: "OpenAI publishes the $20 subscription price but no dollar-equivalent capacity for Codex: limits vary by model, task length and harness. Capacity is unknown, not unlimited, and no task count is claimed.",
};

const API_PAYG: CodingSetup = {
  id: "api-payg",
  plan: "API pay-as-you-go",
  provider: "OpenCode rate card",
  model: "DeepSeek V4.1 Flash (metered)",
  harness: "Any",
  priceUsd: 0,
  policy: null,
  source: {
    title: "OpenCode Go — inference rate card",
    url: snapshot.source_url,
    checkedAt: snapshot.retrieved_on,
  },
  confidence: "official",
  note: "No subscription and no quota windows: every task is billed at the published token rates, so the ceiling is budget divided by cost per task, not a cap the provider publishes. The $0 is a subscription price, not free inference.",
};

export const CODING_SETUPS: CodingSetup[] = [
  openCodeRow("go", "deepseek-v4.1-flash"),
  openCodeRow("go", "deepseek-v4-pro"),
  openCodeRow("go-plus", "deepseek-v4.1-flash"),
  openCodeRow("go-plus", "deepseek-v4-pro"),
  CODEX,
  API_PAYG,
];

/** The oldest check across the rows, matching the site's freshness rule. */
export const CODING_CHECKED_ON: string = CODING_SETUPS
  .map(setup => setup.source.checkedAt)
  .sort()[0];
