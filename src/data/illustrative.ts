/**
 * Illustrative figures — not benchmark data. They exist to show the shape of an
 * argument the measurements have yet to fill in. Nothing here is a claim.
 */
import { AA_AGENTS } from "./agents";

export interface Portfolio {
  items: [name: string, usd: number][];
  note: string;
}

const agentGap = Math.abs(AA_AGENTS.codexSol.index - AA_AGENTS.claudeOpus.index).toFixed(1);

export const PORTFOLIOS: Record<number, Portfolio> = {
  0: {
    items: [["OpenCode Zen Big Pickle", 0], ["Google Gemini API Free", 0],
      ["OpenCode Zen Muse Spark 1.3 Contributor Free", 0], ["GitHub Copilot Free", 0]],
    note: "With $0 the ledger can rank the models and cannot rank the allowances — no provider publishes a countable quota for a free tier. These four are the strongest AA indices reachable at $0, each with what it costs in data terms: three train on your prompts, one of them an unnamed model, and the fourth publishes 2,000 completions a month and nothing else.",
  },
  10: {
    items: [["OpenCode Go", 10]],
    note: "$10 buys two plans at this price, and only one of them still publishes what the money buys in dollars: GitHub Copilot Pro's $15 of credits. OpenCode Go publishes a dollar cap per model instead of a plan-level total — $15 to $80 across its roster — so its row carries the cap of the model selected ($15 on GPT-6 Luna, $80 on DeepSeek V4.1 Flash), at the `measured` rung, and the $10 answer names it as the strongest reachable model, not as a plan-level allowance. The free models above do not stop being free: the $10 answer is OpenCode Go plus the Zen free roster, not OpenCode Go instead of them.",
  },
  20: {
    items: [["ChatGPT Plus", 20]],
    note: "At $20 you are choosing, not composing. The only question worth answering is which single workload you want covered well — and that is exactly the measurement nobody publishes.",
  },
  50: {
    items: [["Claude Pro", 20], ["ChatGPT Plus", 20], ["API buffer", 10]],
    note: `Two harnesses over two model families — ${agentGap} points apart at the top of the AA coding-agent index — plus enough PAYG to absorb the overflow when one of them throttles mid-task. Published tier ratios being linear up to $100, this splits the same per-dollar value across two quota windows instead of one.`,
  },
  100: {
    items: [["ChatGPT Plus", 20], ["Claude Pro", 20], ["Google AI Pro", 19.99], ["API buffer", 40.01]],
    note: "Three plans stop being additive here — they overlap heavily on general work. The buffer exists because a quota you hit on a Thursday afternoon is a workflow you have lost until Friday.",
  },
  200: {
    items: [["Claude Max 5×", 100], ["ChatGPT Plus", 20], ["Google AI Pro", 19.99], ["API buffer", 60.01]],
    note: "Depth on one plan instead of breadth across four — and $200 is where depth gets its only published discount: both Claude and ChatGPT sell 20× the limits at 10× the price of the $20 tier. Whether depth beats breadth still depends on how concentrated your hard workload is, which is a measurement, not an opinion.",
  },
};

/** The break-even chart's illustrative plan: $20, 200 tasks, $0.35/task at API prices. */
export const BREAK_EVEN = { price: 20, tasks: 200, apiCostPerTask: 0.35 };
