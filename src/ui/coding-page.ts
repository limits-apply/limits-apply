import { html, nothing, type TemplateResult } from "lit-html";

import { CODING_CHECKED_ON, CODING_SETUPS, type CodingSetup } from "../data/coding";
import {
  QUOTA_WINDOWS,
  WINDOW_LABEL,
  type QuotaPolicy,
  type QuotaWindowName,
  type Workload,
  simulateQuota,
} from "../lib/quota";
import { sourceLink } from "./cells";
import { el, mount } from "./dom";

const BURST = { tasks: 8, withinHours: 5 };
const MONTH_DAYS = 30;

interface View {
  id: string;
  tasksPerDay: number;
  costPerTaskUsd: number;
  burst: boolean;
}

const view: View = {
  id: CODING_SETUPS[0].id,
  tasksPerDay: 4,
  costPerTaskUsd: 0.4,
  burst: false,
};

export function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "unknown";
  return "$" + n.toLocaleString("en-US", {
    minimumFractionDigits: n < 10 && !Number.isInteger(n) ? 2 : 0,
    maximumFractionDigits: n < 10 ? 2 : 0,
  });
}

/** A missing cap is a word. Zero is only ever a figure a provider actually published. */
export function formatCap(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "unknown" : formatUsd(n);
}

export function formatCapacity(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "unknown";
  return `${Math.round(n).toLocaleString("en-US")} tasks`;
}

export function windowCap(
  policy: QuotaPolicy | null | undefined,
  name: QuotaWindowName,
): number | null {
  const found = policy?.windows.find(window => window.window === name);
  return found && Number.isFinite(found.amount) ? found.amount : null;
}

/** Unclamped, so the page can mark an overflow rather than hide it. */
export function barPercent(used: number, cap: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(cap) || cap <= 0) return 0;
  return Math.max(0, (used / cap) * 100);
}

function currentWorkload(): Workload {
  return {
    tasksPerDay: view.tasksPerDay,
    costPerTaskUsd: view.costPerTaskUsd,
    ...(view.burst ? { burst: BURST } : {}),
  };
}

function selected(): CodingSetup {
  return CODING_SETUPS.find(setup => setup.id === view.id) ?? CODING_SETUPS[0];
}

const host = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

const tasksPerDay = (n: number): string => `${n} task${n === 1 ? "" : "s"}/day`;

function capCell(policy: QuotaPolicy | null, name: QuotaWindowName): TemplateResult {
  const cap = windowCap(policy, name);
  return cap == null
    ? html`<td class="num cg-unknown" data-num>unknown<span class="basis">not published</span></td>`
    : html`<td class="num" data-num>${formatUsd(cap)}</td>`;
}

function controlsTemplate(): TemplateResult {
  return html`
    <div class="cg-controls">
      <label class="cg-field cg-setup-field">
        <span class="cg-label">Setup</span>
        <select id="coding-setup">
          ${CODING_SETUPS.map(setup => html`
            <option value=${setup.id} ?selected=${setup.id === view.id}>
              ${setup.plan} · ${setup.model}
            </option>`)}
        </select>
      </label>
      <label class="cg-field">
        <span class="cg-label">Cadence <output id="coding-cadence-out">${view.tasksPerDay}</output>
          <span id="coding-cadence-unit">${view.tasksPerDay === 1 ? "task" : "tasks"}</span>/day</span>
        <input id="coding-cadence" type="range" min="1" max="40" step="1" value=${view.tasksPerDay}>
      </label>
      <label class="cg-field">
        <span class="cg-label">Cost per task</span>
        <span class="cg-money">
          <span aria-hidden="true">$</span>
          <input id="coding-cost" type="number" min="0.01" max="500" step="0.05"
                 value=${view.costPerTaskUsd.toFixed(2)} inputmode="decimal">
        </span>
      </label>
      <label class="cg-toggle">
        <input id="coding-burst" type="checkbox" ?checked=${view.burst}>
        <span>Burst: ${BURST.tasks} tasks inside ${BURST.withinHours} h</span>
      </label>
    </div>`;
}

function summaryTemplate(setup: CodingSetup): TemplateResult {
  const workload = currentWorkload();
  const simulation = simulateQuota(setup.policy, workload, MONTH_DAYS);
  const bindingCap = simulation.bindingWindow === "unknown"
    ? null
    : windowCap(setup.policy, simulation.bindingWindow);
  const monthlyCap = windowCap(setup.policy, "month");
  const reached = monthlyCap != null && simulation.monthlyUsd >= monthlyCap;
  const binding = simulation.bindingWindow === "unknown"
    ? "unknown"
    : WINDOW_LABEL[simulation.bindingWindow];

  return html`
    <div class="cg-tiles">
      <div class="cg-tile ${bindingCap == null ? "cg-unknown" : ""}">
        <span class="kicker">Binding window</span>
        <strong class="cg-figure">${binding}</strong>
        <span class="basis">${bindingCap == null ? "no published dollar cap" : `${formatCap(bindingCap)} cap`}</span>
      </div>
      <div class="cg-tile ${monthlyCap == null ? "cg-unknown" : ""}">
        <span class="kicker">Month</span>
        <strong class="cg-figure">${formatUsd(simulation.monthlyUsd)}</strong>
        <span class="basis">${monthlyCap == null
          ? "cap not published — unknown, not unlimited"
          : `of ${formatCap(monthlyCap)} · ${reached ? "cap reached" : "cap not reached"}`}</span>
      </div>
      <div class="cg-tile ${simulation.capacityTasks == null ? "cg-unknown" : ""}">
        <span class="kicker">Theoretical ceiling</span>
        <strong class="cg-figure">${formatCapacity(simulation.capacityTasks)}</strong>
        <span class="basis">at ${tasksPerDay(workload.tasksPerDay)} and ${formatUsd(workload.costPerTaskUsd)}/task</span>
      </div>
    </div>
    <p class="cg-ceiling"><strong>Theoretical ceiling — not tasks delivered.</strong>
      It assumes every task costs the stated amount and every window is spent at the same pace;
      no Layer 2 run exists for this setup${simulation.truncatedBy
        ? `, and the ${WINDOW_LABEL[simulation.truncatedBy]} window truncates this cadence`
        : ""}.</p>`;
}

function rowsTemplate(): TemplateResult {
  return html`
    <div class="tw cg-table-wrap">
      <table class="cg-table">
        <thead>
          <tr>
            <th>Setup</th>
            <th class="num">Price</th>
            <th>Model</th>
            <th class="num">5 h</th>
            <th class="num">7 d</th>
            <th class="num">Month</th>
            <th>Source</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody id="coding-rows-body">
          ${CODING_SETUPS.map(setup => html`
            <tr data-id=${setup.id} class=${setup.id === view.id ? "on" : ""}>
              <td>
                <strong>${setup.plan}</strong>
                <span class="subline">${setup.harness}</span>
              </td>
              <td class="num" data-num>${setup.priceUsd === 0
                ? html`$0<span class="basis">metered, no subscription</span>`
                : html`${formatUsd(setup.priceUsd)}<span class="basis">per month</span>`}</td>
              <td><strong>${setup.model}</strong><span class="subline">${setup.provider}</span></td>
              ${capCell(setup.policy, "5h")}
              ${capCell(setup.policy, "7d")}
              ${capCell(setup.policy, "month")}
              <td>
                ${sourceLink(setup.source.url, setup.source.title)}
                <span class="basis">${host(setup.source.url)}<br>checked ${setup.source.checkedAt}</span>
              </td>
              <td><span class="cg-conf ${setup.confidence}">${setup.confidence}</span></td>
            </tr>`)}
        </tbody>
      </table>
    </div>
    <p class="note cg-checked">Every row was checked on or before ${CODING_CHECKED_ON}. A cap is per
      plan × model: nothing here adds one model's cap to another's, or one plan's to another's.</p>`;
}

function resetCopy(policy: QuotaPolicy): string {
  const unknown = policy.windows
    .filter(window => window.kind === "unknown")
    .map(window => WINDOW_LABEL[window.window]);
  if (unknown.length > 0) {
    const list = unknown.length > 1
      ? `${unknown.slice(0, -1).join(", ")} and ${unknown[unknown.length - 1]}`
      : unknown[0];
    return `Reset semantics are unknown for the ${list} window${unknown.length > 1 ? "s" : ""} —`
      + " the provider does not state whether it rolls, resets on a fixed boundary or is anchored"
      + " to first use. The simulator carries that word through and does not assume a reset.";
  }
  return `Reset semantics as published: ${policy.windows
    .map(window => `${WINDOW_LABEL[window.window]} ${window.kind}`)
    .join(" · ")}.`;
}

function simTemplate(setup: CodingSetup): TemplateResult {
  const policy = setup.policy;
  if (!policy) {
    return html`
      <div class="cg-sim-unknown">
        <strong>Capacity unknown.</strong>
        <p>No dollar-equivalent quota is published for this setup. It is unknown, not unlimited —
          the table above prints the word rather than 0 or ∞, and no task count can be derived.</p>
      </div>
      <p class="note">${resetCopyFallback()}</p>`;
  }

  const workload = currentWorkload();
  const simulation = simulateQuota(policy, workload, MONTH_DAYS);
  return html`
    <div class="cg-sim-head">
      <strong>${setup.plan} · ${setup.model}</strong>
      <span class="basis">${formatUsd(setup.priceUsd)}/month · ${tasksPerDay(workload.tasksPerDay)}
        at ${formatUsd(workload.costPerTaskUsd)}/task${view.burst ? ` · burst ${BURST.tasks}/${BURST.withinHours} h` : ""}</span>
    </div>
    <div class="cg-bars">
      ${QUOTA_WINDOWS.map(name => {
        const entry = simulation.perWindow.find(window => window.window === name);
        if (!entry) {
          return html`
            <div class="cg-bar-row cg-unknown">
              <span class="cg-bar-label">${WINDOW_LABEL[name]}</span>
              <div class="cg-bar-track"><span class="cg-bar-fill"></span></div>
              <span class="cg-bar-figure">unknown</span>
            </div>`;
        }
        const share = barPercent(entry.usedUsd, entry.capUsd);
        return html`
          <div class="cg-bar-row ${entry.binding ? "binding" : ""}">
            <span class="cg-bar-label">${WINDOW_LABEL[name]}${entry.binding ? html`<em>binding</em>` : nothing}</span>
            <div class="cg-bar-track" role="img"
                 aria-label=${`${WINDOW_LABEL[name]}: ${formatUsd(entry.usedUsd)} used of ${formatUsd(entry.capUsd)}`}>
              <span class="cg-bar-fill ${share > 100 ? "over" : ""}"
                    style=${`width:${Math.min(100, share)}%`}></span>
            </div>
            <span class="cg-bar-figure">${formatUsd(entry.usedUsd)}
              <span class="of">of ${formatUsd(entry.capUsd)}</span></span>
          </div>`;
      })}
    </div>
    <p class="note cg-reset">${resetCopy(policy)}</p>
    ${view.burst ? html`
      <p class="note cg-burst">The burst puts ${formatUsd(BURST.tasks * workload.costPerTaskUsd)} into
        one 5-hour window, and that amount also lands in the weekly and monthly windows. The 5-hour
        cap is checked on its own, so a month with room can still block the burst.</p>` : nothing}
    ${simulation.truncatedBy ? html`
      <p class="note cg-truncated">This cadence exceeds the
        ${WINDOW_LABEL[simulation.truncatedBy]} cap, so it is the one that truncates the workload.</p>` : nothing}
    <ul class="cg-notes">
      ${simulation.notes
        .filter(note => !note.startsWith("Reset semantics"))
        .map(note => html`<li>${note}</li>`)}
    </ul>`;
}

function resetCopyFallback(): string {
  return "No quota window is published, so reset semantics are unknown as well. Nothing here is a"
    + " delivery promise: no Layer 2 result exists.";
}

function noteTemplate(): TemplateResult {
  return html`
    <strong>Three limits, stated plainly.</strong> Vendor-valued dollars are not refundable credit:
    a cap is usage the vendor prices at that amount, not cash you can withdraw. A monthly cap does
    not mean it is reachable — the 5-hour, weekly and monthly windows apply at the same time, and a
    burst can bind before the month does. No first-party Layer 2 run exists for these setups, so
    every capacity on this page is a theoretical ceiling, never a count of tasks delivered.`;
}

export function renderCodingPage(): void {
  mount(el("coding-controls"), controlsTemplate());

  const select = el("coding-setup") as HTMLSelectElement;
  const cadence = el("coding-cadence") as HTMLInputElement;
  const cadenceOut = el("coding-cadence-out") as HTMLOutputElement;
  const cadenceUnit = el("coding-cadence-unit");
  const cost = el("coding-cost") as HTMLInputElement;
  const burst = el("coding-burst") as HTMLInputElement;

  const drawRows = (): void => {
    mount(el("coding-rows"), rowsTemplate());
  };
  const drawLive = (): void => {
    mount(el("coding-summary"), summaryTemplate(selected()));
    mount(el("coding-sim"), simTemplate(selected()));
    mount(el("coding-note"), noteTemplate());
  };
  const drawAll = (): void => {
    drawRows();
    drawLive();
  };

  select.addEventListener("change", () => {
    view.id = select.value;
    drawAll();
  });

  cadence.addEventListener("input", () => {
    view.tasksPerDay = Math.max(1, Math.min(40, Number(cadence.value) || 1));
    cadenceOut.textContent = String(view.tasksPerDay);
    cadenceUnit.textContent = view.tasksPerDay === 1 ? "task" : "tasks";
    drawLive();
  });

  cost.addEventListener("input", () => {
    const value = Number(cost.value);
    view.costPerTaskUsd = Number.isFinite(value) && value > 0 ? value : 0.01;
    drawLive();
  });

  burst.addEventListener("change", () => {
    view.burst = burst.checked;
    drawLive();
  });

  el("coding-rows").addEventListener("click", event => {
    const row = (event.target as HTMLElement | null)?.closest<HTMLTableRowElement>("tr[data-id]");
    if (!row?.dataset.id) return;
    view.id = row.dataset.id;
    select.value = view.id;
    drawAll();
  });

  drawAll();
}
