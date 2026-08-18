/** 05 — Sourced community observations. Never part of the ranking. */
import { COMMUNITY_MEASUREMENTS, type CommunityMeasurement } from "../data/community";
import { html } from "lit-html";
import { badge, pico } from "./cells";
import { el, mount } from "./dom";
import { sortable } from "./table-sort";

const bySort = sortable<CommunityMeasurement>("community-measurement-rows", [
  row => row.plan,
  row => row.window,
  row => row.rawPerPercent ?? NaN,
  row => row.evidence,
  row => row.confidence,
], renderCommunityMeasurements);

export function renderCommunityMeasurements(): void {
  mount(el("community-measurement-rows"), html`${bySort(COMMUNITY_MEASUREMENTS).map(row => {
    const raw = row.rawPerPercent == null
      ? html`<span class="empty">— raw tokens</span>`
      : html`≈${(row.rawPerPercent / 1_000_000).toFixed(2)}M raw tokens`;
    const [low, high] = row.apiPerPercent;
    const api = Math.abs(high - low) < 0.005
      ? `$${high.toFixed(2)} API-equivalent`
      : `$${low.toFixed(2)}–$${high.toFixed(2)} API-equivalent`;
    return html`<tr>
      <td><strong>${pico(row.plan)}${row.plan}</strong><span class="subline">${row.configuration}</span></td>
      <td>${row.window}</td>
      <td><strong>${raw}</strong><span class="subline">${api}</span></td>
      <td>${row.evidence}<span class="subline">${row.note}</span><span class="subline">${row.sources.map(([label, href]) => html`<a href=${href} target="_blank" rel="noreferrer">${label}</a> · `)}</span></td>
      <td>${badge(row.confidence)}<span class="subline">${row.label}</span><span class="subline">Excluded from ranking</span></td>
    </tr>`;
  })}`);
}
