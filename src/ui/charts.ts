/** 06 — Break-even curve · 07 — Pareto frontier. Hand-rolled SVG, no chart library. */
import { AGENT_POINTS } from "../data/agents";
import { BREAK_EVEN } from "../data/illustrative";
import { breakEvenUtilization, paretoAnnotate, subCostPerTask, type Point } from "../lib/benchmark";
import { html } from "lit-html";
import { el, mount, svg } from "./dom";
import { sortable } from "./table-sort";

interface Margins { l: number; r: number; t: number; b: number }
interface Tick { v: string; at: number }

const scale = (d0: number, d1: number, r0: number, r1: number) =>
  (v: number) => r0 + (v - d0) / (d1 - d0) * (r1 - r0);

function axes(root: Element, { l, r, t, b }: Margins, xTicks: Tick[], yTicks: Tick[], xLab: string, yLab: string) {
  root.append(svg("line", { class: "ax", x1: l, y1: b, x2: r, y2: b }));
  root.append(svg("line", { class: "ax", x1: l, y1: t, x2: l, y2: b }));
  for (const { v, at } of yTicks) {
    root.append(svg("line", { class: "gridline", x1: l, y1: at, x2: r, y2: at }));
    root.append(svg("text", { class: "tick", x: l - 8, y: at + 4, "text-anchor": "end" }, v));
  }
  for (const { v, at } of xTicks)
    root.append(svg("text", { class: "tick", x: at, y: b + 18, "text-anchor": "middle" }, v));
  root.append(svg("text", { class: "axlabel", x: l, y: t - 14 }, yLab));
  root.append(svg("text", { class: "axlabel", x: r, y: b + 38, "text-anchor": "end" }, xLab));
}

export function renderBreakEvenChart(): void {
  const root = el("chart-breakeven");
  const m: Margins = { l: 56, r: 660, t: 34, b: 280 };
  const { price: PRICE, tasks: TASKS, apiCostPerTask: API } = BREAK_EVEN;
  const YMAX = 1.0;

  const x = scale(0, 1, m.l, m.r), y = scale(0, YMAX, m.b, m.t);

  axes(root, m,
    [0, .25, .5, .75, 1].map(v => ({ v: (v * 100) + "%", at: x(v) })),
    [0, .25, .5, .75, 1].map(v => ({ v: "$" + v.toFixed(2), at: y(v) })),
    "Subscription utilization", "Effective cost per useful task");

  // PAYG: flat.
  root.append(svg("line", {
    x1: x(0), y1: y(API), x2: x(1), y2: y(API),
    stroke: "var(--ink-3)", "stroke-width": 2, "stroke-dasharray": "5 4",
  }));
  root.append(svg("text", { class: "serieslabel", x: x(1) + 8, y: y(API) + 4 }, "PAYG"));

  // Subscription: price / (tasks × u), clipped at the top of the y axis.
  const uStart = PRICE / (TASKS * YMAX);
  let d = "";
  for (let u = uStart; u <= 1.0001; u += 0.005)
    d += (d ? "L" : "M") + x(Math.min(u, 1)) + " " + y(subCostPerTask(PRICE, TASKS, u));
  root.append(svg("path", { d, fill: "none", stroke: "var(--signal)", "stroke-width": 2.5 }));
  root.append(svg("text", {
    class: "serieslabel", x: x(1) + 8, y: y(subCostPerTask(PRICE, TASKS, 1)) + 4, fill: "var(--signal)",
  }, "Subscription"));

  // Break-even.
  const be = breakEvenUtilization(PRICE, TASKS, API);
  root.append(svg("line", {
    x1: x(be), y1: y(API), x2: x(be), y2: m.b,
    stroke: "var(--ink)", "stroke-width": 1, "stroke-dasharray": "2 3",
  }));
  root.append(svg("circle", { cx: x(be), cy: y(API), r: 5, fill: "var(--ink)" }));
  root.append(svg("text", { class: "serieslabel", x: x(be) + 10, y: y(API) - 12 },
    `Break-even — ${Math.round(be * 100)}% of the allowance`));
}

const PARETO_NUDGE: Record<string, { dx?: number; dy?: number; anchor?: "start" | "end" }> = {
  "Codex · GPT-5.6 Sol": { dx: -8, dy: -6, anchor: "end" },
  "Claude Code · Claude Opus 5": { dy: -10 },
  "Kimi Code CLI · Kimi K3": { dy: -6 },
};

type ParetoRow = Point & { dominators: Point[] };

function paretoRows(): ParetoRow[] {
  return paretoAnnotate(AGENT_POINTS).filter(point => point.dominators.length);
}

function renderDominatedTable(): void {
  const tbody = el("dominated-rows");
  mount(tbody, html`${bySort(paretoRows()).map(point => html`<tr>
    <td>${point.label}</td>
    <td class="num">$${point.x.toFixed(2)}</td>
    <td class="num">${point.y.toFixed(1)}</td>
    <td>${point.dominators.map(d => html`${d.label} · `)}</td>
  </tr>`)}`);
}

const bySort = sortable<ParetoRow>("dominated-rows", [
  row => row.label,
  row => row.x,
  row => row.y,
  row => row.dominators.map(d => d.label).join(" · "),
], renderDominatedTable);

export function renderParetoChart(): void {
  const root = el("chart-pareto");
  root.replaceChildren();
  const m: Margins = { l: 56, r: 600, t: 34, b: 320 };
  const lx = scale(Math.log10(0.05), Math.log10(20), m.l, m.r);
  const x = (v: number) => lx(Math.log10(v));
  const y = scale(35, 70, m.b, m.t);

  axes(root, m,
    [0.1, 0.3, 1, 3, 10].map(v => ({ v: "$" + (v < 1 ? v.toFixed(1) : v.toFixed(0)), at: x(v) })),
    [35, 45, 55, 65].map(v => ({ v: String(v), at: y(v) })),
    "API cost per agentic task (log)", "AA Coding Agent Index");

  const pts = paretoAnnotate(AGENT_POINTS);
  const front = pts.filter(p => p.dominators.length === 0).sort((a, b) => a.x - b.x);

  root.append(svg("path", {
    d: front.map((p, i) => (i ? "L" : "M") + x(p.x) + " " + y(p.y)).join(""),
    fill: "none", stroke: "var(--signal)", "stroke-width": 1.5, "stroke-dasharray": "4 3",
  }));

  for (const p of pts) {
    const dominated = p.dominators.length > 0;
    const n = PARETO_NUDGE[p.label] ?? {};
    root.append(svg("circle", {
      cx: x(p.x), cy: y(p.y), r: dominated ? 5 : 6,
      class: "dot" + (dominated ? " dominated" : ""),
    }));
    root.append(svg("text", {
      class: "dotlabel", x: x(p.x) + (n.dx ?? 11), y: y(p.y) + (n.dy ?? 4),
      "text-anchor": n.anchor ?? "start",
    }, p.label));
  }
  root.append(svg("text", { class: "dotlabel", x: m.l, y: m.b + 56 },
    "● on the frontier — nothing beats it on both axes    ○ dominated — something is cheaper and better"));

  renderDominatedTable();
}
