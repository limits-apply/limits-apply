export const PROVIDERS = ["openai", "anthropic"] as const;

export type Provider = (typeof PROVIDERS)[number];

/**
 * One stable id per billable subscription. The id is what an observation
 * carries; `plan` is the display name the site's ledger already tracks, so a
 * renamed marketing page never invalidates history.
 */
export interface Subscription {
  subscriptionId: string;
  provider: Provider;
  plan: string;
  /** The harness the subscription's quota is consumed through. */
  harness: string;
  /** The provider's own machine plan token, when the client reports one. */
  planType?: string;
}

export const SUBSCRIPTIONS: Subscription[] = [
  { subscriptionId: "openai.chatgpt-free", provider: "openai", plan: "ChatGPT Free", harness: "codex", planType: "free" },
  { subscriptionId: "openai.chatgpt-plus", provider: "openai", plan: "ChatGPT Plus", harness: "codex", planType: "plus" },
  { subscriptionId: "openai.chatgpt-pro", provider: "openai", plan: "ChatGPT Pro", harness: "codex", planType: "pro" },
  { subscriptionId: "openai.chatgpt-team", provider: "openai", plan: "ChatGPT Team", harness: "codex", planType: "team" },
  { subscriptionId: "openai.chatgpt-business", provider: "openai", plan: "ChatGPT Business", harness: "codex", planType: "business" },
  { subscriptionId: "openai.api-metered", provider: "openai", plan: "OpenAI API (metered)", harness: "any" },
  { subscriptionId: "anthropic.claude-free", provider: "anthropic", plan: "Claude Free", harness: "claude-code" },
  { subscriptionId: "anthropic.claude-pro", provider: "anthropic", plan: "Claude Pro", harness: "claude-code" },
  { subscriptionId: "anthropic.claude-max-5x", provider: "anthropic", plan: "Claude Max 5×", harness: "claude-code" },
  { subscriptionId: "anthropic.claude-max-20x", provider: "anthropic", plan: "Claude Max 20×", harness: "claude-code" },
  { subscriptionId: "anthropic.claude-team", provider: "anthropic", plan: "Claude Team", harness: "claude-code" },
  { subscriptionId: "anthropic.api-metered", provider: "anthropic", plan: "Anthropic API (metered)", harness: "any" },
];

export const SUBSCRIPTION_IDS = SUBSCRIPTIONS.map(s => s.subscriptionId);

/** Codex reports `plan_type` in its rate-limit events; an unknown one is not attributable. */
export function subscriptionForPlanType(provider: Provider, planType: string): Subscription | null {
  return SUBSCRIPTIONS.find(s => s.provider === provider && s.planType === planType) ?? null;
}
