/** 02 — Agentic reality check. Ladder allowances divided by agentic task cost. */
import { html, nothing } from "lit-html";

import { AA_AGENTS, AGENTS_SNAPSHOT, PLAN_AGENT_KEYS } from "../data/agents";
import { estimateFor } from "../data/derived/estimates";
import { PLANS } from "../data/plans";
import { tasksFromAllowance } from "../lib/provenance";
import { bandLine, modelCell, planCell, rungTag } from "./cells";
import { el, mount } from "./dom";
import { count } from "./format";
import { sortable } from "./table-sort";
import { estimateTip, tip } from "./tooltip";

type AgentRow = ReturnType<typeof agentRows>[number];

function agentRows() {
  return PLANS.filter(plan => PLAN_AGENT_KEYS[plan.plan]).map(plan => {
    const variant = AA_AGENTS[PLAN_AGENT_KEYS[plan.plan]];
    const { allowance } = estimateFor(plan.plan);
    const tasks = variant.costPerTask == null ? null : tasksFromAllowance(allowance, variant.costPerTask);
    return { plan, variant, allowance, tasks };
  });
}

const bySort = sortable<AgentRow>("agent-rows", [
  row => row.plan.plan, row => row.variant.agent, row => row.variant.index,
  row => row.variant.costPerTask ?? NaN, row => row.variant.wallMinutes, row => row.tasks?.value ?? NaN,
], renderAgentTable);

export function renderAgentTable(): void {
  const rows = agentRows();
  mount(el("agent-rows"), html`${bySort(rows).map(({ plan, variant, allowance, tasks }) => html`
    <tr class="rung-${allowance.rung}">
      <td class="plan-cell">${planCell(plan.plan, plan.price == null ? "price not published" : "$" + plan.price.toFixed(2) + " / month")}</td>
      <td class="model-cell">${modelCell(variant.agent, `${variant.model} · ${variant.reasoning}`)}</td>
      <td class="num">${variant.index.toFixed(1)}</td>
      <td class="num">${variant.costPerTask == null ? html`<span class="empty">—</span>` : "$" + variant.costPerTask.toFixed(2)}</td>
      <td class="num">${variant.wallMinutes.toFixed(0)} min</td>
      <td class="num" data-tip=${tasks ? tip(estimateTip(`Agentic capacity — ${plan.plan}`, allowance, [
        `÷ $${variant.costPerTask!.toFixed(2)} per agentic task on ${variant.agent} · ${variant.model} = ${count(tasks.value)} tasks / month`,
      ])) : nothing}>
        ${tasks ? html`${count(tasks.value)} ${rungTag(allowance.rung)} ${bandLine(tasks, count)}`
          : html`<span class="empty">—</span><span class="basis">agent cost not published</span>`}
      </td>
    </tr>`)}`);

  mount(el("agent-note"), html`<strong>Agentic tasks / month = the plan's resolved monthly allowance ÷ AA's API cost of one
    agentic task on the agent the plan actually ships.</strong>
    Source: <a href=${AGENTS_SNAPSHOT.source} target="_blank" rel="noreferrer">Artificial
    Analysis coding agents</a> · ${AGENTS_SNAPSHOT.suites} · snapshot ${AGENTS_SNAPSHOT.verified}.
    Only plans whose own shipped harness was scored appear here — Copilot, Google and most of the
    ledger are absent because AA has not scored their harness; Claude Pro, SuperGrok, the GLM
    plans and OpenCode Go are absent because nothing verifies they ship the exact scored variant —
    Anthropic documents Sonnet 5, not the scored Opus 5, as Pro's default.
    The allowance keeps the rung and band it earned on the ladder; the division adds no new
    evidence. This is Layer 1 arithmetic, not a measured completion count.`);
}
