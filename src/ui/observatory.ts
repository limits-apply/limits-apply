/**
 * The Historical Quota Observatory. Every figure it prints comes from one
 * aggregated store, and a figure the sample cannot support is replaced by the
 * words for it — "single report — not an estimate", "insufficient data" —
 * never by a number borrowed from somewhere else.
 */
import { html, type TemplateResult } from "lit-html";

import type {
  Band, ChangeVerdict, EvidenceStatus, GroupAggregate, Observatory, SeriesPoint,
} from "@limits-apply/intelligence";
import { el, mount, svg } from "./dom";

const decimal = (n: number, digits: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const usd = (n: number) => `$${decimal(n, 2)}`;
const percent = (share: number) => `${decimal(share * 100, 1)}%`;
const dateOf = (iso: string) => iso.slice(0, 10);
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

const STATUS: Record<EvidenceStatus, { badge: string; note: string }> = {
  "single-report": {
    badge: "estimated",
    note: "single report — not an estimate: fewer than five admissible intervals",
  },
  preliminary: {
    badge: "medium",
    note: "five intervals or more, from fewer than three reporters",
  },
  series: {
    badge: "high",
    note: "one reporter across more than one window type",
  },
  community: {
    badge: "high",
    note: "three or more distinct reporters",
  },
};

/** The spread never claims more than the sample: one widened ×2, min…max ×2, then the IQR. */
const spreadCopy = (n: number) => n >= 4
  ? "median, interquartile band"
  : n > 1 ? "median, min…max widened ×2" : "one interval widened ×2 either side";

const observedRange = (group: GroupAggregate) => group.firstObservedAt && group.lastObservedAt
  ? `${dateOf(group.firstObservedAt)} to ${dateOf(group.lastObservedAt)}`
  : "no admissible interval";

function verdictCell(change: ChangeVerdict | null): TemplateResult {
  if (!change)
    return html`<strong>insufficient data</strong>
      <span class="subline">fewer than four intervals carry an API-equivalent price</span>`;
  const threshold = `${(change.threshold * 100).toFixed(0)}% threshold`;
  const samples = `${plural(change.baselineSamples, "baseline sample")} vs `
    + `${plural(change.currentSamples, "current sample")}`;
  if (change.change == null) {
    const enough = change.baselineSamples >= 2 && change.currentSamples >= 2;
    return html`<strong>insufficient data</strong>
      <span class="subline">${enough
        ? "the baseline period carries no positive figure to compare against"
        : `${samples} — two of each are needed`}</span>`;
  }
  const shift = `${change.change > 0 ? "+" : ""}${percent(change.change)}`;
  if (change.state === "probable")
    return html`<strong>probable change</strong>
      <span class="subline">${shift} between the halves, above the ${threshold}, on ${samples}</span>`;
  return html`<strong>inconclusive</strong>
    <span class="subline">${shift} between the halves — below the ${threshold}, or not persistent
      on both sides (${samples})</span>`;
}

/** Like `bandLine` in cells.ts: a figure that needs no band reads as one number. */
function bandCell(b: Band | null, show: (n: number) => string, unit: string, absent: string, spread: string): TemplateResult {
  if (!b) return html`<span class="empty">—</span><span class="subline">${absent}</span>`;
  const figure = b.high - b.low < 1e-9
    ? show(b.value)
    : `${show(b.low)} – ${show(b.high)}`;
  return html`<strong>${figure}</strong><span class="subline">${unit} · ${spread}</span>`;
}

function summaryPanel(group: GroupAggregate): TemplateResult {
  const status = STATUS[group.status];
  const priced = group.series.filter(p => p.apiUsdPerPoint != null).length;
  const cached = group.series.filter(p => p.cacheShare != null).length;
  return html`<dl class="fields">
    <dt>Plan</dt>
    <dd><strong>${group.plan}</strong><span class="subline">${group.key.subscriptionId}</span></dd>
    <dt>Model</dt>
    <dd><strong>${group.key.modelId}</strong><span class="subline">${group.key.harness} · ${group.key.provider}</span></dd>
    <dt>Window</dt>
    <dd><strong>${group.key.windowType}</strong></dd>
    <dt>Evidence</dt>
    <dd><span class="badge ${status.badge}">${group.status}</span><span class="subline">${status.note}</span></dd>
    <dt>Intervals</dt>
    <dd><strong>${group.intervals}</strong><span class="subline">${plural(group.reporters, "reporter")} behind them</span></dd>
    <dt>Observed</dt>
    <dd>${observedRange(group)}</dd>
    <dt>Tokens per point</dt>
    <dd>${bandCell(group.tokensPerPoint, n => decimal(n, 0), "tokens per quota point", "no admissible interval", spreadCopy(group.intervals))}</dd>
    <dt>API-equivalent per point</dt>
    <dd>${bandCell(group.apiUsdPerPoint, usd, "USD per quota point, at the published rate card", "no interval carries a full token mix and a rate card", spreadCopy(priced))}</dd>
    <dt>Cache share</dt>
    <dd>${bandCell(group.cacheShare, percent, "of tokens in the interval", "no interval reported cache tokens", spreadCopy(cached))}</dd>
    <dt>Change verdict</dt>
    <dd>${verdictCell(group.change)}</dd>
  </dl>`;
}

/* ---------- the controls: three selects over the groups that exist ---------- */

export interface Selection {
  subscription: string;
  model: string;
  window: string;
}

/** A model reported through two harnesses is two options, so no selection is ambiguous. */
const modelValue = (groups: GroupAggregate[], group: GroupAggregate) => groups.some(o =>
  o.key.subscriptionId === group.key.subscriptionId
  && o.key.modelId === group.key.modelId
  && o.key.harness !== group.key.harness)
  ? `${group.key.modelId}|${group.key.harness}`
  : group.key.modelId;

export function planOptions(groups: GroupAggregate[]): [string, string][] {
  const options: [string, string][] = [];
  for (const group of groups) {
    if (!options.some(([value]) => value === group.key.subscriptionId))
      options.push([group.key.subscriptionId, `${group.plan} — ${group.key.subscriptionId}`]);
  }
  return options;
}

export function modelOptions(groups: GroupAggregate[], subscription: string): [string, string][] {
  const options: [string, string][] = [];
  for (const group of groups.filter(g => g.key.subscriptionId === subscription)) {
    const value = modelValue(groups, group);
    if (!options.some(([option]) => option === value))
      options.push([value, value.replace("|", " · ")]);
  }
  return options;
}

export function windowOptions(groups: GroupAggregate[], subscription: string, model: string): [string, string][] {
  const [modelId, harness] = model.split("|");
  const options: [string, string][] = [];
  for (const group of groups) {
    const { windowType } = group.key;
    if (group.key.subscriptionId === subscription && group.key.modelId === modelId
      && (harness === undefined || group.key.harness === harness)
      && !options.some(([value]) => value === windowType))
      options.push([windowType, windowType]);
  }
  return options;
}

export function groupFor(groups: GroupAggregate[], selection: Selection): GroupAggregate | null {
  const [modelId, harness] = selection.model.split("|");
  return groups.find(g => g.key.subscriptionId === selection.subscription
    && g.key.modelId === modelId
    && (harness === undefined || g.key.harness === harness)
    && g.key.windowType === selection.window) ?? null;
}

/** A selection that names nothing in the store falls back to what does exist. */
export function resolveSelection(groups: GroupAggregate[], selection: Selection): Selection {
  const plans = planOptions(groups);
  const subscription = plans.some(([value]) => value === selection.subscription)
    ? selection.subscription
    : plans[0][0];
  const models = modelOptions(groups, subscription);
  const model = models.some(([value]) => value === selection.model) ? selection.model : models[0][0];
  const windows = windowOptions(groups, subscription, model);
  const window = windows.some(([value]) => value === selection.window) ? selection.window : windows[0][0];
  return { subscription, model, window };
}

function controlsPanel(groups: GroupAggregate[], selection: Selection, choose: (patch: Partial<Selection>) => void): TemplateResult {
  const on = (key: keyof Selection) => (event: Event) =>
    choose({ [key]: (event.target as HTMLSelectElement).value } as Partial<Selection>);
  const options = (entries: [string, string][]) =>
    entries.map(([value, label]) => html`<option value=${value}>${label}</option>`);
  return html`<div class="picker">
    <label for="obs-plan"><span class="kicker">Plan</span>
      <select id="obs-plan" @change=${on("subscription")}>${options(planOptions(groups))}</select></label>
    <label for="obs-model"><span class="kicker">Model</span>
      <select id="obs-model" @change=${on("model")}>${options(modelOptions(groups, selection.subscription))}</select></label>
    <label for="obs-window"><span class="kicker">Window</span>
      <select id="obs-window" @change=${on("window")}>${options(windowOptions(groups, selection.subscription, selection.model))}</select></label>
  </div>`;
}

/* ---------- the history: one row per admissible interval, then the refusals ---------- */

const pointRow = (point: SeriesPoint) => html`<tr>
  <td>${dateOf(point.observedAt)}</td>
  <td class="num">${decimal(point.tokensPerPoint, 0)}</td>
  <td class="num">${point.apiUsdPerPoint == null ? html`<span class="empty">—</span>` : usd(point.apiUsdPerPoint)}</td>
  <td class="num">${point.cacheShare == null ? html`<span class="empty">—</span>` : percent(point.cacheShare)}</td>
  <td>${point.collectionMethod}</td>
  <td>${point.isolationConfirmed ? "yes" : html`<span class="unconfirmed">no</span>`}</td>
  <td><code title=${point.observationId}>${point.observationId.slice(0, 8)}</code></td>
</tr>`;

const M = { w: 700, h: 240, l: 58, r: 16, t: 28, b: 38 };

function chartNode(group: GroupAggregate): SVGElement {
  const { w, h, l, r, t, b } = M;
  const priced = group.series.filter(p => p.apiUsdPerPoint != null);
  const times = priced.map(p => Date.parse(p.observedAt));
  const values = priced.map(p => p.apiUsdPerPoint as number);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.15 || 1;
  const y = (value: number) => b + (value - lo + pad) / ((hi + pad) - (lo - pad)) * (t - b);
  const x = times[0] === times[times.length - 1]
    ? () => (l + w - r) / 2
    : (time: number) => l + (time - times[0]) / (times[times.length - 1] - times[0]) * (w - r - l);

  // A line never crosses an unpriced interval: the segments break where the price stops.
  const segments: number[][] = [];
  let current: number[] = [];
  let n = 0;
  for (const point of group.series) {
    if (point.apiUsdPerPoint == null) {
      if (current.length) segments.push(current);
      current = [];
      continue;
    }
    current.push(n++);
  }
  if (current.length) segments.push(current);

  const root = svg("svg", {
    viewBox: `0 0 ${w} ${h}`, role: "img",
    "aria-label": `API-equivalent US dollars per quota point over time: ${plural(priced.length, "priced interval")}, ${observedRange(group)}`,
  });
  root.append(svg("text", { class: "axlabel", x: l, y: t - 14 }, "USD / point"));
  for (const value of [lo, (lo + hi) / 2, hi]) {
    root.append(svg("line", { class: "gridline", x1: l, y1: y(value), x2: w - r, y2: y(value) }));
    root.append(svg("text", { class: "tick", x: l - 8, y: y(value) + 3, "text-anchor": "end" }, usd(value)));
  }
  root.append(svg("line", { class: "ax", x1: l, y1: b, x2: w - r, y2: b }));
  root.append(svg("line", { class: "ax", x1: l, y1: t, x2: l, y2: b }));
  const at = [0, Math.floor(priced.length / 2), priced.length - 1];
  for (const i of [...new Set(at)])
    root.append(svg("text", {
      class: "tick", x: x(times[i]), y: b + 18, "text-anchor": "middle",
    }, dateOf(priced[i].observedAt)));
  for (const segment of segments) {
    for (const i of segment)
      root.append(svg("circle", { class: "dot", cx: x(times[i]), cy: y(values[i]), r: 3.5 }));
    if (segment.length > 1)
      root.append(svg("path", {
        d: segment.map((i, k) => `${k ? "L" : "M"}${x(times[i])} ${y(values[i])}`).join(""),
        fill: "none", stroke: "var(--signal)", "stroke-width": 2,
      }));
  }
  return root;
}

function historyPanel(group: GroupAggregate): TemplateResult {
  if (!group.series.length)
    return html`<p class="note">This group holds no admissible interval, so there is no history to draw.</p>
      ${excludedPanel(group)}`;
  const priced = group.series.filter(p => p.apiUsdPerPoint != null);
  const figure = priced.length
    ? html`<figure>${chartNode(group)}
      <figcaption>
        API-equivalent US dollars per quota point, ${plural(priced.length, "priced interval")}.
        The vertical axis starts at this sample's own minimum, not at zero, and an interval with
        no price is listed above but never plotted.
      </figcaption>
    </figure>`
    : html`<p class="note">No interval in this group carries a full token mix and a published rate card, so there is no priced series to draw.</p>`;
  return html`
    <div class="tw" role="region" tabindex="0"
         aria-label=${`Intervals for ${group.plan}, ${group.key.modelId}, ${group.key.windowType}, ${observedRange(group)}`}>
      <table class="obs-table">
        <thead><tr>
          <th>Observed</th><th class="num">Tokens / point</th><th class="num">USD / point</th>
          <th class="num">Cache</th><th>Method</th><th>Isolated</th><th>Interval</th>
        </tr></thead>
        <tbody>${group.series.map(pointRow)}</tbody>
      </table>
    </div>
    ${figure}
    ${excludedPanel(group)}`;
}

function excludedPanel(group: GroupAggregate): TemplateResult {
  if (!group.excluded.length)
    return html`<p class="note">No interval was refused: every observation in this group is admissible and is in the table above.</p>`;
  return html`<div class="excluded">
    <h3>Excluded intervals</h3>
    <ul>${group.excluded.map(e => html`<li>
      <code title=${e.observationId}>${e.observationId.slice(0, 8)}</code> — ${e.reason}
    </li>`)}</ul>
  </div>`;
}

/* ---------- the export, cut in the browser from the selection ---------- */

export function seriesCsv(group: GroupAggregate): string {
  const cell = (value: string | number | boolean | null) => {
    if (value === null) return "";
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows = group.series.map(point => [
    point.observedAt,
    point.tokensPerPoint,
    point.apiUsdPerPoint,
    point.cacheShare,
    point.collectionMethod,
    point.isolationConfirmed,
    point.observationId,
  ].map(cell).join(","));
  return [
    "observedAt,tokensPerPoint,apiUsdPerPoint,cacheShare,collectionMethod,isolationConfirmed,observationId",
    ...rows,
  ].join("\n");
}

function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportPanel(group: GroupAggregate): TemplateResult {
  const slug = `${group.key.subscriptionId}-${group.key.modelId}-${group.key.windowType}`;
  return html`<div class="export">
    <button class="btn ghost" type="button"
            @click=${() => download(`${slug}.json`, JSON.stringify(group, null, 2), "application/json")}>
      Group aggregate — JSON
    </button>
    <button class="btn ghost" type="button"
            @click=${() => download(`${slug}-series.csv`, seriesCsv(group), "text/csv")}>
      Series rows — CSV
    </button>
    <p class="note">
      Both files are built here, from the selection above, and nothing leaves the browser. The
      JSON is this group's aggregate exactly as the page renders it; the CSV carries one row per
      admissible interval, with an empty cell for a figure that interval does not carry. The full
      redistributable store — every observation, with the reasons the inadmissible intervals were
      refused — is regenerated by <code>pnpm observations:aggregate</code>.
    </p>
  </div>`;
}

/* ---------- the store itself, and the state it is not in ---------- */

export function insufficientData(data: Observatory): { heading: string; detail: string[] } {
  return {
    heading: "Insufficient data — no intervals in the store yet.",
    detail: [
      `The store holds ${data.observations} observations and ${data.admissibleIntervals} admissible intervals, and every figure on this page needs at least one.`,
      "A page that could not load its store renders this state rather than a figure: insufficient data is the answer, not a placeholder.",
      "A group that exists but holds no admissible interval says the same thing on its own summary — single report — not an estimate — with the reason each interval was refused below it.",
    ],
  };
}

function insufficientPanel(data: Observatory): TemplateResult {
  const { heading, detail } = insufficientData(data);
  return html`<div class="panel">
    <h3>${heading}</h3>
    ${detail.map(line => html`<p class="note">${line}</p>`)}
  </div>`;
}

function noGroupPanel(): TemplateResult {
  return html`<p class="note">No group in this store matches that combination.</p>`;
}

function storePanel(data: Observatory): TemplateResult {
  return html`<dl class="fields">
    <dt>Store</dt>
    <dd><code>observatory.json</code><span class="subline">schema version ${data.schemaVersion}</span></dd>
    <dt>Observations</dt>
    <dd><strong>${data.observations}</strong><span class="subline">validated intervals received</span></dd>
    <dt>Admissible</dt>
    <dd><strong>${data.admissibleIntervals}</strong><span class="subline">the ones every statistic here uses</span></dd>
    <dt>Groups</dt>
    <dd><strong>${data.groups.length}</strong><span class="subline">plan × model × window × harness</span></dd>
  </dl>
  <p class="note">
    The file is generated, never edited: <code>pnpm observations:aggregate</code> folds
    <code>data/observations/*.json</code> into it, and a record that fails validation stops the
    run. This page reads it once at load and re-derives nothing — every figure was computed by
    that aggregation, and an interval the engine refused never reaches a statistic.
  </p>`;
}

/** The file the page fetches, or null when it is not a store this page can read. */
export function readObservatory(raw: unknown): Observatory | null {
  if (typeof raw !== "object" || raw === null) return null;
  const store = raw as Partial<Observatory>;
  if (store.schemaVersion !== 1 || !Array.isArray(store.groups)) return null;
  return store as Observatory;
}

export function renderObservatory(data: Observatory): void {
  mount(el("observatory-provenance"), storePanel(data));
  if (!data.groups.length) {
    mount(el("observatory-empty"), insufficientPanel(data));
    return;
  }

  const groups = data.groups;
  const anchor = groups[0];
  let selection = resolveSelection(groups, {
    subscription: anchor.key.subscriptionId,
    model: modelValue(groups, anchor),
    window: anchor.key.windowType,
  });

  const paint = () => {
    const group = groupFor(groups, selection);
    mount(el("observatory-controls"), controlsPanel(groups, selection, patch => {
      selection = resolveSelection(groups, { ...selection, ...patch });
      paint();
    }));
    for (const [id, value] of [["obs-plan", selection.subscription], ["obs-model", selection.model], ["obs-window", selection.window]])
      (el(id) as HTMLSelectElement).value = value;
    mount(el("observatory-summary"), group ? summaryPanel(group) : noGroupPanel());
    mount(el("observatory-history"), group ? historyPanel(group) : noGroupPanel());
    mount(el("observatory-export"), group ? exportPanel(group) : noGroupPanel());
  };
  paint();
}
