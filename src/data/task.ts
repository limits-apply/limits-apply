/**
 * The ledger's single stated assumption. A derived figure is only honest if you
 * can move it yourself: halve the task size and every ceiling on that page halves.
 * The formula is printed on the page itself — keep the two in sync.
 */
import type { RateCard, TaskShape } from "../lib/benchmark";

/** A mid-sized agentic turn. */
export const TASK: TaskShape = { inTok: 12000, outTok: 1500 };

/** Mid-tier frontier rates, USD per million tokens. */
export const RATE: RateCard = { in: 2.00, out: 12.00 };
