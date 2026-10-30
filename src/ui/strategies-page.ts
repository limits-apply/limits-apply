/** 01 — fixed-budget strategies, with the terms position each one inherits. */
import { html, nothing } from "lit-html";

import {
  STRATEGY_BUDGETS, STRATEGY_SCENARIOS, STRATEGY_VERIFIED_ON, recommendableScenarios,
  scenariosForBudget, type StrategyBudget, type StrategyConfidence, type StrategyScenario,
} from "../data/strategies";
import { isRecommendable, positionFor, type ComplianceStatus } from "../lib/compliance";
import { el, mount } from "./dom";
import { money } from "./format";

const COMPLIANCE_LABELS: Record<ComplianceStatus, string> = {
  allowed: "Allowed",
  requires_confirmation: "Requires confirmation",
  prohibited: "Prohibited",
  unknown: "Unknown",
};

/** Only the options a reader may act on ever reach the scenario cards. */
function scenariosFor(budget: number): StrategyScenario[] {
  return recommendableScenarios(scenariosForBudget(budget));
}

function complianceLabel(status: ComplianceStatus): string {
  return COMPLIANCE_LABELS[status];
}

const statusOf = (scenario: StrategyScenario): ComplianceStatus =>
  positionFor(scenario.complianceKey)?.status ?? "unknown";

const complianceBadge = (status: ComplianceStatus) => html`
  <span class="compliance-badge ${status}">${complianceLabel(status)}</span>
`;

const confidenceBadge = (confidence: StrategyConfidence) => html`
  <span class="confidence-badge ${confidence}">${confidence}</span>
`;

function mixList(scenario: StrategyScenario) {
  return html`<ul class="scenario-mix">
    ${scenario.mix.map(item => html`<li>
      <span>${item.name}</span><span class="amt">${money(item.usd)}</span>
    </li>`)}
  </ul>`;
}

function scenarioCard(scenario: StrategyScenario) {
  const status = statusOf(scenario);
  const actionable = isRecommendable(status);

  return html`<article class="scenario-card compliance-${status}" data-scenario=${scenario.id}>
    <div class="scenario-head">
      <span class="kicker">${money(scenario.monthlyCostUsd)} / month</span>
      ${complianceBadge(status)}
    </div>
    <h3>${scenario.label}</h3>
    ${mixList(scenario)}
    <dl class="scenario-figures">
      <div><dt>Advantage</dt><dd>${scenario.advantage}</dd></div>
      <div><dt>What to measure</dt><dd><ul>
        ${scenario.toMeasure.map(item => html`<li>${item}</li>`)}
      </ul></dd></div>
    </dl>
    <div class="scenario-meta">
      ${confidenceBadge(scenario.confidence)}
      ${scenario.sourceUrl
        ? html`<a href=${scenario.sourceUrl} target="_blank" rel="noreferrer">source</a>`
        : html`<span class="basis">no public source</span>`}
    </div>
    ${actionable
      ? html`<a class="scenario-compare" href="./compare.html">Compare this mix</a>`
      : nothing}
  </article>`;
}

function registerItem(scenario: StrategyScenario) {
  const position = positionFor(scenario.complianceKey);

  return html`<article class="register-item" data-scenario=${scenario.id}
    data-compliance="prohibited">
    <div class="register-head">
      <span class="kicker">Budget ${money(scenario.budget)} ·
        ${money(scenario.monthlyCostUsd)} / month</span>
      ${complianceBadge("prohibited")}
    </div>
    <h3>${scenario.label}</h3>
    ${mixList(scenario)}
    <p class="register-advantage">${scenario.advantage}</p>
    <p class="register-rationale">${position?.rationale ?? "No terms position recorded."}</p>
    ${position?.termsUrl
      ? html`<a href=${position.termsUrl} target="_blank" rel="noreferrer">Terms of service</a>`
      : nothing}
    <p class="note">Shown for the arithmetic only. No configuration, rotation guide or export
      exists for this row, and it is never ranked.</p>
  </article>`;
}

function register(scenarios: StrategyScenario[]) {
  if (!scenarios.length) {
    return html`<p class="note">No prohibited scenario falls in this budget view.</p>`;
  }
  return html`<div class="analytical-register">
    <div class="register-intro">
      <span class="kicker">Analytical register</span>
      <p class="note">Kept because the arithmetic explains why the cheapest multiplier is not
        offered, not because it is purchasable. These rows carry no configure or export
        control.</p>
    </div>
    ${scenarios.map(registerItem)}
  </div>`;
}

function budgetButtons(selected: StrategyBudget) {
  return html`<div class="strategy-budgets" role="group" aria-label="Monthly budget in US dollars">
    ${STRATEGY_BUDGETS.map(value => html`<button type="button" data-budget=${value}
      aria-pressed=${String(value === selected)}>${money(value)}</button>`)}
  </div>`;
}

export function renderStrategiesPage(): void {
  const budgetNode = el("strategy-budget");
  const scenariosNode = el("strategy-scenarios");
  const listNode = el("strategy-list");
  const noteNode = el("strategy-note");

  let budget: StrategyBudget = STRATEGY_BUDGETS[0];

  const draw = () => {
    const visible = scenariosFor(budget);
    mount(budgetNode, budgetButtons(budget));
    mount(scenariosNode, visible.length
      ? html`<div class="scenario-grid">${visible.map(scenarioCard)}</div>`
      : html`<p class="note">No scenario at this budget has a recommendable terms position.</p>`);
    mount(listNode, register(
      STRATEGY_SCENARIOS.filter(scenario => statusOf(scenario) === "prohibited"),
    ));
  };

  budgetNode.addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-budget]");
    if (!button) return;
    budget = Number(button.dataset.budget) as StrategyBudget;
    draw();
  });

  budgetNode.addEventListener("keydown", event => {
    const current = STRATEGY_BUDGETS.indexOf(budget);
    let next = current;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (current + 1) % STRATEGY_BUDGETS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (current - 1 + STRATEGY_BUDGETS.length) % STRATEGY_BUDGETS.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = STRATEGY_BUDGETS.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    budget = STRATEGY_BUDGETS[next];
    draw();
    budgetNode.querySelector<HTMLButtonElement>(`button[data-budget="${budget}"]`)?.focus();
  });

  const keptOut = STRATEGY_SCENARIOS.length - recommendableScenarios().length;
  mount(noteNode, html`<strong>How to read this page.</strong> A prohibited scenario is never
    ranked or exported: it stays in the analytical register with its status, because the
    arithmetic is worth understanding and the purchase is not. Costs here are subscription
    prices, not prepaid credits — none is refundable and none converts to API dollars. No
    Layer 2 evidence exists yet, so every capacity figure is a published cap or an explicit
    unknown, never a measured throughput. Sources and terms positions were read on
    ${STRATEGY_VERIFIED_ON}. ${keptOut} of the ${STRATEGY_SCENARIOS.length} scenarios are kept
    out of the ranking for that reason.`);

  draw();
}
