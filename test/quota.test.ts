import { expect, test } from "vitest";

import { openCodeWindows } from "../src/data/coding";
import {
  bindingWindow,
  dailyCapacity,
  simulateQuota,
  type QuotaPolicy,
  type QuotaWindow,
} from "../src/lib/quota";

const policy = (windows: QuotaWindow[], isCashCredit = false): QuotaPolicy => ({
  metric: "test usage",
  windows,
  isCashCredit,
});

const goFlash = policy(openCodeWindows(80));
const goPro = policy(openCodeWindows(15));

test("Go DeepSeek V4.1 Flash resolves an $80 month to $16 / 5 h, $40 / week and $80 / month", () => {
  expect(goFlash.windows.map(window => [window.window, window.amount])).toEqual([
    ["5h", 16],
    ["7d", 40],
    ["month", 80],
  ]);

  const steady = simulateQuota(goFlash, { tasksPerDay: 4, costPerTaskUsd: 1 }, 30);
  expect(steady.tasksAttempted).toBe(120);
  expect(steady.monthlyUsd).toBe(120);
  expect(steady.perWindow[0]!.usedUsd).toBeCloseTo(4 * (5 / 24), 10);
  expect(steady.perWindow[1]!.usedUsd).toBe(28);
  expect(steady.perWindow[2]!.usedUsd).toBe(120);
  expect(steady.bindingWindow).toBe("month");
  expect(steady.truncatedBy).toBe("month");
  expect(steady.capacityTasks).toBe(80);
});

test("DeepSeek V4 Pro carries its own $15 monthly cap — 3 / 5 h, 7.5 / week, 15 / month", () => {
  expect(goPro.windows.map(window => [window.window, window.amount])).toEqual([
    ["5h", 3],
    ["7d", 7.5],
    ["month", 15],
  ]);

  const simulation = simulateQuota(goPro, { tasksPerDay: 2, costPerTaskUsd: 0.5 }, 30);
  expect(simulation.monthlyUsd).toBe(30);
  expect(simulation.bindingWindow).toBe("month");
  expect(simulation.capacityTasks).toBe(30);
});

test("a burst inside 5 h binds at the 5-hour window while the month still has room", () => {
  const simulation = simulateQuota(goFlash, {
    tasksPerDay: 1,
    costPerTaskUsd: 2,
    burst: { tasks: 8, withinHours: 5 },
  }, 30);

  const five = simulation.perWindow.find(window => window.window === "5h")!;
  const month = simulation.perWindow.find(window => window.window === "month")!;
  expect(five.usedUsd).toBeCloseTo(1 * (5 / 24) * 2 + 16, 10);
  expect(month.usedUsd).toBe(76);
  expect(simulation.monthlyUsd).toBeLessThan(80);
  expect(simulation.bindingWindow).toBe("5h");
  expect(simulation.truncatedBy).toBe("5h");
  expect(simulation.notes.join(" ")).toMatch(/burst of 8 tasks is capped by the 5-hour window/);
});

test("zero or negative tasks and cost return capacity 0 without NaN or Infinity", () => {
  for (const workload of [
    { tasksPerDay: 0, costPerTaskUsd: 2 },
    { tasksPerDay: 4, costPerTaskUsd: 0 },
    { tasksPerDay: -3, costPerTaskUsd: -1 },
  ]) {
    const simulation = simulateQuota(goFlash, workload);
    expect(simulation.capacityTasks).toBe(0);
    expect(simulation.tasksAttempted).toBe(0);
    expect(simulation.monthlyUsd).toBe(0);
    expect(simulation.bindingWindow).toBe("unknown");
    expect(simulation.truncatedBy).toBeNull();
    expect(Number.isNaN(simulation.monthlyUsd)).toBe(false);
    expect(Number.isFinite(simulation.monthlyUsd)).toBe(true);
  }
});

test("an empty or missing window list is unknown, never unlimited", () => {
  for (const empty of [null, undefined, policy([])]) {
    const simulation = simulateQuota(empty, { tasksPerDay: 4, costPerTaskUsd: 1 });
    expect(simulation.capacityTasks).toBeNull();
    expect(simulation.bindingWindow).toBe("unknown");
    expect(simulation.perWindow).toEqual([]);
    expect(simulation.notes.join(" ")).toMatch(/unknown, not unlimited/);
  }
});

test("the shortest published window can bind instead of a monthly cap divided by 30", () => {
  const fiveHourBound = policy([
    { window: "5h", amount: 1, kind: "unknown" },
    { window: "month", amount: 1000, kind: "unknown" },
  ]);
  const simulation = simulateQuota(fiveHourBound, { tasksPerDay: 10, costPerTaskUsd: 1 }, 30);
  expect(simulation.capacityTasks).toBe(144);
  expect(simulation.bindingWindow).toBe("5h");
  expect(dailyCapacity(fiveHourBound, { tasksPerDay: 10, costPerTaskUsd: 1 })).toBeCloseTo(4.8);
  expect(simulation.notes.join(" ")).toMatch(/No weekly window published/);
});

test("caps never add across windows, models or plans", () => {
  const one = simulateQuota(goFlash, { tasksPerDay: 1, costPerTaskUsd: 1 }, 30);
  expect(one.capacityTasks).toBe(80);
  expect(one.capacityTasks).not.toBe(16 + 40 + 80);

  const plus = policy(openCodeWindows(160));
  const both = [goFlash, plus].map(entry =>
    simulateQuota(entry, { tasksPerDay: 1, costPerTaskUsd: 1 }, 30).capacityTasks);
  expect(both).toEqual([80, 160]);
  expect(both[0]! + both[1]!).toBe(240);
  expect(Math.max(...both.map(value => value ?? 0))).toBe(160);
});

test("capacity is always named a theoretical ceiling, and reset kinds are carried through", () => {
  const simulation = simulateQuota(goFlash, { tasksPerDay: 2, costPerTaskUsd: 0.5 });
  expect(simulation.notes[0]).toMatch(/theoretical ceiling/);
  expect(simulation.notes[0]).toMatch(/not tasks delivered/);
  expect(goFlash.windows.every(window => window.kind === "unknown")).toBe(true);
  expect(simulation.notes.join(" ")).toMatch(/Reset semantics for the 5-hour window/);
});

test("bindingWindow is the same constraint simulateQuota reports", () => {
  const workload = { tasksPerDay: 1, costPerTaskUsd: 2, burst: { tasks: 8, withinHours: 5 } };
  expect(bindingWindow(goFlash, workload)).toBe("5h");
  expect(simulateQuota(goFlash, workload).bindingWindow).toBe("5h");
});
