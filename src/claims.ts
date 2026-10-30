import { AGENT_POINTS } from "./data/agents";
import { DISCLOSURE } from "./data/derived/disclosure";

const usd2 = (n: number) => `$${n.toFixed(2)}`;

/**
 * Sentences whose numbers come from the data. The HTML carries
 * `<!-- claim:key -->`; `vite.config.ts` replaces it at build time, and an
 * unknown key fails the build instead of shipping a stale literal.
 */
export const CLAIMS = {
  "disclosure.summary": () =>
    `Of ${DISCLOSURE.total} AI subscription plans, ${DISCLOSURE.usd} publish what the money buys.`,

  "disclosure.usd": () => `${DISCLOSURE.usd}`,

  "disclosure.other": () =>
    `the other ${DISCLOSURE.total - DISCLOSURE.usd} are resolved on the ladder or absent because the provider publishes nothing.`,

  "disclosure.convertible": () =>
    `The ${DISCLOSURE.convertible} that convert`,

  "disclosure.observed": () =>
    `${DISCLOSURE.observed} published traces of work completed exist — both community reports, both single-account. No provider publishes one.`,

  "disclosure.observed.short": () =>
    `${DISCLOSURE.observed} of ${DISCLOSURE.total} plans carry a published trace of work completed before the limit bit.`,

  "agentic.range": () => {
    const costs = AGENT_POINTS.map(point => point.x);
    return `costs anywhere from ${usd2(Math.min(...costs))} to ${usd2(Math.max(...costs))} at API rates across the scored harnesses`;
  },
} as const;

export type ClaimKey = keyof typeof CLAIMS;
