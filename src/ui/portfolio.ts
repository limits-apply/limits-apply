/** 11 — Portfolio. Illustrative allocation, not a recommendation. */
import { html } from "lit-html";

import { AA_AGENTS } from "../data/agents";
import { CLASS_FIT } from "../data/derived/estimates";
import { PORTFOLIOS } from "../data/illustrative";
import { el, mount } from "./dom";

function stackingNote() {
  const flat = CLASS_FIT.flat.band.value.toFixed(0);
  const codex = AA_AGENTS.codexSol, claude = AA_AGENTS.claudeOpus;
  return html`<br><br><span class="kicker">Why stacking two $20 flat plans is not a naive move</span>
    — the two flat plans anybody has measured hand back ~×${flat} their price at full use, and the
    published tier ratios are linear up to $100 (5× the limits at 5× the price), so per dollar a
    $100 tier buys the same notional compute as five $20 units of the same plan. Meanwhile the two
    best coding agents on the AA index sit 0.2 points apart
    (${codex.agent} + ${codex.model} at ${codex.index.toFixed(1)} vs ${claude.agent} +
    ${claude.model} at ${claude.index.toFixed(1)}), which is what makes them substitutes on one
    workload. The only published bulk discount sits at the $200 tiers — 20× the limits at 10× the
    price on both providers. All of it community-observed or chained, none of it measured by us.`;
}

export function renderPortfolio(): void {
  const bar = el("budgets");
  const list = el("alloc");
  const note = el("alloc-note");

  const draw = (budget: number) => {
    const p = PORTFOLIOS[budget];
    mount(list, html`${p.items.map(([name, amt]) => html`<li class=${name === "API buffer" ? "buffer" : ""}><span>${name}</span>
      <span class="amt">$${amt.toFixed(2)}</span></li>`)}
      <li><strong>Total</strong><span class="amt"><strong>$${p.items.reduce((sum, [, amt]) => sum + amt, 0).toFixed(2)}</strong></span></li>`);
    mount(note, html`${p.note}<br><br><span class="kicker">Measured coverage · coding / research / general</span>
      — pending Layer 2. This is where the benchmark stops being informative and starts being decisional.${stackingNote()}`);
    for (const btn of Array.from(bar.children) as HTMLElement[])
      btn.setAttribute("aria-pressed", String(Number(btn.dataset.b) === budget));
  };

  for (const budget of Object.keys(PORTFOLIOS).map(Number)) {
    const btn = document.createElement("button");
    btn.textContent = "$" + budget;
    btn.dataset.b = String(budget);
    btn.onclick = () => draw(budget);
    bar.append(btn);
  }
  draw(100);
}
