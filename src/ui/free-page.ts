/**
 * The $0 catalogue page. There is no score here: quality × capacity ÷ price is
 * undefined at zero, so the page filters by what the reader wants to do and
 * prints the model, the limits and the fallbacks together. A limit the provider
 * does not quantify stays "unknown" on the card.
 */
import { html, type TemplateResult } from "lit-html";

import {
  FREE_OFFERS, USAGE_FILTERS,
  type FreeCommercialUse, type FreeConfidence, type FreeLimit, type FreeOffer,
  type FreeOfferType, type FreeWindowKind, type ModelAccess,
} from "../data/free";
import { el, mount } from "./dom";

const TYPE_LABEL: Record<FreeOfferType, string> = {
  chat: "Chat",
  "coding-agent": "Coding agent",
  cli: "CLI",
  api: "API",
  ide: "IDE extension",
  image: "Image",
};

const ACCESS_LABEL: Record<ModelAccess, string> = {
  default: "default access",
  selector: "selectable",
  fallback: "fallback",
  temporary: "temporary access",
};

const WINDOW_LABEL: Record<FreeWindowKind, string> = {
  rolling: "rolling",
  fixed: "fixed",
  anchored: "anchored",
  unknown: "unknown",
};

const COMMERCIAL_LABEL: Record<FreeCommercialUse, string> = {
  allowed: "allowed",
  restricted: "restricted",
  unknown: "unknown",
};

const CONFIDENCE_CLASS: Record<FreeConfidence, string> = {
  official: "official",
  community_observed: "community-observed",
  derived: "derived",
  estimated: "estimated",
  unknown: "unknown",
};

const confidenceLabel = (confidence: FreeConfidence) => confidence.replace("_", " ");

/** Pure so the filter can be checked without a DOM. An unknown usage matches nothing. */
export function filterOffers(offers: readonly FreeOffer[], usage: string, region: string): FreeOffer[] {
  return offers.filter(offer =>
    (usage === "all" || (offer.usage as readonly string[]).includes(usage))
    && (region === "all" || offer.regions.includes(region)),
  );
}

function usageButton(value: string, label: string, selected: string, choose: (value: string) => void): TemplateResult {
  return html`<button type="button" class="free-chip" aria-pressed=${String(value === selected)}
    @click=${() => choose(value)}>${label}</button>`;
}

function filtersPanel(
  usage: string,
  region: string,
  regions: string[],
  chooseUsage: (value: string) => void,
  chooseRegion: (value: string) => void,
): TemplateResult {
  return html`<div class="free-filters">
    <div class="free-filter" role="group" aria-label="Filter by usage">
      <span class="kicker">Usage</span>
      <div class="free-chips">
        ${usageButton("all", "All", usage, chooseUsage)}
        ${USAGE_FILTERS.map(filter => usageButton(filter.id, filter.label, usage, chooseUsage))}
      </div>
    </div>
    <label class="free-filter">
      <span class="kicker">Region</span>
      <select class="free-select"
        @change=${(event: Event) => chooseRegion((event.target as HTMLSelectElement).value)}>
        <option value="all" ?selected=${region === "all"}>All regions</option>
        ${regions.map(value => html`<option value=${value} ?selected=${value === region}>${value}</option>`)}
      </select>
    </label>
  </div>`;
}

function limitRow(limit: FreeLimit): TemplateResult {
  const amount = limit.amount == null ? "unknown" : limit.amount.toLocaleString("en-US");
  return html`<li>
    <strong>${limit.metric}</strong>: ${amount} · window: ${limit.window} · reset: ${WINDOW_LABEL[limit.windowKind]}
    ${limit.note ? html`<span class="subline">${limit.note}</span>` : null}
  </li>`;
}

function card(offer: FreeOffer): TemplateResult {
  return html`<article class="free-card">
    <header class="free-card-head">
      <div class="free-card-title">
        <span class="kicker">${offer.provider}</span>
        <h3>${offer.name}</h3>
      </div>
      <span class="badge ${CONFIDENCE_CLASS[offer.confidence]}">${confidenceLabel(offer.confidence)}</span>
    </header>
    <dl class="free-fields">
      <dt>Service</dt><dd>${TYPE_LABEL[offer.type]}</dd>
      <dt>Default model</dt><dd>${offer.models.default}</dd>
      <dt>Best reachable</dt>
      <dd>${offer.models.best}
        <span class="subline">${ACCESS_LABEL[offer.models.access]} · ${confidenceLabel(offer.models.confidence)}</span>
      </dd>
      <dt>Commercial use</dt><dd>${COMMERCIAL_LABEL[offer.commercialUse]}</dd>
    </dl>
    <section class="free-block">
      <h4>Limits</h4>
      <ul class="free-limits">${offer.limits.map(limitRow)}</ul>
    </section>
    <section class="free-block">
      <h4>Fallbacks</h4>
      <ul class="free-fallbacks">${offer.fallbacks.map(item => html`<li>${item}</li>`)}</ul>
    </section>
    <footer class="free-card-foot">
      <a href=${offer.source.url} target="_blank" rel="noopener">${offer.source.title}</a>
      <span class="free-date">checked ${offer.source.checkedAt}${offer.source.publishedAt
        ? ` · published ${offer.source.publishedAt}` : ""}</span>
    </footer>
  </article>`;
}

function emptyPanel(): TemplateResult {
  return html`<p class="note free-empty">No free offer matches that usage and region. The filter is
    left empty rather than filled with an unverified row.</p>`;
}

function pageNote(): TemplateResult {
  return html`There is no single ranking here: every row costs $0, so quality × capacity ÷ price has
    no price to divide by. A limit the provider does not quantify stays unknown rather than being
    filled in, and a model score is not subscription throughput — it says nothing about how much you
    can use before a cap. Every row carries its source and the date it was checked.`;
}

export function renderFreePage(): void {
  const regions = [...new Set(FREE_OFFERS.flatMap(offer => offer.regions))]
    .sort((a, b) => a.localeCompare(b));
  let usage = "all";
  let region = "all";

  const paint = () => {
    mount(el("free-filters"), filtersPanel(usage, region, regions, next => {
      usage = next;
      paint();
    }, next => {
      region = next;
      paint();
    }));
    const offers = filterOffers(FREE_OFFERS, usage, region);
    mount(el("free-grid"), offers.length
      ? html`<div class="free-grid">${offers.map(card)}</div>`
      : emptyPanel());
    mount(el("free-note"), pageNote());
  };
  paint();
}
