import type { Evidence } from "./types";

export interface AgentPair {
  id: string;
  agent: string;
  model: string;
  index: Evidence<number>;
  costPerTaskUsd: Evidence<number> | null;
  minutesPerTask: Evidence<number>;
}

export interface AgentPick { alias: string; indexFloor?: number; budgetPerTaskUsd?: number }

export interface AgentVerdict {
  frontier: AgentPair[];
  dominated: AgentPair[];
  unpriced: string[];
  selected: Record<string, string | null>;
  formulas: string[];
}

type Priced = AgentPair & { costPerTaskUsd: Evidence<number> };

function dominates(a: Priced, b: Priced): boolean {
  return a.index.value >= b.index.value
    && a.costPerTaskUsd.value <= b.costPerTaskUsd.value
    && a.minutesPerTask.value <= b.minutesPerTask.value
    && (a.index.value > b.index.value
      || a.costPerTaskUsd.value < b.costPerTaskUsd.value
      || a.minutesPerTask.value < b.minutesPerTask.value);
}

export function buildAgentVerdict(pairs: AgentPair[], picks: AgentPick[]): AgentVerdict {
  const priced = pairs.filter((row): row is Priced => row.costPerTaskUsd !== null);
  const unpriced = pairs.filter(row => row.costPerTaskUsd === null).map(row => row.id);
  const dominated = priced.filter(row => priced.some(other => other !== row && dominates(other, row)));
  const frontier = priced.filter(row => !dominated.includes(row));
  const selected = Object.fromEntries(picks.map(pick => {
    const eligible = pick.budgetPerTaskUsd !== undefined
      ? frontier.filter(row => row.costPerTaskUsd.value <= pick.budgetPerTaskUsd!)
        .sort((a, b) => b.index.value - a.index.value || a.costPerTaskUsd.value - b.costPerTaskUsd.value
          || a.minutesPerTask.value - b.minutesPerTask.value)
      : frontier.filter(row => row.index.value >= (pick.indexFloor ?? 0))
        .sort((a, b) => a.costPerTaskUsd.value - b.costPerTaskUsd.value
          || a.minutesPerTask.value - b.minutesPerTask.value);
    return [pick.alias, eligible[0]?.id ?? null];
  }));
  return {
    frontier, dominated, unpriced, selected,
    formulas: [
      "a floor picks the cheapest frontier pair at or above it",
      "a budget picks the strongest frontier pair within it",
      "dominance is over three axes: index, cost per task, minutes per task",
    ],
  };
}
