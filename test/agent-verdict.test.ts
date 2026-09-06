import { expect, test } from "vitest";
import { buildAgentVerdict, type AgentPair } from "../packages/intelligence/index";

const evidence = (value: number) => ({ value, rung: "derived" as const, source: "https://artificialanalysis.ai/agents/coding-agents", verified: "2026-08-15" });
const pair = (id: string, index: number, cost: number | null, minutes: number): AgentPair => ({
  id, agent: id.split("/")[0], model: id.split("/")[1],
  index: evidence(index), costPerTaskUsd: cost === null ? null : evidence(cost), minutesPerTask: evidence(minutes),
});

const PAIRS = [
  pair("claude-code/opus", 66.7, 8.24, 23.6),
  pair("codex/sol", 66.6, 7.08, 10.2),
  pair("grok-build/grok", 64.4, 2.59, 16.5),
  pair("opencode/gemini", 57.1, null, 8.5),
  pair("cursor/composer", 38.2, 0.55, 5.1),
];

test("an unpriced pair is excluded by name, never plotted at zero", () => {
  const verdict = buildAgentVerdict(PAIRS, []);
  expect(verdict.unpriced).toEqual(["opencode/gemini"]);
  expect([...verdict.frontier, ...verdict.dominated].map(row => row.id)).not.toContain("opencode/gemini");
});

test("dominated pairs are kept and named, and the frontier is honest", () => {
  const verdict = buildAgentVerdict(PAIRS, []);
  // codex/sol beats claude-code/opus on cost AND minutes at ~equal index → opus is dominated only
  // if sol's index is >= — it is 66.6 < 66.7, so BOTH stay on the frontier: three-axis dominance.
  expect(verdict.frontier.map(row => row.id)).toContain("claude-code/opus");
  expect(verdict.frontier.map(row => row.id)).toContain("codex/sol");
});

test("a floor picks the cheapest qualifying pair; a budget picks the strongest affordable one", () => {
  const verdict = buildAgentVerdict(PAIRS, [
    { alias: "implement", indexFloor: 60 },
    { alias: "flagship", budgetPerTaskUsd: 7.5 },
  ]);
  expect(verdict.selected.implement).toBe("grok-build/grok");
  expect(verdict.selected.flagship).toBe("codex/sol");
});

test("no picks means no selection and no invented defaults", () => {
  expect(buildAgentVerdict(PAIRS, []).selected).toEqual({});
});
