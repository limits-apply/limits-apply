import { html, nothing } from "lit-html";

import { HARNESSES, STATUS_DEFS, type Harness } from "../data/harnesses";
import { icon } from "./cells";
import { el, mount } from "./dom";

const statusTag = (status: Harness["status"]) =>
  html`<span class="hstatus ${status}">${STATUS_DEFS[status].label}</span>`;

function card(harness: Harness) {
  return html`
  <div class="hcard" id="harness-${harness.id}">
    <div class="hcard-head">
      ${harness.icon ? icon(harness.icon, harness.name) : nothing}
      <h3>${harness.name}</h3>
      ${statusTag(harness.status)}
    </div>
    <p>${harness.summary}</p>
    ${harness.snippet
      ? html`<pre><code class="lang-json">${harness.snippet}</code></pre>`
      : html`<p class="note">No snippet yet — see the <a href="./index.html#roadmap">roadmap</a>.</p>`}
    ${(harness.date || harness.configPath) ? html`
    <dl class="fields">
      ${harness.date ? html`<dt>Run on</dt><dd>${harness.date}</dd>` : nothing}
      ${harness.configPath ? html`<dt>Config path</dt><dd><code>${harness.configPath}</code></dd>` : nothing}
    </dl>` : nothing}
    <p class="note"><a href=${harness.site} target="_blank" rel="noopener">${harness.name} ↗</a></p>
  </div>`;
}

export function renderHarnesses(): void {
  mount(el("harness-cards"), html`${HARNESSES.map(card)}`);
}
