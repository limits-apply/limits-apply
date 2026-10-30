/** 01 — Subscription decision table. Every cell filled, every cell sourced. */
import { html, nothing } from "lit-html";

import { SCORE_PLANS, mappingRung, type ModelKey, type ScorePlan } from "../data/aa";
import { CLASS_FIT, TASK_COST } from "../data/derived/estimates";
import { planModelOptions, type PlanModelOption } from "../data/plan-models";
import { planView, type Strategy } from "../data/plan-view";
import { PLANS } from "../data/plans";
import { TIERS, modelEfficiency, tierFor, type Tier } from "../lib/benchmark";
import { SPEED_KNEE } from "../lib/throughput";
import {
  RUNGS, bestConfig, divideBands, strongestConfig, tasksFromAllowance,
  type Band, type Estimate, type Rung,
} from "../lib/provenance";
import { bandLine, icon, pico, rungTag } from "./cells";
import { el, mount } from "./dom";
import { count, money, usd2 } from "./format";
import { sortable } from "./table-sort";
import { estimateTip, tip } from "./tooltip";

/** A model a reader picked, per plan. Survives sorting and the strategy toggle. */
const overrides = new Map<string, ModelKey>();
/** Plans whose model panel is open, per plan. Survives sorting too. */
const expanded = new Set<string>();

const panelId = (plan: string) =>
  `model-panel-${plan.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

interface Row {
  plan: ScorePlan;
  config: ScorePlan["configs"][number];
  price: Estimate;
  allowance: Estimate | null;
  tasks: Band | null;
  /** The billing-class fit, shown beside a measured per-model cap — never added to it. */
  fit: Estimate | null;
  fitTasks: Band | null;
  fitMultiple: Band | null;
  /** Allowance in API-equivalent dollars ÷ price: what the plan returns on what it costs, whatever the model. */
  multiple: Band | null;
  /** The weakest rung anywhere in this row's primary chain — what the row is worth as evidence. */
  rung: Rung;
  tier: Tier;
  rank: number;
}

function build(plan: ScorePlan, strategy: Strategy): Row | null {
  const view = planView(plan, strategy, overrides.get(plan.plan));
  if (!view) return null;
  const { config, price, allowance, fit } = view;

  const tasks = allowance == null ? null : tasksFromAllowance(allowance, config.costPerTask);
  const fitTasks = fit == null ? null : tasksFromAllowance(fit, config.costPerTask);
  const fitMultiple = fit == null || price.value === 0 ? null : divideBands(fit, price);
  const rungs: Rung[] = [price.rung, ...(allowance ? [allowance.rung] : []), mappingRung(plan.plan)];
  return {
    plan, config, price, allowance, fit, tasks, fitTasks, fitMultiple,
    // divideBands throws on a zero divisor by design, and the $0 view ranks on the
    // index of the model you can reach instead.
    multiple: price.value === 0 || allowance == null ? null : divideBands(allowance, price),
    rung: RUNGS[Math.max(...rungs.map(rung => RUNGS.indexOf(rung)))],
    tier: "efficient",
    rank: 0,
  };
}

/** Both sides of a per-model plan, named so no tooltip can imply they were added. */
function fitFacts(entry: Row): string[] {
  const { fit, allowance } = entry;
  if (!fit) return [];
  return [
    `fit plan: ${money(fit.value)} / month at the modelled rung`,
    ...(allowance
      ? [`measured cap: ${money(allowance.value)} / month — the two are shown side by side and never summed`]
      : []),
  ];
}

function modelLine(entry: Row) {
  const { plan, config } = entry;
  const options = planModelOptions(plan);
  const label = html`<span class="model-name">(${config.name} · ${config.reasoning})</span>`;
  if (options.length <= 1) return label;
  return html`<button
    type="button"
    class="model-toggle"
    data-model-toggle=${plan.plan}
    aria-expanded=${String(expanded.has(plan.plan))}
    aria-controls=${panelId(plan.plan)}
    data-tip=${tip(`Choose another model ${plan.plan} grants. The row's cap and tasks follow the selection;`
      + " the plan's price does not move.")}
  >${label}<span class="chev" aria-hidden="true"></span></button>`;
}

function scoredOption(option: PlanModelOption, entry: Row) {
  const config = option.config;
  if (!config) return nothing;
  const capValue = option.capUsd ?? (entry.plan.perModel ? null : entry.allowance?.value ?? null);
  const capRung = option.capUsd == null ? entry.allowance?.rung ?? null : "measured";
  const capTasks = capValue == null ? null : capValue / config.costPerTask;
  const fitTasks = entry.fit == null ? null : entry.fit.value / config.costPerTask;
  const checked = overrides.get(entry.plan.plan) === option.key;

  return html`<button
    type="button"
    class="model-option"
    role="radio"
    aria-checked=${String(checked)}
    data-model-plan=${entry.plan.plan}
    data-model-key=${option.key!}
  >
    <span class="model-option-name">${option.name}<span class="model-option-reasoning">${option.reasoning}</span></span>
    <span class="model-option-stats">
      <span>${config.intelligence.toFixed(1)} index</span>
      <span>${usd2(config.costPerTask)} / task</span>
      ${capValue == null
        ? html`<span>no published cap</span>`
        : html`<span>${money(capValue)} ${option.capUsd == null ? "allowance" : "cap"}
            ${capRung ? rungTag(capRung) : nothing}</span>`}
      ${capTasks == null ? nothing : html`<span>${count(capTasks)} tasks at ${option.capUsd == null ? "allowance" : "cap"}</span>`}
      ${fitTasks == null ? nothing : html`<span>${count(fitTasks)} tasks at fit ${rungTag("modelled")}</span>`}
    </span>
  </button>`;
}

function unscoredOption(option: PlanModelOption, plan: string) {
  const cap = option.unlimited
    ? "unlimited (promotional)"
    : option.capUsd == null ? "no published cap" : `${money(option.capUsd)} cap`;
  const requests = option.requestsPer5h == null ? "no request estimate" : `${count(option.requestsPer5h)} requests / 5 h`;
  return html`<button
    type="button"
    class="model-option"
    role="radio"
    aria-checked="false"
    disabled
    data-model-plan=${plan}
  >
    <span class="model-option-name">${option.name}</span>
    <span class="model-option-stats">
      <span>${cap}</span>
      <span>no AA v5.0 index or cost per task</span>
      <span>${requests}</span>
    </span>
  </button>`;
}

function modelPanel(entry: Row, strategy: Strategy) {
  const { plan, fit } = entry;
  const options = planModelOptions(plan);
  const scored = options.filter(option => option.config != null);
  const unscored = options.filter(option => option.config == null);
  const auto = (strategy === "delivery" ? bestConfig(plan.configs) : strongestConfig(plan.configs))!;
  const overridden = overrides.has(plan.plan);

  return html`<tr class="model-panel-row">
    <td colspan="6" id=${panelId(plan.plan)}>
      <div class="model-panel" role="radiogroup" aria-label="Models granted by ${plan.plan}">
        <button
          type="button"
          class="model-option model-option-auto"
          role="radio"
          aria-checked=${String(!overridden)}
          data-model-plan=${plan.plan}
          data-model-key=""
        >
          <span class="model-option-name">Auto</span>
          <span class="model-option-stats">${strategy === "delivery" ? "Delivery" : "Planning"} picks
            ${auto.name} · ${auto.reasoning}</span>
        </button>
        <div class="model-group">
          <p class="model-group-title">Scored at AA v5.0</p>
          ${scored.map(option => scoredOption(option, entry))}
        </div>
        ${unscored.length
          ? html`<details class="model-group model-group-unscored">
              <summary class="model-group-title">Granted, not scored at AA v5.0 (${unscored.length})</summary>
              ${unscored.map(option => unscoredOption(option, plan.plan))}
            </details>`
          : nothing}
        ${fit
          ? html`<p class="basis model-panel-note">Cap is measured; the fit (${money(fit.value)} / month) is
              modelled. They are shown beside each other and never summed.</p>`
          : nothing}
      </div>
    </td>
  </tr>`;
}

const speedIcon = (rate: number) => rate < SPEED_KNEE ? "🐌" : rate < 3 * SPEED_KNEE ? "🐇" : "🚀";

function row(entry: Row, strategy: Strategy) {
  const { plan, config, price, allowance, tasks, fitTasks, fitMultiple, multiple } = entry;
  const sibling = mappingRung(plan.plan) === "modelled";
  const aaUrl = `https://artificialanalysis.ai/models/${config.slug}`;
  const te = modelEfficiency(config);
  const minutes = config.outputTokens / config.outputSpeed / 60;
  const planTip = tip(estimateTip(`${plan.plan} — ${config.name} · ${config.reasoning}`, price, [
    `model: ${config.name}, reasoning ${config.reasoning}${sibling ? " (sibling model: nearest scored of the same family)" : ""}`,
    `${usd2(config.costPerTask)} AA cost per task`,
    ...(te == null ? [] : [`${te.toFixed(0)} Index pts / 10k tokens`]),
    `row rests on: ${entry.rung}`,
    ...fitFacts(entry),
    plan.src === "secondary" ? "priced from third-party trackers" : `source ${plan.sourceUrl}`,
    `AA model page ${aaUrl}`,
  ]));

  return html`<tr class="rung-${entry.rung}" data-rank=${entry.rank}>
      <td class="plan-cell" data-tip=${planTip}>
        <strong>${pico(plan.plan)}${plan.plan}</strong>
        ${modelLine(entry)}
        <span class="price">${money(price.value)}<span class="per"> / month</span>${
          price.rung === "measured" ? nothing : html` ${rungTag(price.rung)}`}</span>
      </td>
      <td class="num capacity" data-tip=${tasks && allowance
        ? tip(estimateTip(`Tasks / month — ${plan.plan}`, allowance, [
            `${money(allowance.value)} of API-equivalent${price.value > 0
              ? ` for ${money(price.value)} · ${(allowance.value / price.value).toFixed(1)}×` : ""}`,
            `÷ ${usd2(config.costPerTask)} AA cost per task on ${config.name} · ${config.reasoning}`
            + ` = ${count(tasks.value)} tasks / month`,
            ...(fitTasks
              ? [`fit plan ≈ ${count(fitTasks.value)} tasks at the modelled class fit`
                + " — a second figure, never added to the measured cap"]
              : []),
          ]))
        : nothing}>
        ${tasks
          ? html`<strong>≈ ${count(tasks.value)}</strong>${rungTag(allowance!.rung)}${bandLine(tasks, count)}`
          : html`<span class="empty"></span><span class="basis">no published allowance</span>`}
        ${fitTasks
          ? html`<span class="basis fit-line">fit plan ≈ ${count(fitTasks.value)} ${rungTag("modelled")}</span>`
          : nothing}
      </td>
      <td class="num yield" data-tip=${multiple && allowance
        ? tip(estimateTip(`× price — ${plan.plan}`, allowance, [
            `${money(allowance.value)} of API-equivalent ÷ ${money(price.value)} = ${multiple.value.toFixed(1)}×`,
            "independent of the model: it compares what each plan hands back for what it costs",
            ...fitFacts(entry),
          ]))
        : nothing}>
        ${multiple
          ? html`${multiple.value.toFixed(1)}× ${bandLine(multiple, value => `${value.toFixed(1)}×`)}`
          : html`<span class="empty"></span><span class="basis">undefined at $0</span>`}
        ${fitMultiple
          ? html`<span class="basis fit-line">fit ${fitMultiple.value.toFixed(1)}× ${rungTag("modelled")}</span>`
          : nothing}
      </td>
      <td class="num">
        <a class="aa-link" href=${aaUrl} target="_blank" rel="noreferrer">${icon("artificialanalysis")}${config.intelligence.toFixed(0)}</a>
      </td>
      <td class="num">${count(config.outputTokens)}</td>
      <td class="num" data-tip=${tip(`${count(config.outputTokens)} tokens ÷ ${config.outputSpeed.toFixed(1)} tok/s`
        + ` = ${minutes.toFixed(1)} min for one AA task on ${config.name} · ${config.reasoning}. AA median speed on the`
        + " model's API, not the plan's harness; first-token delay left out.")}>
        <span aria-hidden="true">${speedIcon(config.outputSpeed)}</span> ${config.outputSpeed.toFixed(0)} <span class="basis">tok/s · ≈ ${minutes < 10 ? minutes.toFixed(1) : minutes.toFixed(0)} min / task</span>
      </td>
    </tr>${expanded.has(plan.plan) ? modelPanel(entry, strategy) : nothing}`;
}

function tierRow(tier: Tier) {
  const index = TIERS.findIndex(entry => entry.key === tier);
  const floor = TIERS[index].floor;
  const span = index === 0 ? `AA Index ≥ ${floor}`
    : floor > 0 ? `AA Index ${floor}–${TIERS[index - 1].floor}` : `AA Index < ${TIERS[index - 1].floor}`;
  return html`<tr class="tier-row"><th scope="rowgroup" colspan="6">${tier}
    <span class="basis">${span} · ranked by tasks / month within</span></th></tr>`;
}

function note(rows: Row[]) {
  const fits = (["metered", "flat"] as const).map(billing => {
    const fit = CLASS_FIT[billing];
    return html`<li><strong>${billing}</strong> ×${fit.band.value.toFixed(2)} of price
      <span class="basis">band ×${fit.band.low.toFixed(2)}–×${fit.band.high.toFixed(2)} · n=${fit.n}</span></li>`;
  });

  const counts = RUNGS.map(rung => [rung, rows.filter(row => row.rung === rung).length] as const)
    .filter(([, n]) => n);

  return html`<dl>
    <dt>Formula</dt>
    <dd>Tasks / month = monthly allowance in API-equivalent dollars ÷ AA API cost per task<br>
      × price = monthly allowance in API-equivalent dollars ÷ price</dd>

    <dt>Order</dt>
    <dd>Rows are grouped by the AA Index of their model — frontier ≥ ${TIERS[0].floor},
      near-frontier ${TIERS[1].floor}–${TIERS[0].floor}, efficient below ${TIERS[1].floor} — then ranked by tasks / month
      inside each group. A cheaper model does not beat a frontier one; it wins its tier. The ranges are a
      preference, not a finding, set for AA Index v5.0 and re-set when the index version changes.
      Sort any column to drop the grouping.</dd>

    <dt>How each figure was obtained</dt>
    <dd class="rungs">${counts.map(([rung, n]) => html`<span>${rungTag(rung)} ${n}</span>`)}
      <span class="basis">Hover a plan or a tasks cell for its formula, assumptions, source and read date.</span></dd>

    <dt>Scope</dt>
    <dd>${rows.length} of ${PLANS.length} plans grant a model Artificial Analysis has scored;
      the other ${PLANS.length - rows.length} are in
      <a href="./research.html#ledger">the full ledger</a>, never silently dropped.</dd>

    <dt>Where nothing is published</dt>
    <dd>The allowance is fitted from the plans of the same billing class that do disclose — a multiple of
      price, not a task count. A published countable rate is expanded at a modelled task costing
      $${TASK_COST.toFixed(3)}. A plan that publishes a cap per model shows that cap, on whichever model
      is selected above, at the <span class="rung measured">measured</span> rung, and its billing class's
      fit at the <span class="rung modelled">modelled</span> rung. The two are separate figures — the cap
      is what the provider states, the fit is what a plan at this price would ordinarily return — and they
      are never summed. Click a plan to choose another model it grants.
      <ul class="fits">${fits}</ul>
      A <span class="rung modelled">modelled</span> row is an estimate with a stated method, not a measurement:
      it is what a plan at this price in this billing class would have to deliver to be ordinary.</dd>
  </dl>`;
}

const filters = { strategy: "delivery" as Strategy };

const bySort = sortable<Row>("score-rows", [
  row => row.plan.plan,
  row => row.tasks?.value ?? NaN,
  row => row.multiple?.value ?? NaN,
  row => row.config.intelligence,
  row => row.config.outputTokens,
  () => null,
],() => renderScoreTable());

export function renderScoreTable(): void {
  const built = SCORE_PLANS
    .map(plan => build(plan, filters.strategy))
    .filter((entry): entry is Row => entry != null);
  const tierRank = (entry: Row) => TIERS.findIndex(tier => tier.key === entry.tier);
  const ranked = built
    .map(entry => ({ ...entry, tier: tierFor(entry.config.intelligence) }))
    .sort((a, b) => tierRank(a) - tierRank(b)
      || (b.tasks?.value ?? -Infinity) - (a.tasks?.value ?? -Infinity)
      || b.config.intelligence - a.config.intelligence)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
  const rows = bySort(ranked);
  // A column sort returns a new array; the grouping only means something in the default order.
  const tiered = rows === ranked;

  mount(el("score-rows"), rows.length
    ? html`${rows.map((entry, index) => html`${tiered && entry.tier !== rows[index - 1]?.tier
      ? tierRow(entry.tier) : nothing}${row(entry, filters.strategy)}`)}`
    : html`<tr><td colspan="6" class="no-rows">No plan grants a scored model.</td></tr>`);

  mount(el("score-note"), note(ranked));
}

function onScoreClick(event: Event): void {
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-model-toggle], [data-model-key]");
  if (!target) return;

  const toggle = target.dataset.modelToggle;
  if (toggle) {
    if (expanded.has(toggle)) expanded.delete(toggle);
    else expanded.add(toggle);
    renderScoreTable();
    return;
  }

  const plan = target.dataset.modelPlan;
  if (!plan || target.matches(":disabled")) return;
  const key = target.dataset.modelKey;
  if (key) overrides.set(plan, key as ModelKey);
  else overrides.delete(plan);
  expanded.delete(plan);
  renderScoreTable();
}

let wired = false;

export function wireScoreControls(): void {
  const group = document.querySelector<HTMLElement>("[data-filter=strategy]")!;
  const buttons = group.querySelectorAll<HTMLButtonElement>("button");
  buttons.forEach(button => {
    button.addEventListener("click", () => {
      buttons.forEach(other => other.setAttribute("aria-pressed", String(other === button)));
      filters.strategy = button.dataset.value as Strategy;
      renderScoreTable();
    });
  });

  // One delegated listener, not one per row: every render replaces the rows.
  if (wired) return;
  wired = true;
  el("score-rows").addEventListener("click", onScoreClick);
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !expanded.size) return;
    expanded.clear();
    renderScoreTable();
  });
}
