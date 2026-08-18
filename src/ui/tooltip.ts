/**
 * One floating tooltip, appended to <body> and positioned in viewport coordinates
 * so a table's scroll container cannot clip it — the reason the pages used native
 * `title` until now, at the cost of showing nothing but plain text after a delay.
 *
 * Any element carrying `data-tip` becomes a target. Static markup puts its text
 * straight in the attribute; generated markup calls `tip()` and gets back a `#id`
 * into the registry below, so a derivation can carry its own formula, assumption
 * list and source link as real HTML.
 */
import type { Estimate, Rung } from "../lib/provenance";

const SHOW_MS = 90;
const HIDE_MS = 120;
const GAP = 10;
const EDGE = 8;

let bubble: HTMLElement | null = null;
let current: HTMLElement | null = null;
let showTimer = 0;
let hideTimer = 0;
let seq = 0;

function node(): HTMLElement {
  if (bubble) return bubble;
  bubble = document.createElement("div");
  bubble.className = "tip";
  bubble.setAttribute("role", "tooltip");
  bubble.addEventListener("pointerenter", () => window.clearTimeout(hideTimer));
  bubble.addEventListener("pointerleave", () => hide());
  document.body.append(bubble);
  return bubble;
}

function place(target: HTMLElement): void {
  const el = node();
  const anchor = target.getBoundingClientRect();
  const box = el.getBoundingClientRect();

  const above = anchor.top - box.height - GAP;
  const below = anchor.bottom + GAP;
  const flip = above < EDGE && below + box.height < window.innerHeight - EDGE;
  el.classList.toggle("below", flip);

  const wanted = anchor.left + anchor.width / 2 - box.width / 2;
  const left = Math.max(EDGE, Math.min(wanted, window.innerWidth - box.width - EDGE));
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(flip ? below : Math.max(EDGE, above))}px`;
  el.style.setProperty("--arrow-x", `${Math.round(anchor.left + anchor.width / 2 - left)}px`);
}

/**
 * Rich tooltip bodies live here, not in the attribute. Round-tripping HTML through
 * an attribute decodes it once on parse and again on `innerHTML`, which turns an
 * escaped `&lt;script&gt;` back into a live one. Keyed by content, so re-rendering
 * a table reuses ids instead of growing the map.
 */
const bodies = new Map<string, string>();
const ids = new Map<string, string>();

/** Registers a tooltip body and returns its id for a data-tip attribute. */
export function tip(html: string): string {
  let id = ids.get(html);
  if (!id) {
    id = `#t${ids.size}`;
    ids.set(html, id);
    bodies.set(id, html);
  }
  return id;
}

function bodyOf(target: HTMLElement): string {
  const raw = target.dataset.tip ?? "";
  return raw.startsWith("#") ? bodies.get(raw) ?? "" : `<span class="tip-plain">${escape(raw)}</span>`;
}

function show(target: HTMLElement): void {
  const content = bodyOf(target);
  if (!content) return;
  const el = node();
  current = target;
  el.innerHTML = content;
  el.id ||= "tip-live";
  target.setAttribute("aria-describedby", el.id);
  // Measure with the real width before deciding a side, then reveal.
  el.classList.add("measuring");
  place(target);
  el.classList.remove("measuring");
  el.classList.add("on");
}

function hide(): void {
  window.clearTimeout(showTimer);
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    current?.removeAttribute("aria-describedby");
    current = null;
    bubble?.classList.remove("on");
  }, HIDE_MS);
}

function open(target: HTMLElement): void {
  window.clearTimeout(hideTimer);
  window.clearTimeout(showTimer);
  if (current === target) return;
  const mine = ++seq;
  showTimer = window.setTimeout(() => { if (mine === seq) show(target); }, SHOW_MS);
}

const targetOf = (event: Event) =>
  (event.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-tip]") ?? null;

/**
 * The tooltip often lands under the cursor, and its own source link is meant to be
 * clickable — so pointer events raised inside it must not be read as "the pointer
 * left the target", which would dismiss it the instant you reached for the link.
 */
const inside = (node: EventTarget | null) =>
  node instanceof HTMLElement && !!node.closest?.(".tip");

/**
 * Targets are made focusable as they appear, so a keyboard reaches every
 * derivation. Re-rendering a table replaces its nodes, so this watches the
 * document rather than asking every render path to remember to call back.
 */
function makeReachable(root: ParentNode): void {
  if (root instanceof HTMLElement && root.matches("[data-tip]")) {
    if (!root.hasAttribute("tabindex") && !root.matches("a,button,input,select,textarea")) root.tabIndex = 0;
  }
  root.querySelectorAll<HTMLElement>("[data-tip]").forEach(target => {
    if (!target.hasAttribute("tabindex") && !target.matches("a,button,input,select,textarea")) {
      target.tabIndex = 0;
    }
  });
}

export function wireTooltips(): void {
  makeReachable(document);
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "attributes" && record.target instanceof HTMLElement) makeReachable(record.target);
      for (const added of record.addedNodes) {
        if (added instanceof HTMLElement) makeReachable(added);
      }
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-tip"] });

  document.addEventListener("pointerover", event => {
    if (inside(event.target)) return;
    const target = targetOf(event);
    if (target) open(target); else if (current) hide();
  });
  document.addEventListener("pointerout", event => {
    if (inside(event.target)) return;
    const entered = (event as PointerEvent).relatedTarget;
    if (!inside(entered) && !(entered as HTMLElement | null)?.closest?.("[data-tip]")) hide();
  });
  document.addEventListener("pointerdown", event => {
    if (!inside(event.target) && !targetOf(event)) hide();
  });
  document.addEventListener("focusin", event => {
    const target = targetOf(event);
    if (target) { window.clearTimeout(hideTimer); show(target); } else hide();
  });
  document.addEventListener("focusout", () => hide());
  document.addEventListener("keydown", event => { if (event.key === "Escape") hide(); });
  // Follow the anchor rather than dismissing: hiding here would also cancel a
  // tooltip that is still only pending, which the page's smooth scrolling makes
  // routine — scroll, land, hover, and nothing would ever appear.
  window.addEventListener("scroll", reposition, true);
  window.addEventListener("resize", reposition);
}

function reposition(): void {
  if (!current) return;
  const anchor = current.getBoundingClientRect();
  if (anchor.bottom < 0 || anchor.top > window.innerHeight) hide();
  else place(current);
}

const escape = (text: string) =>
  text.replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]!));

const href = (source: string) => (/^https?:\/\//.test(source) ? source : `https://${source}`);

/** A tooltip carrying nothing but a title and the one line that explains it. */
export function plainTip(title: string, formula: string): string {
  return `<strong class="tip-title">${escape(title)}</strong>`
    + `<code class="tip-formula">${escape(formula)}</code>`;
}

/** Why a row shows a sibling model's index and not the granted model's own. */
export function siblingTip(plan: string, model: string): string {
  return plainTip("Sibling model", `${plan} grants a model this snapshot has not scored`)
    + `<ul class="tip-list">`
    + `<li>the index shown is ${escape(model)}, the nearest scored model of the same family</li>`
    + `<li>treat it as the family's shape, never as the granted model's own score</li></ul>`
    + `<span class="tip-foot"><span class="rung modelled">modelled</span></span>`;
}

/** The five things a derived cell owes the reader, for a figure that is not an `Estimate`. */
export interface TipFacts {
  formula: string;
  assumptions: string[];
  rung: Rung;
  source: string;
  verified: string;
}

/**
 * The five things a derived cell owes the reader — formula, assumptions, source,
 * date, rung. Kept in one place so no cell can quietly show four of them.
 */
export function factTip(title: string, facts: TipFacts): string {
  return plainTip(title, facts.formula)
    + (facts.assumptions.length
      ? `<ul class="tip-list">${facts.assumptions.map(line => `<li>${escape(line)}</li>`).join("")}</ul>`
      : "")
    + `<span class="tip-foot">`
    + `<span class="rung ${facts.rung}">${facts.rung}</span>`
    + (facts.source === "secondary"
      ? `<span>third-party trackers</span>`
      : `<a href="${escape(href(facts.source))}" target="_blank" rel="noreferrer">${escape(facts.source)}</a>`)
    + `<span>read ${escape(facts.verified)}</span>`
    + `</span>`;
}

export const estimateTip = (title: string, estimate: Estimate, extra: string[] = []): string =>
  factTip(title, { ...estimate, assumptions: [...estimate.assumptions, ...extra] });
