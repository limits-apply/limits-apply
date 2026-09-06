/** The disclosure staircase — four stricter questions about the same plans. */
import { html } from "lit-html";

import { DISCLOSURE } from "../data/derived/disclosure";
import { el, mount } from "./dom";

export function renderStaircase(id = "staircase"): void {
  const { total } = DISCLOSURE;
  mount(el(id), html`${([
    ["Publishes a price", DISCLOSURE.priced, "in USD, on a page you can read today"],
    ["Attaches a number", DISCLOSURE.quantified, "any figure at all bound to the allowance"],
    ["In a convertible unit", DISCLOSURE.convertible, "dollars, or a countable rate of messages or requests"],
    ["Measured by anyone", DISCLOSURE.observed, "a published trace of work completed before the limit bit"],
  ] as const).map(([label, value, detail], index) => html`
    <div class="step ${value === 0 ? "off" : index === 2 ? "on" : ""}">
      <span class="k">${label}</span>
      <span class="v">${value}<span class="of"> / ${total}</span></span>
      <span class="d">${detail}</span>
    </div>`)}`);
}
