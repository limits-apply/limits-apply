import { html, nothing } from "lit-html";

import { HARNESSES, VERIFIED_DEF, type Harness } from "../data/harnesses";
import { icon } from "./cells";
import { el, mount } from "./dom";

const copy = (text: string) => (event: Event) => {
  const button = event.currentTarget as HTMLButtonElement;
  navigator.clipboard.writeText(text).then(() => {
    button.textContent = "Copied";
    setTimeout(() => { button.textContent = "Copy"; }, 1200);
  });
};

const statusTag = (status: Harness["status"]) =>
  status === "verified" ? html`<span class="hstatus verified">${VERIFIED_DEF.label}</span>` : nothing;

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
      ? html`<details class="hsnip">
          <summary>Configuration</summary>
          <div class="hsnip-body">
            <button class="hcopy" type="button" @click=${copy(harness.snippet)}>Copy</button>
            <pre><code class="lang-${harness.lang ?? "json"}">${harness.snippet}</code></pre>
          </div>
        </details>`
      : nothing}
    ${(harness.date || harness.configPath) ? html`
    <dl class="fields">
      ${harness.date ? html`<dt>Run on</dt><dd>${harness.date}</dd>` : nothing}
      ${harness.configPath ? html`<dt>Where the tool keeps its config</dt><dd><code>${harness.configPath}</code></dd>` : nothing}
    </dl>` : nothing}
    <p class="note"><a href=${harness.site} target="_blank" rel="noopener">${harness.name} ↗</a></p>
  </div>`;
}

export function renderHarnesses(): void {
  mount(el("harness-cards"), html`${HARNESSES.filter(h => h.snippet !== null).map(card)}`);
  mount(el("harness-planned"), html`${HARNESSES.filter(h => h.snippet === null).map(card)}`);
}
