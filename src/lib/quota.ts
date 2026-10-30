export type QuotaWindowName = "5h" | "7d" | "month";

/**
 * How a window reopens. `unknown` is not a licence to assume a rolling window:
 * the simulator carries the word through and refuses to invent reset arithmetic.
 */
type QuotaResetKind = "rolling" | "fixed" | "anchored" | "unknown";

export interface QuotaWindow {
  window: QuotaWindowName;
  amount: number;
  kind: QuotaResetKind;
}

export interface QuotaPolicy {
  metric: string;
  model?: string;
  windows: QuotaWindow[];
  isCashCredit: boolean;
}

export interface Workload {
  tasksPerDay: number;
  costPerTaskUsd: number;
  burst?: { tasks: number; withinHours: number };
}

interface WindowUsage {
  window: QuotaWindowName;
  capUsd: number;
  usedUsd: number;
  binding: boolean;
}

export type BindingWindowName = QuotaWindowName | "unknown";

export interface QuotaSimulation {
  tasksAttempted: number;
  capacityTasks: number | null;
  monthlyUsd: number;
  perWindow: WindowUsage[];
  bindingWindow: BindingWindowName;
  truncatedBy: QuotaWindowName | null;
  notes: string[];
}

export const QUOTA_WINDOWS: readonly QuotaWindowName[] = ["5h", "7d", "month"];

export const WINDOW_LABEL: Record<QuotaWindowName, string> = {
  "5h": "5-hour",
  "7d": "weekly",
  month: "monthly",
};

const FIVE_HOURS_PER_DAY = 24 / 5;
const FIVE_HOUR_DAYS = 5 / 24;
const EPSILON = 1e-9;

const positive = (n: number): boolean => Number.isFinite(n) && n > 0;

const publishedWindows = (policy: QuotaPolicy | null | undefined): QuotaWindow[] =>
  (policy?.windows ?? []).filter(
    window => QUOTA_WINDOWS.includes(window.window) && positive(window.amount),
  );

/**
 * The theoretical ceiling, in tasks, each window grants over the horizon. A
 * 5-hour window recurs 4.8 times a day and a weekly one once a week; the monthly
 * cap is used once, because a horizon longer than a month would require a reset
 * rule nobody published.
 */
function windowCapacity(window: QuotaWindowName, capUsd: number, cost: number, days: number): number {
  switch (window) {
    case "5h":
      return (capUsd / cost) * days * FIVE_HOURS_PER_DAY;
    case "7d":
      return (capUsd / cost) * Math.max(1, days / 7);
    case "month":
      return capUsd / cost;
  }
}

function burstParts(workload: Workload): { tasks: number; inFiveHours: number; cost: number } {
  const tasks = workload.burst && positive(workload.burst.tasks) ? workload.burst.tasks : 0;
  const within = workload.burst && positive(workload.burst.withinHours)
    ? workload.burst.withinHours
    : 5;
  return {
    tasks,
    inFiveHours: tasks * Math.min(1, 5 / within),
    cost: tasks * workload.costPerTaskUsd,
  };
}

function usageFor(
  window: QuotaWindowName,
  tasks: number,
  cost: number,
  days: number,
  burst: { inFiveHours: number; cost: number },
): number {
  switch (window) {
    case "5h":
      return tasks * Math.min(days, FIVE_HOUR_DAYS) * cost + burst.inFiveHours * cost;
    case "7d":
      return tasks * Math.min(days, 7) * cost + burst.cost;
    case "month":
      return tasks * days * cost + burst.cost;
  }
}

const resetNote = (window: QuotaWindow): string =>
  `Reset semantics for the ${WINDOW_LABEL[window.window]} window are not published — carried as ${window.kind}, not assumed.`;

/**
 * Evaluate every published window together. The tightest utilisation binds; a
 * global `monthly / 30` would erase the 5-hour and weekly caps and turn a burst
 * into a promise the provider never made.
 */
export function simulateQuota(
  policy: QuotaPolicy | null | undefined,
  workload: Workload,
  days = 30,
): QuotaSimulation {
  const windows = publishedWindows(policy);
  const horizon = Number.isFinite(days) && days > 0 ? days : 0;
  const tasks = positive(workload.tasksPerDay) ? workload.tasksPerDay : 0;
  const cost = positive(workload.costPerTaskUsd) ? workload.costPerTaskUsd : 0;
  const burst = burstParts(workload);
  const tasksAttempted = tasks * horizon + burst.tasks;
  const monthlyUsd = tasksAttempted * cost;

  if (tasks === 0 || cost === 0 || horizon === 0) {
    return {
      tasksAttempted: 0,
      capacityTasks: 0,
      monthlyUsd: 0,
      perWindow: QUOTA_WINDOWS.flatMap(name => {
        const window = windows.find(entry => entry.window === name);
        return window
          ? [{ window: name, capUsd: window.amount, usedUsd: 0, binding: false }]
          : [];
      }),
      bindingWindow: "unknown",
      truncatedBy: null,
      notes: [
        "Zero or negative cadence or cost — capacity is 0 by definition, not unlimited.",
        "Capacity is a theoretical ceiling under the stated cadence — not tasks delivered.",
      ],
    };
  }

  if (!policy || windows.length === 0) {
    return {
      tasksAttempted,
      capacityTasks: null,
      monthlyUsd,
      perWindow: [],
      bindingWindow: "unknown",
      truncatedBy: null,
      notes: [
        "No quota window is published for this setup — capacity is unknown, not unlimited.",
        "Capacity is a theoretical ceiling under the stated cadence — not tasks delivered.",
      ],
    };
  }

  const perWindow: WindowUsage[] = QUOTA_WINDOWS.flatMap(name => {
    const window = windows.find(entry => entry.window === name);
    return window
      ? [{
          window: name,
          capUsd: window.amount,
          usedUsd: usageFor(name, tasks, cost, horizon, burst),
          binding: false,
        }]
      : [];
  });

  let binding: WindowUsage | null = null;
  let bindingRatio = -1;
  for (const entry of perWindow) {
    const ratio = entry.usedUsd / entry.capUsd;
    if (ratio > bindingRatio + EPSILON) {
      binding = entry;
      bindingRatio = ratio;
    }
  }
  if (binding) binding.binding = true;

  const capacityTasks = Math.min(
    ...windows.map(window => windowCapacity(window.window, window.amount, cost, horizon)),
  );

  const notes = [
    "Capacity is a theoretical ceiling under the stated cadence — not tasks delivered.",
    "Every published window applies at once; the tightest utilisation binds first.",
  ];
  if (!policy.isCashCredit) notes.push("Vendor-valued dollars are not refundable credit.");
  if (horizon > 30) {
    notes.push("A horizon longer than a month is not modelled beyond one monthly cap — the reset rule is unpublished.");
  }
  for (const name of QUOTA_WINDOWS) {
    const window = windows.find(entry => entry.window === name);
    if (!window) notes.push(`No ${WINDOW_LABEL[name]} window published — carried as unknown, not unlimited.`);
    else if (window.kind === "unknown") notes.push(resetNote(window));
  }
  if (burst.tasks > 0) {
    const five = windows.find(entry => entry.window === "5h");
    const fiveUsage = perWindow.find(entry => entry.window === "5h");
    if (five && fiveUsage) {
      const fit = Math.floor(five.amount / cost);
      if (fiveUsage.usedUsd > five.amount + EPSILON) {
        notes.push(
          `The burst of ${burst.tasks} tasks is capped by the 5-hour window: at most ${fit} fit inside it.`,
        );
      }
    }
  }

  return {
    tasksAttempted,
    capacityTasks,
    monthlyUsd,
    perWindow,
    bindingWindow: binding?.window ?? "unknown",
    truncatedBy: binding && bindingRatio > 1 + EPSILON ? binding.window : null,
    notes,
  };
}

export function bindingWindow(
  policy: QuotaPolicy | null | undefined,
  workload: Workload,
  days = 30,
): BindingWindowName {
  return simulateQuota(policy, workload, days).bindingWindow;
}

export function dailyCapacity(
  policy: QuotaPolicy | null | undefined,
  workload: Workload,
  days = 30,
): number | null {
  const simulation = simulateQuota(policy, workload, days);
  if (simulation.capacityTasks == null || days <= 0) return simulation.capacityTasks;
  return simulation.capacityTasks / days;
}
