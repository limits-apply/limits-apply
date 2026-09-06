/**
 * Anthropic's own published Claude Code consumption figures, priced at API rates.
 * The one place a provider states what its median subscriber would have paid
 * metered — which makes it the only break-even anchor that is the provider's own
 * number rather than ours.
 */
export const CLAUDE_CODE_USAGE = {
  avgPerActiveDay: 13,
  monthLow: 150,
  monthHigh: 250,
  p90PerActiveDay: 30,
  sourceUrl: "https://code.claude.com/docs/en/costs",
  verified: "2026-08-25",
};
