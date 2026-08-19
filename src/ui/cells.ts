import { html, nothing, type TemplateResult } from "lit-html";

import type { Confidence } from "../data/plans";
import type { Band, Rung } from "../lib/provenance";

export const rungTag = (rung: Rung) => html`<span class="rung ${rung}">${rung}</span>`;

export const badge = (confidence: Confidence) =>
  html`<span class="badge ${confidence}">${confidence}</span>`;

export function bandLine(band: Band, format: (value: number) => string): TemplateResult | typeof nothing {
  return band.high - band.low < 1e-9
    ? html`<span class="basis exact">published exactly</span>`
    : html`<span class="basis band">${format(band.low)} – ${format(band.high)}</span>`;
}

export const planCell = (name: string, detail: string, icon?: TemplateResult) => html`
  <strong>${icon ?? nothing}${name}</strong><span class="subline">${detail}</span>
`;

export const modelCell = (name: string, detail: string) => html`
  <strong>${name}</strong><span class="subline">${detail}</span>
`;

const ICONS = import.meta.glob<string>("../assets/icons/*.png", {
  eager: true, query: "?no-inline&url", import: "default",
});

/** An icon from src/assets/icons — see scripts/favicons.sh. */
export const icon = (slug: string, alt = "") => html`
  <img class="pico" src=${ICONS[`../assets/icons/${slug}.png`]} alt=${alt} loading="lazy">
`;

/** Provider favicon, filed under the plan name's first word. */
export const pico = (plan: string) => icon(plan.split(" ")[0].toLowerCase());

export const sourceLink = (href: string, label: string) =>
  html`<a href=${href} target="_blank" rel="noreferrer">${label}</a>`;
