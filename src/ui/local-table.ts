/**
 * 02 — the joined table. Speed against intelligence, which is the join no tool on
 * the web makes: speed tables and intelligence tables both exist, separately.
 *
 * A model that exceeds the memory budget stays visible and marked. Dropping it
 * would answer a question the reader did not ask — the same rule as `UNMAPPED_PLANS`.
 */
import { html, nothing, type TemplateResult } from "lit-html";

import { BEST_AA } from "../data/aa";
import { LOCAL_FIT, localRows, type LocalRow } from "../data/derived/local-estimates";
import { BEST_LOCAL_AA, LOCAL_AA_SNAPSHOT, LOCAL_MODELS } from "../data/local-models";
import { RELEASE_SNAPSHOT, type Release, releaseFor } from "../data/local-releases";
import { MEASUREMENTS } from "../data/local-measurements";
import { chipFor, chipLabel } from "../data/silicon";
import { TASK } from "../data/task";
import type { Estimate } from "../lib/provenance";
import {
  type FitLevel, KV_ALLOWANCE, QUANTS, USABLE_SHARE, tasksPerHour, weightedScore,
} from "../lib/throughput";
import { icon, rungTag, sourceLink } from "./cells";
import { el, mount } from "./dom";
import { gb, tokensPerSecond } from "./format";
import type { Machine } from "./silicon-picker";
import { factTip, estimateTip, tip } from "./tooltip";
import { sortable } from "./table-sort";


const REDUCED = matchMedia("(prefers-reduced-motion:reduce)").matches;

const FIT_MARK: Record<FitLevel, TemplateResult> = {
  full: html`<span class="sq yes signal"></span>`,
  half: html`<span class="sq half"></span>`,
  over: html`<span class="sq"></span>`,
};
const FIT_SORT: Record<FitLevel, number> = { full: 2, half: 1, over: 0 };
const FIT_BASIS: Record<FitLevel, string> = { full: "fits", half: "half-fits", over: "over" };

/**
 * What the reader is buying, as one factor on the score. Planning wants the
 * strongest model the machine holds and does not care how long it takes; building
 * wants an answer back while you are still looking at the screen, which on a local
 * machine is a real trade and not a preference for its own sake. Build is the
 * default because this is the throughput page.
 */
const view = { factor: 0.5 };
/** The machine the table is currently showing, so the factor can re-render it alone. */
let shown: Machine | null = null;

type ScoredRow = LocalRow & { score: ReturnType<typeof weightedScore> };

const bySort = sortable<ScoredRow>("local-rows", [
  row => row.model.name,
  row => row.model.intelligence,
  row => {
    const release = releaseFor(row.model);
    return release ? Number(release.on.replace(/-/g, "")) : NaN;
  },
  row => row.model.params,
  row => row.footprint,
  row => row.speed.value,
  row => tasksPerHour(row.speed, TASK.outTok).value,
  row => row.score.band.value,
  row => FIT_SORT[row.fit],
], () => { if (shown) renderLocalTable(shown); }, { col: 7, dir: -1 });

/** A catalogue publishing the date is first-hand; a weights upload standing in for it is not. */
const RELEASE_RUNG = { catalogue: "observed", weights: "derived" } as const;

function releaseCell(name: string, release: Release | null) {
  if (!release) {
    return html`<td class="num">—<span class="basis">no catalogue carries a date</span></td>`;
  }
  const rung = RELEASE_RUNG[release.via];
  const catalogue = release.via === "catalogue";
  const source = catalogue ? RELEASE_SNAPSHOT.source : RELEASE_SNAPSHOT.fallback;
  const body = factTip(`Released — ${name}`, {
    formula: `${release.on} · ${catalogue
      ? `${release.agree[0]} of ${release.agree[1]} listings agree`
      : "the date its weights repository was created"}`,
    assumptions: catalogue
      ? ["models.dev carries a release date per listing; this is the date most of them agree on",
        "a release date belongs to the weights file, so both reasoning modes of a model carry the same one"]
      : ["no catalogue publishes a date for this model, so the creation of its weights repository stands in",
        "weights go up before the announcement as often as after — a proxy, one rung weaker, and never"
        + " presented as the release itself"],
    rung,
    source: new URL(source).hostname,
    verified: RELEASE_SNAPSHOT.verified,
  });

  return html`<td class="num" data-tip=${tip(body)}>
      ${release.on} ${rungTag(rung)}
      <span class="basis">${catalogue
        ? `${new URL(RELEASE_SNAPSHOT.source).hostname} · ${release.agree[0]} of ${release.agree[1]}`
        : "weights upload"}</span></td>`;
}

function countUp(node: HTMLElement, to: number): void {
  if (REDUCED) { node.textContent = tokensPerSecond(to); return; }
  const start = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - start) / 700);
    node.textContent = tokensPerSecond(to * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * The headline says what this machine does, and the line under it says on which
 * model, at which memory, on which rung. A machine the browser could not name is
 * "your Mac" — the fallback chip is never asserted as the reader's.
 */
export function renderLocalHero(machine: Machine): void {
  const chip = chipFor(machine.chip);
  const quant = QUANTS[machine.quant];
  const rows = localRows(machine.chip, machine.quant, machine.ram, LOCAL_MODELS);
  const top = rows.find(row => row.fit === "full") ?? rows.find(row => row.fit === "half");

  mount(el("hero-chip"), html`<span class="detect">${machine.known ? chip.name : "Mac"}</span>`);
  countUp(el("hero-rate"), top?.speed.value ?? 0);

  const machineLine = machine.known
    ? html`<strong>${chipLabel(chip)}</strong> · ${chip.bandwidth.value} GB/s · ${machine.ram} GB`
    : html`Nothing detected — your browser names no Mac, which is what Safari says on every one of
       them. Showing <strong>${chipLabel(chip)}</strong> · ${machine.ram} GB; correct it below.`;
  mount(el("hero-detect"), html`${machineLine} ${top
    ? html`Fastest model that ${FIT_BASIS[top.fit]}: <strong>${top.model.name}</strong> at ${quant.label},
       ${rungTag(top.speed.rung)}
       — band ${tokensPerSecond(top.speed.low)}–${tokensPerSecond(top.speed.high)} tok/s.${top.fit === "half"
    ? ` Nothing in this tier stays under half of ${machine.ram} GB, so that one loads only
        with the rest of the machine idle.`
    : nothing}`
     : `No model in this tier fits ${machine.ram} GB at ${quant.label}.`}`);
}

export function renderLocalTable(machine: Machine): void {
  const chip = chipFor(machine.chip);
  const rows = localRows(machine.chip, machine.quant, machine.ram, LOCAL_MODELS);
  const quant = QUANTS[machine.quant];
  shown = machine;

  // Both axes are normalised by the best row on this table, so the score ranks the
  // tier on this machine and nothing beyond it.
  const ceiling = {
    intelligence: Math.max(...rows.map(row => row.model.intelligence)),
    tokensPerSecond: Math.max(...rows.map(row => row.speed.value)),
  };

  const scored: ScoredRow[] = rows
    .map(row => ({
      ...row,
      score: weightedScore(row.model.intelligence, row.speed, view.factor, ceiling),
    }))
    // Speed breaks the tie the index leaves at factor 0, where two models score alike.
    .sort((a, b) => b.score.band.value - a.score.band.value || b.speed.value - a.speed.value);

  mount(el("local-rows"), html`${bySort(scored).map(({ model, footprint, speed, fit, score }) => {
    const hourly = tasksPerHour(speed, TASK.outTok);
    const release = releaseFor(model);
    const scoreEstimate: Estimate = {
      ...score.band,
      rung: speed.rung,
      formula: score.formula,
      assumptions: [
        ...score.assumptions,
        `the index is Artificial Analysis v${LOCAL_AA_SNAPSHOT.version}, the throughput is ${speed.rung}`
        + " — the score is never stronger than the weaker of the two",
      ],
      source: speed.source,
      verified: speed.verified,
    };
    return html`
    <tr class="rung-${speed.rung}${fit === "over" ? " over-budget" : ""}">
      <td class="model-cell"><strong>${release ? icon(release.maker) : nothing}${model.name}</strong>
        <span class="subline">${release?.maker ?? "maker unresolved"} · ${
          model.variant || "single mode"} · ${
          model.active == null ? "dense" : `${model.active}B active of ${model.params}B`}</span></td>
      <td class="num"><span class="aa-link">${model.intelligence}</span></td>
      ${releaseCell(model.name, release)}
      <td class="num">${model.params}B</td>
      <td class="num">${gb(footprint)}
        <span class="basis">${FIT_BASIS[fit]} ${machine.ram} GB</span></td>
      <td class="num" data-tip=${tip(estimateTip(`${model.name} on ${chipLabel(chip)} · ${quant.label}`, speed))}>
         ${tokensPerSecond(speed.value)} ${rungTag(speed.rung)}
         <span class="basis band">${tokensPerSecond(speed.low)} – ${tokensPerSecond(speed.high)} tok/s</span></td>
       <td class="num">${tokensPerSecond(hourly.value)}
         <span class="basis band">${tokensPerSecond(hourly.low)} – ${tokensPerSecond(hourly.high)}</span></td>
      <td class="num yield" data-tip=${tip(
        estimateTip(`Score at factor ${view.factor.toFixed(2)} — ${model.name}`, scoreEstimate))}>
         ${tokensPerSecond(score.band.value)}
         <span class="basis band">${tokensPerSecond(score.band.low)} – ${tokensPerSecond(score.band.high)}</span></td>
      <td class="disc">${FIT_MARK[fit]}</td>
    </tr>`;
  })}`);

  el("local-caption").textContent =
    `${chipLabel(chip)} · ${machine.ram} GB · ${quant.label}`;

  const full = rows.filter(row => row.fit === "full");
  const half = rows.filter(row => row.fit === "half").length;
  mount(el("local-summary"), html`
    <div><span>Memory bandwidth</span><strong>${chip.bandwidth.value} GB/s</strong>
      <span class="basis">${chipLabel(chip)}</span></div>
    <div><span>Models this machine holds</span><strong>${full.length} of ${rows.length}</strong>
      <span class="basis">${half} more half-fit · at ${quant.label}, weights × ${KV_ALLOWANCE}
        for KV cache, under ${USABLE_SHARE * 100} % of ${machine.ram} GB</span></div>
    <div><span>Best index it can hold</span><strong>${
      Math.max(0, ...full.map(row => row.model.intelligence))}</strong>
       <span class="basis">of ${BEST_LOCAL_AA} in the whole tier</span></div>`);
}

/**
 * The factor, as two presets and the slider between them. The presets are the two
 * questions people actually arrive with; the slider is there because the answer
 * between them is nobody's to fix.
 */
export function wireWeighting(): void {
  const slider = el("weight-factor") as HTMLInputElement;
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("#weight-controls button")];

  const apply = (factor: number): void => {
    view.factor = factor;
    slider.value = String(factor);
    el("weight-readout").textContent = factor.toFixed(2);
    buttons.forEach(button =>
      button.setAttribute("aria-pressed", String(Number(button.dataset.value) === factor)));
    if (shown) renderLocalTable(shown);
  };

  slider.addEventListener("input", () => apply(Number(slider.value)));
  buttons.forEach(button =>
    button.addEventListener("click", () => apply(Number(button.dataset.value))));
  apply(view.factor);
}

/** Written once — none of it depends on the machine the reader picked. */
export function renderLocalNotes(): void {
  mount(el("fit-note"), html`
    <strong>Both constants are fitted, not asserted.</strong>
    A dense model reaches <strong>${(LOCAL_FIT.dense.value * 100).toFixed(0)} %</strong> of its
    bandwidth ceiling — band ${(LOCAL_FIT.dense.low * 100).toFixed(0)}–${(LOCAL_FIT.dense.high * 100).toFixed(0)} %,
    fitted on ${LOCAL_FIT.denseN} published runs${LOCAL_FIT.denseThin ? " (thin sample — band widened)" : ""}.
    A mixture-of-experts returns <strong>×${LOCAL_FIT.moe.value.toFixed(2)}</strong> of what its active
    weights alone promise — band ×${LOCAL_FIT.moe.low.toFixed(2)}–×${LOCAL_FIT.moe.high.toFixed(2)},
    fitted on ${LOCAL_FIT.moeN} runs${LOCAL_FIT.moeThin ? " (thin sample — band widened)" : ""}.
    Change the measurements and both numbers move; that is the point of fitting them.
    Sources: ${[...new Set(MEASUREMENTS.map(one => one.source))]
      .map((source, index) => html`${index ? " · " : nothing}${sourceLink(source, new URL(source).hostname)}`)}.`);

  mount(el("ceiling-note"), html`
    The best open-weights model in the ${LOCAL_AA_SNAPSHOT.tier} tier scores
    <strong>${BEST_LOCAL_AA}</strong> on the Artificial Analysis Intelligence Index.
    The strongest configuration any subscription on the
    <a href="./index.html#benchmark">ledger</a> grants scores
    <strong>${BEST_AA.toFixed(1)}</strong>. Same index, same version — v${LOCAL_AA_SNAPSHOT.version}.
    Above 40B the open-weights catalogue jumps to 400B+ total parameters, which no portable Mac
    loads at any quantisation. There is no middle rung, and that gap is the trade: local removes
    the quota and caps the intelligence.`);

  mount(el("task-note"), html`
    <strong>Tasks / hour = tok/s × 3,600 ÷ ${TASK.outTok.toLocaleString("en-US")} output tokens</strong>
    — the same modelled task the ledger uses, so the two pages count in one unit.
    It is a <em>rate</em>. It is never multiplied by a duty cycle to make a monthly figure:
    nobody has measured how many hours a day this machine actually runs, and inventing that
    number would turn a Layer 1 rate into a Layer 2 capacity claim.`);
}
