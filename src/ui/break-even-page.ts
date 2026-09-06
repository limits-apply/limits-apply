/** 08 — the break-even page: the disclosure headline and the provider's own anchor. */
import { html } from "lit-html";

import { DISCLOSURE } from "../data/derived/disclosure";
import { estimateFor } from "../data/derived/estimates";
import { CLAUDE_CODE_USAGE } from "../data/provider-usage";
import { rungTag, sourceLink } from "./cells";
import { el, mount } from "./dom";
import { money } from "./format";

export function renderBreakEvenPage(): void {
  el("be-headline").textContent =
    `Of ${DISCLOSURE.total} AI subscription plans, ${DISCLOSURE.usd} publish what the money buys.`;

  document.querySelectorAll<HTMLElement>("[data-count]").forEach(node => {
    node.textContent = String(DISCLOSURE[node.dataset.count as keyof typeof DISCLOSURE]);
  });

  const seat = estimateFor("Claude Max 20×");
  const usage = CLAUDE_CODE_USAGE;
  mount(el("be-anchor"), html`
    Anthropic’s own cost documentation puts the average Claude Code developer at about
    <span class="mono">${money(usage.avgPerActiveDay)}</span> per active day at API rates —
    <span class="mono">${money(usage.monthLow)}–${money(usage.monthHigh)}</span> a month —
    with 90% of users under <span class="mono">${money(usage.p90PerActiveDay)}</span> a day.
    A Claude Max 20× seat costs <span class="mono">${money(seat.price.value)}</span> a month.
    The provider’s own average band straddles its own seat price ${rungTag("derived")} —
    by Anthropic’s numbers, the median developer is at break-even, and everyone above the
    median is buying compute below the metered price. Whether the plan’s <em>allowance</em>
    actually covers that usage is the number the sentence “usage limits apply” replaces —
    and the one this benchmark exists to measure.
    Source: ${sourceLink(usage.sourceUrl, "Manage costs effectively — Claude Code docs")},
    read ${usage.verified}.`);
}
