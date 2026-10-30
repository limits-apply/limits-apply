/** 02 — side by side, with the evidence left visible. */
import { html, nothing } from "lit-html";

import { SCORE_PLANS, mappingRung } from "../data/aa";
import { estimateFor } from "../data/derived/estimates";
import { PLANS, type Confidence, type Plan } from "../data/plans";
import { planView } from "../data/plan-view";
import { divideBands, type Band, type Rung } from "../lib/provenance";
import { badge, pico } from "./cells";
import { el, mount } from "./dom";
import { count, money } from "./format";

export const MAX_COMPARE = 4;

const DEFAULT_COMPARE_PLANS = [
  "Google Gemini API Free",
  "OpenCode Zen Big Pickle",
  "OpenCode Go",
  "Claude Pro",
];

interface CompareCell {
  /** Formatted when a figure exists; null when the cell is unknown. */
  text: string | null;
  /** The numeric figure, null whenever showing a number would invent one. */
  value: number | null;
  detail: string | null;
  href: string | null;
  rung: Rung | null;
  confidence: Confidence | null;
}

export interface CompareRow {
  id: string;
  label: string;
  cells: CompareCell[];
}

const BLANK: CompareCell = {
  text: null, value: null, detail: null, href: null, rung: null, confidence: null,
};

const cell = (overrides: Partial<CompareCell>): CompareCell => ({ ...BLANK, ...overrides });
const unknown = (detail: string): CompareCell => cell({ detail });

const SCORE_BY_NAME = new Map(SCORE_PLANS.map(plan => [plan.plan, plan]));

/** The same plan × strategy view the decision table uses. Compare shows the strongest. */
const viewOf = (plan: Plan) => {
  const score = SCORE_BY_NAME.get(plan.plan);
  return score ? planView(score, "planning") : null;
};

const bandText = (band: Band): string =>
  band.high - band.low < 1e-9
    ? "published exactly"
    : `${money(band.low)} – ${money(band.high)}`;

function priceCell(plan: Plan): CompareCell {
  const estimate = estimateFor(plan.plan);
  if (!estimate) return unknown("no price estimate");
  return cell({
    text: `${money(estimate.price.value)} / month`,
    value: estimate.price.value,
    detail: estimate.price.rung === "measured" ? "as published" : `${estimate.price.rung} price`,
  });
}

function modelCell(plan: Plan): CompareCell {
  const view = viewOf(plan);
  if (!view) return unknown("no scored model mapping");
  return cell({
    text: view.config.name,
    detail: `strongest reachable · reasoning ${view.config.reasoning}`,
    href: `https://artificialanalysis.ai/models/${view.config.slug}`,
  });
}

function indexCell(plan: Plan): CompareCell {
  const view = viewOf(plan);
  if (!view) return unknown("no AA index for the granted model");
  return cell({
    text: view.config.intelligence.toFixed(0),
    value: view.config.intelligence,
    detail: mappingRung(plan.plan) === "modelled"
      ? "sibling model, not the granted one"
      : "as scored",
  });
}

function allowanceCell(plan: Plan): CompareCell {
  const estimate = estimateFor(plan.plan);
  const allowance = viewOf(plan)?.allowance ?? estimate?.allowance ?? null;
  if (!allowance || !(allowance.value > 0)) {
    return cell({
      detail: plan.price === 0
        ? "no published allowance at $0"
        : "no allowance the ladder can fill",
      confidence: plan.conf,
    });
  }
  return cell({
    text: money(allowance.value),
    value: allowance.value,
    detail: bandText(allowance),
    rung: allowance.rung,
    confidence: plan.conf,
  });
}

function unitCell(plan: Plan): CompareCell {
  const equiv = plan.equiv;
  if (equiv?.usd != null) {
    return cell({
      text: `${money(equiv.usd)} of usage / month`,
      value: equiv.usd,
      detail: "published dollar allowance",
    });
  }
  if (equiv?.per != null && equiv.hours != null && equiv.unit) {
    return cell({
      text: `${count(equiv.per)} ${equiv.unit} / ${equiv.hours} h`,
      value: equiv.per,
      detail: "published reset rate; a ceiling when expanded to a month",
    });
  }
  const view = viewOf(plan);
  if (plan.perModel && view?.allowance) {
    return cell({
      text: "USD / month (per-model cap)",
      value: view.allowance.value,
      detail: `published for ${view.config.name}; the plan has no total`,
    });
  }
  if (estimateFor(plan.plan)?.allowance) {
    return cell({
      text: "API-equivalent USD / month",
      detail: "fitted or observed; no countable window published",
    });
  }
  return unknown("no unit or window published");
}

function perDollarCell(plan: Plan): CompareCell {
  const estimate = estimateFor(plan.plan);
  if (!estimate) return unknown("no estimate to divide");
  if (estimate.price.value === 0) {
    return cell({
      text: "not defined at $0",
      detail: "a zero price gives no divisor; the offer is compared on model access",
    });
  }
  const allowance = viewOf(plan)?.allowance ?? estimate.allowance;
  if (!allowance || !(allowance.value > 0)) return unknown("no allowance to divide");
  const band = divideBands(allowance, estimate.price);
  return cell({
    text: `${money(band.value)} / $1`,
    value: band.value,
    detail: band.high - band.low < 1e-9
      ? plan.perModel ? "published per-model cap per price dollar" : "API-equivalent per price dollar"
      : `${bandText(band)} per $1`,
  });
}

function sourceCell(plan: Plan): CompareCell {
  return cell({
    text: plan.src === "secondary" ? "secondary source" : "provider page",
    detail: `verified ${plan.verified}`,
    href: plan.sourceUrl,
  });
}

export function compareRows(plans: Plan[]): CompareRow[] {
  return [
    { id: "price", label: "Monthly price", cells: plans.map(priceCell) },
    { id: "model", label: "Model mapping", cells: plans.map(modelCell) },
    { id: "index", label: "AA Index", cells: plans.map(indexCell) },
    { id: "allowance", label: "Allowance", cells: plans.map(allowanceCell) },
    { id: "unit", label: "Allowance unit / window", cells: plans.map(unitCell) },
    { id: "per-dollar", label: "Allowance per price dollar", cells: plans.map(perDollarCell) },
    { id: "source", label: "Source", cells: plans.map(sourceCell) },
  ];
}

export function defaultCompareSelection(): string[] {
  return DEFAULT_COMPARE_PLANS
    .filter(name => PLANS.some(plan => plan.plan === name))
    .slice(0, MAX_COMPARE);
}

export function selectComparePlan(
  selected: readonly string[],
  plan: string,
  checked: boolean,
  max = MAX_COMPARE,
): string[] {
  if (!checked) return selected.filter(name => name !== plan);
  if (selected.includes(plan) || selected.length >= max) return [...selected];
  return [...selected, plan];
}

function cellContent(content: CompareCell) {
  const main = content.value == null && content.text == null
    ? html`<span class="compare-unknown">unknown</span>`
    : content.href
      ? html`<a class="compare-figure" href=${content.href} target="_blank"
          rel="noreferrer">${content.text}</a>`
      : content.value == null
        ? html`<span class="compare-undefined">${content.text}</span>`
        : html`<strong class="compare-figure">${content.text}</strong>`;

  return html`${main}
    ${content.rung ? html`<span class="rung ${content.rung}">${content.rung}</span>` : nothing}
    ${content.confidence ? badge(content.confidence) : nothing}
    ${content.detail ? html`<span class="basis">${content.detail}</span>` : nothing}`;
}

function compareTable(plans: Plan[]) {
  if (!plans.length) {
    return html`<p class="note">Nothing is selected. Tick up to ${MAX_COMPARE} offers above.</p>`;
  }
  return html`<div class="compare-scroll"><table class="compare-table">
    <caption class="sr-only">Selected plans compared side by side</caption>
    <thead><tr><th scope="col">Figure</th>
      ${plans.map(plan => html`<th scope="col">${pico(plan.plan)}${plan.plan}</th>`)}
    </tr></thead>
    <tbody>${compareRows(plans).map(row => html`<tr data-row=${row.id}>
      <th scope="row">${row.label}</th>
      ${row.cells.map(content => html`<td>${cellContent(content)}</td>`)}
    </tr>`)}</tbody>
  </table></div>`;
}

function picker(selected: string[], onToggle: (plan: string, checked: boolean) => void) {
  const atLimit = selected.length >= MAX_COMPARE;

  const group = (title: string, plans: Plan[]) => html`<fieldset class="compare-group">
    <legend>${title}</legend>
    <div class="compare-options">${plans.map(plan => {
      const checked = selected.includes(plan.plan);
      const price = estimateFor(plan.plan)?.price.value;
      return html`<label class="compare-option ${checked ? "selected" : ""}${
        !checked && atLimit ? " disabled" : ""}">
        <input type="checkbox" value=${plan.plan} .checked=${checked}
          ?disabled=${!checked && atLimit}
          @change=${(event: Event) =>
            onToggle(plan.plan, (event.target as HTMLInputElement).checked)}>
        <span class="compare-option-name">${plan.plan}</span>
        <span class="compare-option-price">${price == null ? "price unknown" : money(price)}</span>
      </label>`;
    })}</div>
  </fieldset>`;

  return html`<div class="compare-picker-head">
    <span class="kicker">Selection</span>
    <span class="compare-count" aria-live="polite">${selected.length} of
      ${MAX_COMPARE} selected</span>
  </div>
  <p class="note">The default view is two $0 offers and two paid plans. At four, further
    boxes disable until one is cleared.</p>
  ${group("Free and data-training offers", PLANS.filter(plan => plan.price === 0))}
  ${group("Paid subscriptions", PLANS.filter(plan => plan.price !== 0))}`;
}

export function renderComparePage(): void {
  const pickerNode = el("compare-picker");
  const gridNode = el("compare-grid");
  const noteNode = el("compare-note");

  let selected = defaultCompareSelection();

  const draw = () => {
    mount(pickerNode, picker(selected, (plan, checked) => {
      selected = selectComparePlan(selected, plan, checked);
      draw();
      for (const input of pickerNode.querySelectorAll<HTMLInputElement>("input[type=checkbox]")) {
        if (input.value === plan) {
          input.focus();
          break;
        }
      }
    }));

    const chosen = selected
      .map(name => PLANS.find(plan => plan.plan === name))
      .filter((plan): plan is Plan => plan != null);
    mount(gridNode, compareTable(chosen));
  };

  mount(noteNode, html`<strong>A model score is not subscription throughput.</strong> The AA
    Index measures a model over an API; it says nothing about how many tasks a plan completes.
    Every figure keeps its source and verification date, and an allowance the ladder cannot
    fill is shown as <em>unknown</em> — never as zero. A $0 offer is compared on the model it
    reaches and on its price of nothing, without any per-dollar figure: a zero divisor has no
    meaning. No first-party Layer 2 runs exist yet; the Observatory carries community observations.`);

  draw();
}
