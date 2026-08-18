/**
 * Illustrative figures — not benchmark data. They exist to show the shape of an
 * argument the measurements have yet to fill in. Nothing here is a claim.
 */
export interface Portfolio {
  items: [name: string, usd: number][];
  note: string;
}

export const PORTFOLIOS: Record<number, Portfolio> = {
  20: {
    items: [["ChatGPT Plus", 20]],
    note: "At $20 you are choosing, not composing. The only question worth answering is which single workload you want covered well — and that is exactly the measurement nobody publishes.",
  },
  50: {
    items: [["Claude Pro", 20], ["ChatGPT Plus", 20], ["API buffer", 10]],
    note: "Two harnesses over two model families — 0.2 points apart at the top of the AA coding-agent index — plus enough PAYG to absorb the overflow when one of them throttles mid-task. Published tier ratios being linear up to $100, this splits the same per-dollar value across two quota windows instead of one.",
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
