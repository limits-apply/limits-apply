/** 12 — Budget frontier. Cost, ceiling and coverage, none of them free of the others. */
import { BEST_AA, SCORE_PLANS, UNMAPPED_PLANS, mappingRung } from "../data/aa";
import { html } from "lit-html";
import { estimateFor } from "../data/derived/estimates";
import { PLAN_SURFACE } from "../data/plans";
import {
  combosUnder, frontier, pickThree, weakestRung,
  type Candidate, type Combo,
} from "../lib/portfolio";
import { bestConfig, tasksFromAllowance, type Band } from "../lib/provenance";
import { el, mount, svg } from "./dom";
import { bandLine, pico as cellPico } from "./cells";
import { count, money } from "./format";


function candidatePool(): Candidate[] {
  return SCORE_PLANS.flatMap(plan => {
    const config = bestConfig(plan.configs);
    const surface = PLAN_SURFACE[plan.plan];
    if (!config || !surface) return [];

    const { price, allowance } = estimateFor(plan.plan);
    return [{
      plan: plan.plan,
      vendor: surface.vendor,
      harness: surface.harness,
      price,
      tasks: tasksFromAllowance(allowance, config.costPerTask),
      intelligence: config.intelligence,
      rung: weakestRung([price.rung, allowance.rung, mappingRung(plan.plan)]),
    }];
  });
}

const band = (b: Band, format: (n: number) => string) => bandLine(b, format);

function comboCard(combo: Combo, axis: string, why: string) {
  const members = combo.members.map(member =>
    html`<li>${cellPico(member.plan)}<span>${member.plan}</span>
      <span class="amt">${money(member.price.value)}</span></li>`);

  return html`<article class="combo rung-${combo.rung}">
    <span class="kicker">${axis}</span>
     <ul class="combo-plans">${members}</ul>
    <dl class="combo-figures">
      <div><dt>Total</dt><dd class="amt">${money(combo.price.value)}<span class="tot">/mo</span></dd></div>
      <div><dt>Ceiling</dt><dd class="amt">${combo.ceiling.toFixed(1)}
        <span class="tot">AA Index</span></dd></div>
      <div><dt>Headroom</dt><dd class="amt">${count(combo.headroom.value)}
        <span class="tot">tasks/mo</span>${band(combo.headroom, count)}</dd></div>
    </dl>
    <p class="note">${why} <span class="rung ${combo.rung}">${combo.rung}</span></p>
   </article>`;
}

const VIEW = { l: 58, r: 588, t: 22, b: 150 };
/** Marks sitting exactly on an axis read as clipped, so the scales stop short of it. */
const INSET = 0.06;

/**
 * Price against ceiling, with headroom as the radius.
 *
 * The frontier has three axes, so a plot of two of them is not a frontier: cheap
 * points that lose on both would read as gains, and the line through them would
 * slope the wrong way. Cost carries the x-axis — the shape docs/methodology.md calls
 * Pareto 1 — and coverage rides on the mark instead of an axis it would misdescribe.
 */
function drawFrontier(chart: HTMLElement, front: Combo[], picks: Combo[], demand: number): void {
  chart.textContent = "";
  if (!front.length) return;

  const xs = front.map(combo => combo.price.value);
  const ys = front.map(combo => combo.ceiling);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const span = (v: number, lo: number, hi: number) =>
    hi === lo ? 0.5 : INSET + ((v - lo) / (hi - lo)) * (1 - 2 * INSET);
  const sx = (v: number) => VIEW.l + span(v, x0, x1) * (VIEW.r - VIEW.l);
  const sy = (v: number) => VIEW.b - span(v, y0, y1) * (VIEW.b - VIEW.t);

  chart.append(
    svg("line", { class: "ax", x1: VIEW.l, y1: VIEW.b, x2: VIEW.r, y2: VIEW.b }),
    svg("line", { class: "ax", x1: VIEW.l, y1: VIEW.t, x2: VIEW.l, y2: VIEW.b }),
    svg("text", { class: "axlabel", x: VIEW.r, y: VIEW.b + 38, "text-anchor": "end" },
      "monthly price →"),
    svg("text", {
      class: "axlabel", x: 13, y: VIEW.t,
      transform: `rotate(-90 13 ${VIEW.t})`, "text-anchor": "end",
    }, "ceiling · AA index →"),
    svg("text", { class: "tick", x: sx(x0), y: VIEW.b + 18, "text-anchor": "middle" }, money(x0)),
    svg("text", { class: "tick", x: VIEW.l - 8, y: sy(y0) + 4, "text-anchor": "end" }, y0.toFixed(1)),
    svg("text", { class: "tick", x: VIEW.l - 8, y: sy(y1) + 4, "text-anchor": "end" }, y1.toFixed(1)),
  );
  if (x1 > x0) {
    chart.append(svg("text", { class: "tick", x: sx(x1), y: VIEW.b + 18, "text-anchor": "middle" },
      money(x1)));
  }

  for (const combo of front) {
    const picked = picks.includes(combo);
    const covered = demand > 0 ? Math.min(1, combo.headroom.value / demand) : 0;
    chart.append(svg("circle", {
      class: picked ? "dot" : "dot dominated",
      cx: sx(combo.price.value), cy: sy(combo.ceiling), r: (3 + covered * 6).toFixed(1),
    }));
  }

  for (const combo of picks) {
    const x = sx(combo.price.value);
    chart.append(svg("text", {
      class: "dotlabel", x: Math.min(x, VIEW.r - 4), y: sy(combo.ceiling) - 13,
      "text-anchor": x > VIEW.r - 90 ? "end" : "middle",
    }, combo.members.map(member => member.plan).join(" + ")));
  }
}

export function renderBudgetModal(): void {
  const dialog = el("budget-modal") as HTMLDialogElement;
  const budgetInput = el("budget-range") as HTMLInputElement;
  const demandInput = el("demand-range") as HTMLInputElement;
  const budgetOut = el("budget-value");
  const demandOut = el("demand-value");
  const results = el("budget-results");
  const slack = el("budget-slack");
  const chart = el("chart-frontier");
  const pool = candidatePool();

  const draw = () => {
    const budget = Number(budgetInput.value);
    const demand = Number(demandInput.value);

    budgetOut.textContent = money(budget);
    demandOut.textContent = count(demand);
    budgetInput.setAttribute("aria-valuetext", `${money(budget)} per month`);
    demandInput.setAttribute("aria-valuetext", `${count(demand)} tasks per month`);

    const front = frontier(combosUnder(pool, budget, demand));
    const picks = pickThree(front, demand);

    if (!picks) {
      mount(results, html`<p class="note">Nothing in the ledger is priced at or below
        ${money(budget)}. The cheapest plan carrying a model mapping is
        ${money(Math.min(...pool.map(candidate => candidate.price.value)))} / month.</p>`);
      slack.textContent = "";
      drawFrontier(chart, [], [], demand);
      return;
    }

    const labelled: [Combo, string, string][] = [
      [picks.ceiling, "Highest ceiling",
        "The best index this budget reaches, whatever it costs in coverage."],
      [picks.headroom, "Most headroom",
        "Covers the most of the month you stated, at a lower index."],
      ...(picks.spend
        ? [[picks.spend, "Cheapest that covers it",
          "The least this month can be covered for — at the index that buys."] as [Combo, string, string]]
        : []),
    ];
    const distinct = labelled.filter(([combo], i) =>
      labelled.findIndex(([other]) => other === combo) === i);

    mount(results, distinct.length === 1
      ? comboCard(distinct[0][0], "The only shape this budget makes",
        "Nothing else affordable is better on cost, ceiling or headroom at once.")
      : html`${distinct.map(([combo, axis, why]) => comboCard(combo, axis, why))}`);

    const dearest = Math.max(...distinct.map(([combo]) => combo.price.value));
    const covered = picks.spend
      ? ` The month itself is covered from <strong>${money(picks.spend.price.value)}</strong>.`
      : "";
    mount(slack, dearest < budget - 0.01
      ? html`You set ${money(budget)}. Nothing on this frontier needs more than
        <strong>${money(dearest)}</strong> — the remaining ${money(budget - dearest)} buys no
        headroom you told us you would use.${covered}`
      : html`${covered}`);

    drawFrontier(chart, front, distinct.map(([combo]) => combo), demand);
  };

  budgetInput.addEventListener("input", draw);
  demandInput.addEventListener("input", draw);

  el("budget-open").addEventListener("click", () => {
    draw();
    dialog.showModal();
  });
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });

  el("budget-unmapped").textContent = UNMAPPED_PLANS.join(" · ");
  el("budget-best-aa").textContent = BEST_AA.toFixed(1);
  draw();
}
