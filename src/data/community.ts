/**
 * Sourced user measurements. Never part of SCORE_PLANS, never rankable —
 * their job is to expose the best available evidence, including where a
 * raw-token answer is not defensible.
 */
import { summarizeCommunityObservation } from "../lib/benchmark";

export interface CommunityMeasurement {
  plan: string;
  configuration: string;
  window: string;
  /** Length of the quota window the percentages are shares of. */
  windowDays: number;
  /** Raw tokens per 1% of the window, or null when the report doesn't carry them. */
  rawPerPercent: number | null;
  /** [low, high] API-equivalent USD per 1% of the window. */
  apiPerPercent: [number, number];
  evidence: string;
  note: string;
  sources: [label: string, href: string][];
  confidence: "estimated";
  label: string;
  basis: string;
  rankable: false;
}

export const codexPlusObserved = summarizeCommunityObservation({
  usedPercent: 71,
  rawTokens: 118_159_982,
  apiUsd: 82.10,
})!;

export const COMMUNITY_MEASUREMENTS: CommunityMeasurement[] = [
  {
    plan: "ChatGPT Plus",
    configuration: "Codex · GPT-5.6 Sol medium",
    window: "Weekly quota · reports dated 22 Jul and 13 Aug 2026",
    windowDays: 7,
    rawPerPercent: codexPlusObserved.rawTokensPerPercent,
    apiPerPercent: [1.00, codexPlusObserved.apiUsdPerPercent],
    evidence: "945 calls · 6 sessions · 97.3% cached input",
    note: "The raw-token figure is from the 22 July workload. The lower API-equivalent bound is a separate 13 August reset report.",
    sources: [
      ["JSONL measurement", "https://www.reddit.com/r/codex/comments/1v3c19s/i_used_118m_codex_tokens_in_one_day_and_consumed/"],
      ["13 Aug reset", "https://www.reddit.com/r/codex/comments/1vn46tq/openai_silently_nerfed_our_limits_after_todays_resets/"],
      ["rate card", "https://help.openai.com/en/articles/20001106-codex-rate-card"],
    ],
    confidence: "estimated",
    label: "Observed · single account",
    basis: codexPlusObserved.basis,
    rankable: codexPlusObserved.rankable,
  },
  {
    plan: "Claude Max 5×",
    configuration: "Claude Opus 5 · high",
    window: "Weekly proxy · Mar–Jul 2026",
    windowDays: 7,
    rawPerPercent: null,
    apiPerPercent: [5.23, 5.23],
    evidence: "80 autonomous tasks · historical allowance study",
    note: "Pricing proxy only. The study predates Opus 5; matching Opus 5 pricing does not prove that its subscription weighting or allowance is unchanged.",
    sources: [
      ["allowance study", "https://www.reddit.com/r/ClaudeAI/comments/1s0n5bf/what_a_claude_max_weekly_limit_is_actually_worth/"],
      ["Opus 5 pricing", "https://platform.claude.com/docs/en/about-claude/models/whats-new-opus-5"],
    ],
    confidence: "estimated",
    label: "Proxy · raw tokens unknown",
    basis: "community-derived",
    rankable: false,
  },
];
