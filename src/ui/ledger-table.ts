/** 04 — Layer 1 ledger. Same ladder as the decision table, one row per plan. */
import { html } from "lit-html";

import { ESTIMATES, estimateFor } from "../data/derived/estimates";
import { PLANS, type Plan } from "../data/plans";
import { RUNGS, type Band, type Rung } from "../lib/provenance";
import { badge, pico, rungTag } from "./cells";
import { el, mount } from "./dom";
import { money } from "./format";
import { sortable } from "./table-sort";
import { estimateTip, tip } from "./tooltip";

/**
 * An inferred allowance is rounded to whole dollars: carrying cents on a figure
 * fitted from eight plans claims a precision the fit does not have. Only a
 * published allowance keeps them, because there they are the provider's own.
 */
const allowanceMoney = (n: number, rung: Rung) =>
  rung === "measured" || n < 10 ? money(n) : "$" + Math.round(n).toLocaleString("en-US");

const firsthand = (rung: Rung) => rung === "measured" || rung === "observed";

const sorted = [...PLANS].sort((a, b) =>
  estimateFor(b.plan).price.value - estimateFor(a.plan).price.value);
const maxPrice = Math.max(...PLANS.map(plan => estimateFor(plan.plan).price.value));

const counts = {
  price: PLANS.filter(plan => plan.price != null).length,
  num: PLANS.filter(plan => plan.quantified).length,
  conv: PLANS.filter(plan => plan.equiv != null).length,
  meas: PLANS.filter(plan => estimateFor(plan.plan).allowance.rung === "observed").length,
};

const sq = (on: boolean, tone = "") => html`
  <td class="disc" data-sort=${on ? 1 : 0}><span class="sq ${on ? "yes " + tone : ""}"
    role="img" aria-label=${on ? "published" : "not published"}></span></td>`;

/** The interval under a figure. A published one has none, and says so once. */
const spread = (band: Band, rung: Rung) => band.high - band.low < 1e-9
  ? html`<span class="plan-src">as published</span>`
  : html`<span class="plan-src">${allowanceMoney(band.low, rung)} – ${allowanceMoney(band.high, rung)}</span>`;

function row(plan: Plan) {
  const { price, allowance } = estimateFor(plan.plan);
  const width = Math.max(1.5, price.value / maxPrice * 100);
  return html`
  <tr data-rung=${allowance.rung}>
    <td class="name">${pico(plan.plan)}${plan.plan}<span class="plan-src">${plan.src}</span></td>
    <td class="barcell">
      <div class="bar"><span style="width:${width}%"></span></div>
      <span class="ltag" data-tip=${tip(estimateTip(`Price — ${plan.plan}`, price))}>${money(price.value)}${
        price.rung === "measured" ? "" : rungTag(price.rung)}</span>
    </td>
    <td style="color:var(--ink-2)">${plan.quota}</td>
    ${sq(plan.price != null)}
    ${sq(plan.quantified)}
    ${sq(plan.equiv != null, plan.equiv?.usd != null ? "signal" : "derived")}
    ${sq(allowance.rung === "observed", "derived")}
    <td class="r" data-tip=${tip(estimateTip(`Monthly allowance — ${plan.plan}`, allowance))}>
      <span class="equiv ${allowance.rung}">${allowanceMoney(allowance.value, allowance.rung)}</span>
      ${spread(allowance, allowance.rung)}
      ${rungTag(allowance.rung)}
    </td>
    <td>${badge(plan.conf)}</td>
  </tr>`;
}

const test: Record<string, (plan: Plan) => boolean> = {
  all: () => true,
  conv: plan => plan.equiv != null,
  num: plan => plan.quantified,
  none: plan => !plan.quantified,
};

type LedgerFilter = keyof typeof test;
let activeFilter: LedgerFilter = "all";

const bySort = sortable<Plan>("ledger-rows", [
  plan => plan.plan,
  plan => estimateFor(plan.plan).price.value,
  plan => plan.quota,
  plan => plan.price != null ? 1 : 0,
  plan => plan.quantified ? 1 : 0,
  plan => plan.equiv != null ? 1 : 0,
  plan => estimateFor(plan.plan).allowance.rung === "observed" ? 1 : 0,
  plan => estimateFor(plan.plan).allowance.value,
  plan => plan.conf,
], renderLedgerRows);

function renderLedgerRows(): void {
  mount(el("ledger-rows"), html`${bySort(sorted.filter(test[activeFilter])).map(row)}`);
}

export function renderLedger(): void {
  const total = PLANS.length;

  el("ledger-title").textContent = `All ${total} plans, sorted by price.`;
  document.querySelectorAll(".tot").forEach(node => { node.textContent = String(total); });

  mount(el("staircase"), html`${([
    ["Publishes a price", counts.price, "in USD, on a page you can read today"],
    ["Attaches a number", counts.num, "any figure at all bound to the allowance"],
    ["In a convertible unit", counts.conv, "dollars, or a countable rate of messages or requests"],
    ["Measured by anyone", counts.meas, "a published trace of work completed before the limit bit"],
  ] as const).map(([label, value, detail], index) => html`
    <div class="step ${value === 0 ? "off" : index === 2 ? "on" : ""}">
      <span class="k">${label}</span>
      <span class="v">${value}<span class="of"> / ${total}</span></span>
      <span class="d">${detail}</span>
    </div>`)}`);

  renderLedgerRows();

  const rungTally = RUNGS
    .map(rung => [rung, PLANS.filter(p => estimateFor(p.plan).allowance.rung === rung).length] as const)
    .filter(([, n]) => n)
    .map(([rung, n]) => `${n} ${rung}`)
    .join(" · ");
  el("tally").textContent =
    `${total} plans · ${counts.price} priced · ${counts.num} with a number · ${counts.conv} convertible`
    + ` · allowance: ${rungTally}`;

  const group = el("ledger-controls");
  group.querySelectorAll<HTMLButtonElement>("button").forEach(button => {
    const filter = test[button.dataset.value!];
    button.textContent = `${button.textContent} (${sorted.filter(filter).length})`;
    button.addEventListener("click", () => {
      group.querySelectorAll("button").forEach(other =>
        other.setAttribute("aria-pressed", String(other === button)));
      activeFilter = button.dataset.value as LedgerFilter;
      renderLedgerRows();
    });
  });

  // The pay-vs-get bars stay first-hand only: a modelled allowance drawn as a bar
  // next to a real price reads as a promise the provider never made.
  const evidenced = Object.values(ESTIMATES).filter(estimate => firsthand(estimate.allowance.rung));
  const widest = Math.max(...evidenced.map(estimate =>
    Math.max(estimate.allowance.value, estimate.price.value)));
  mount(el("four"), html`${evidenced
    .sort((a, b) => b.allowance.value / b.price.value - a.allowance.value / a.price.value)
    .map(({ plan, price, allowance }) => html`
    <div class="frow">
      <div class="who">
        <b>${plan.plan}</b>
        <span>${allowance.rung === "measured" ? "published in dollars" : "measured by a subscriber"}
          · ${(allowance.value / price.value).toFixed(1)}× the price</span>
      </div>
      <div class="pair">
        <div class="line">
          <span class="tag">You pay</span>
          <span class="track"><i class="cost" style="width:${price.value / widest * 100}%"></i></span>
          <span class="val">${money(price.value)}</span>
        </div>
        <div class="line">
          <span class="tag">${allowance.rung === "measured" ? "You get" : "Observed"}</span>
          <span class="track"><i class="${allowance.rung === "measured" ? "worth" : "ceil"}"
            style="width:${allowance.value / widest * 100}%"></i></span>
          <span class="val">${allowance.rung === "measured" ? "" : "~"}${allowanceMoney(allowance.value, allowance.rung)}</span>
        </div>
      </div>
       </div>`)}`);
}
