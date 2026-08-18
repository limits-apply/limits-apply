/** 01 — Subscription decision table. Every cell filled, every cell sourced. */
import { html, nothing } from "lit-html";

import { BEST_AA, SCORE_PLANS, UNMAPPED_PLANS, mappingRung, type ScorePlan } from "../data/aa";
import { CLASS_FIT, TASK_COST, estimateFor } from "../data/derived/estimates";
import { PRICE_BRACKETS, bracketFor, modelEfficiency, tierFor, type BracketKey } from "../lib/benchmark";
import {
  RUNGS, bestConfig, strongestConfig, tasksFromAllowance, yieldBand,
  type Band, type Estimate, type Rung,
} from "../lib/provenance";
import { badge, bandLine, pico, rungTag, sourceLink } from "./cells";
import { el, mount } from "./dom";
import { count, money, usd2 } from "./format";
import { sortable } from "./table-sort";
import { estimateTip, plainTip, siblingTip, tip } from "./tooltip";

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

interface Row {
  plan: ScorePlan;
  config: ScorePlan["configs"][number];
  price: Estimate;
  allowance: Estimate;
  tasks: Band;
  proxy: Band;
  /** The weakest rung anywhere in this row's chain — what the row is worth as evidence. */
  rung: Rung;
  rank: number;
}

type Strategy = "delivery" | "planning";

function build(plan: ScorePlan, strategy: Strategy): Row | null {
  const config = strategy === "delivery" ? bestConfig(plan.configs) : strongestConfig(plan.configs);
  if (!config) return null;

  const { price, allowance } = estimateFor(plan.plan);
  const tasks = tasksFromAllowance(allowance, config.costPerTask);
  const rungs: Rung[] = [price.rung, allowance.rung, mappingRung(plan.plan)];
  return {
    plan, config, price, allowance, tasks,
    proxy: yieldBand(config.intelligence, tasks, price),
    rung: RUNGS[Math.max(...rungs.map(rung => RUNGS.indexOf(rung)))],
    rank: 0,
  };
}

function row(entry: Row) {
  const { plan, config, price, allowance, tasks, proxy } = entry;
  const modelTier = tierFor(config.intelligence, BEST_AA);
  const sibling = mappingRung(plan.plan) === "modelled";
  const aaUrl = `https://artificialanalysis.ai/models/${config.slug}`;
  const te = modelEfficiency(config);

  const capacityTip = estimateTip(`Monthly capacity — ${plan.plan}`, allowance, [
    `÷ ${usd2(config.costPerTask)} AA cost per task on ${config.name} · ${config.reasoning}`
    + ` = ${count(tasks.value)} tasks / month`,
  ]);
  const proxyTip = estimateTip(`AA proxy per dollar — ${plan.plan}`, allowance, [
    `${config.intelligence.toFixed(1)} AA Index × ${count(tasks.value)} tasks ÷ ${money(price.value)}`
    + ` = ${count(proxy.value)}`,
    `price is ${price.rung}: ${price.formula}`,
  ]);

  return html`
    <tr class="rung-${entry.rung}" data-rank=${entry.rank}>
      <td><span class="rank ${entry.rank === 1 ? "top" : ""}">${MEDALS[entry.rank] ?? entry.rank}</span></td>
      <td class="plan-cell">
        <strong>${pico(plan.plan)}${plan.plan}</strong>
        <span class="subline" data-tip=${tip(estimateTip(`Price — ${plan.plan}`, price))}>${money(price.value)} / month${
          price.rung === "measured" ? nothing : html` ${rungTag(price.rung)}`}</span>
      </td>
      <td class="model-cell">
        <strong>${config.name}</strong>
        <span class="subline">reasoning: ${config.reasoning}</span>
        <span class="tier ${modelTier}">${modelTier}</span>
      </td>
      <td class="num">
        <a class="aa-link" href=${aaUrl} target="_blank" rel="noreferrer">${config.intelligence.toFixed(1)}</a>
        ${sibling
          ? html`<span class="basis sibling" data-tip=${tip(siblingTip(plan.plan, config.name))}>sibling model</span>`
          : html`<span class="basis">as scored</span>`}
      </td>
      <td class="num">${count(config.outputTokens)}<span class="basis">answer + reasoning</span>${
        te == null ? nothing : html`<span class="basis">${te.toFixed(0)} Index pts / 10k tokens</span>`}</td>
      <td class="num">${usd2(config.costPerTask)}<span class="basis">AA aggregate</span></td>
      <td class="num" data-tip=${tip(capacityTip)}>
        ${count(tasks.value)} ${rungTag(allowance.rung)}
        ${bandLine(tasks, count)}
      </td>
      <td class="num yield" data-tip=${tip(proxyTip)}>
        ${count(proxy.value)}
        ${bandLine(proxy, count)}
      </td>
      <td>${sourceLink(plan.sourceUrl, plan.src === "secondary" ? "secondary source" : "plan")} ·
        ${sourceLink(aaUrl, "AA")}${plan.access
          ? html` · ${sourceLink(plan.access.source, "access")} · ${sourceLink(plan.access.billing, "billing")}`
          : html`<span class="subline">exact model access unverified</span>`}<span
          class="subline">${badge(plan.conf)}</span></td>
    </tr>`;
}

const RUNG_BLURB: Record<Rung, string> = {
  measured: "the provider publishes the allowance in dollars",
  observed: "somebody measured it and published the trace",
  derived: "converted from a countable rate the provider publishes",
  chained: "a published ratio applied to another plan's figure",
  modelled: "fitted from the plans in the same billing class that disclose",
};

function note(rows: Row[]) {
  const fits = (["metered", "flat"] as const).map((billing, index) => {
    const fit = CLASS_FIT[billing];
    return html`${index ? " · " : nothing}<strong>${billing}</strong> ×${fit.band.value.toFixed(2)} of price${
      ` (band ×${fit.band.low.toFixed(2)}–×${fit.band.high.toFixed(2)}, n=${fit.n})`}`;
  });

  const counts = RUNGS.map(rung => [rung, rows.filter(row => row.rung === rung).length] as const)
    .filter(([, n]) => n);

  return html`<strong>AA proxy / $ = AA Index × (monthly allowance ÷ AA API cost per task) ÷ price.</strong>
    Every figure on this table is filled, and every figure states how: ${counts
      .map(([rung, n]) => `${n} ${rung}`).join(" · ")}.
    Hover any capacity or proxy cell for its formula, its assumptions, its source and the date it was read.
    Where a provider publishes nothing, the allowance is fitted from the plans in the same billing class
    that do — ${fits}, against a modelled task costing $${TASK_COST.toFixed(3)} — and the row is marked
    <span class="rung modelled">modelled</span>, which is an estimate with a stated method, not a measurement.
    A modelled row is not evidence that the plan delivers this; it is what a plan at this price in this
    billing class would have to deliver to be ordinary.
    ${UNMAPPED_PLANS.length} plans in the ledger below still never reach this table —
    ${UNMAPPED_PLANS.join(", ")} grant models Artificial Analysis has not scored in this snapshot and have
    no sibling in it, so there is no index to attach and no honest way to invent one.`;
}

const filters = { strategy: "delivery" as Strategy, bracket: "all" as BracketKey | "all" };

const bySort = sortable<Row>("score-rows", [
  row => row.rank,
  row => row.plan.plan,
  row => row.config.name,
  row => row.config.intelligence,
  row => row.config.outputTokens,
  row => row.config.costPerTask,
  row => row.tasks.value,
  row => row.proxy.value,
  row => row.plan.plan,
], renderScoreTable);

export function renderScoreTable(): void {
  const ranked = SCORE_PLANS
    .filter(plan => filters.bracket === "all" || bracketFor(estimateFor(plan.plan).price.value) === filters.bracket)
    .map(plan => build(plan, filters.strategy))
    .filter((entry): entry is Row => entry != null)
    .sort((a, b) => b.proxy.value - a.proxy.value)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
  const rows = bySort(ranked);

  mount(el("score-rows"), rows.length
    ? html`${rows.map(row)}`
    : html`<tr><td colspan="9" class="no-rows">No plan at this price point grants a scored model.</td></tr>`);

  const top = ranked[0];
  const soft = !!top && top.rung !== "measured" && top.rung !== "observed";
  el("score-winner-tile").classList.toggle("soft", soft);
  el("score-winner-label").textContent = soft
    ? "Estimated, not measured"
    : filters.strategy === "delivery" ? "Most work × intelligence per dollar" : "Smartest model, priced";
  el("score-winner").textContent = top?.plan.plan || "Nothing in view";
  el("score-pool").textContent = !top
    ? "Try another price point"
    : `≈ ${count(top.tasks.value)} AA-suite tasks / month at index ${top.config.intelligence.toFixed(1)}`
      + ` for ${money(top.price.value)} — ${RUNG_BLURB[top.rung]}`;

  const highest = ranked.reduce<Row | null>((best, entry) =>
    !best || entry.config.intelligence > best.config.intelligence ? entry : best, null);
  el("score-highest").textContent = highest
    ? `${highest.config.name} · ${highest.config.intelligence.toFixed(1)}`
    : "No model in view";

  const firsthand = ranked.filter(entry => entry.rung === "measured" || entry.rung === "observed").length;
  el("score-coverage").textContent = `${firsthand} of ${ranked.length} first-hand`;

  mount(el("coverage"), html`${RUNGS
    .map(rung => [rung, ranked.filter(entry => entry.rung === rung).length] as const)
    .filter(([, n]) => n)
    .map(([rung, n]) => html`<span class="cv-${rung}" style="flex:${n}"
      data-tip=${tip(plainTip(`${n} ${rung}`, RUNG_BLURB[rung]))}></span>`)}`);

  mount(el("score-note"), note(ranked));
}

export function wireScoreControls(): void {
  mount(el("bracket-controls"), html`${[{ key: "all", label: "All" }, ...PRICE_BRACKETS]
    .map(({ key, label }) => html`<button type="button" data-value=${key}
      aria-pressed=${String(key === filters.bracket)}>${label}</button>`)}`);

  document.querySelectorAll<HTMLElement>("[data-filter]").forEach(group => {
    const name = group.dataset.filter as keyof typeof filters;
    const buttons = group.querySelectorAll<HTMLButtonElement>("button");
    buttons.forEach(button => {
      button.addEventListener("click", () => {
        buttons.forEach(other => other.setAttribute("aria-pressed", String(other === button)));
        filters[name] = button.dataset.value as never;
        renderScoreTable();
      });
    });
  });
}
