import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

import snapshot from "../data/opencode-go.json";
import { CODING_CHECKED_ON, CODING_SETUPS, openCodeWindows, type CodingSetup } from "../src/data/coding";
import {
  barPercent,
  formatCap,
  formatCapacity,
  formatUsd,
  windowCap,
} from "../src/ui/coding-page";

const byId: Record<string, CodingSetup> = Object.fromEntries(
  CODING_SETUPS.map(setup => [setup.id, setup] as const),
);
const opencode = CODING_SETUPS.filter(setup => setup.provider === "OpenCode");

test("every setup carries an https source, an ISO check date and a unique id", () => {
  expect(new Set(CODING_SETUPS.map(setup => setup.id)).size).toBe(CODING_SETUPS.length);
  for (const setup of CODING_SETUPS) {
    expect(setup.source.url, setup.id).toMatch(/^https:\/\//);
    expect(setup.source.checkedAt, setup.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(setup.source.checkedAt)), setup.id).toBe(false);
    expect(setup.source.title.length, setup.id).toBeGreaterThan(0);
    expect(setup.note.length, setup.id).toBeGreaterThan(40);
    expect(setup.priceUsd, setup.id).toBeGreaterThanOrEqual(0);
  }
  expect(CODING_CHECKED_ON).toBe(
    CODING_SETUPS.map(setup => setup.source.checkedAt).sort()[0],
  );
});

test("OpenCode's three windows are exactly 20 / 50 / 100 % of the monthly cap", () => {
  expect(opencode.length).toBeGreaterThanOrEqual(3);
  for (const setup of opencode) {
    const windows = setup.policy?.windows ?? [];
    expect(windows.map(window => window.window), setup.id).toEqual(["5h", "7d", "month"]);
    const monthly = windowCap(setup.policy, "month")!;
    expect(windowCap(setup.policy, "5h")! / monthly, setup.id).toBe(0.2);
    expect(windowCap(setup.policy, "7d")! / monthly, setup.id).toBe(0.5);
    expect(windowCap(setup.policy, "month")! / monthly, setup.id).toBe(1);
    expect(windows.every(window => window.kind === "unknown"), setup.id).toBe(true);
    expect(setup.policy?.isCashCredit, setup.id).toBe(false);
    expect(setup.policy?.model, setup.id).toBe(setup.model);
  }
});

test("openCodeWindows keeps the shares and never invents a reset rule", () => {
  expect(openCodeWindows(100)).toEqual([
    { window: "5h", amount: 20, kind: "unknown" },
    { window: "7d", amount: 50, kind: "unknown" },
    { window: "month", amount: 100, kind: "unknown" },
  ]);
  expect(openCodeWindows(80).map(window => window.amount)).toEqual([16, 40, 80]);
  expect(openCodeWindows(15).map(window => window.amount)).toEqual([3, 7.5, 15]);
});

test("the committed snapshot is the source of the OpenCode rows, not the plan prose", () => {
  const go = snapshot.plans.go.models;
  const plus = snapshot.plans["go-plus"].models;
  const flashGo = go.find(model => model.slug === "deepseek-v4.1-flash")!;
  const proGo = go.find(model => model.slug === "deepseek-v4-pro")!;
  const flashPlus = plus.find(model => model.slug === "deepseek-v4.1-flash")!;
  const proPlus = plus.find(model => model.slug === "deepseek-v4-pro")!;

  expect(flashGo.usdPerMonth).toBe(80);
  expect(flashGo.requestsPer5h).toBe(34670);
  expect(flashGo.requestsPerWeek).toBe(86670);
  expect(flashGo.requestsPerMonth).toBe(173330);
  expect(proGo.usdPerMonth).toBe(15);
  expect(flashPlus.usdPerMonth).toBe(160);
  expect(proPlus.usdPerMonth).toBe(60);
  expect(snapshot.plans.go.price).toBe(10);
  expect(snapshot.plans["go-plus"].price).toBe(40);

  const goFlash = byId["go-deepseek-v4.1-flash"];
  const goPro = byId["go-deepseek-v4-pro"];
  const plusFlash = byId["go-plus-deepseek-v4.1-flash"];
  expect(goFlash.priceUsd).toBe(10);
  expect(windowCap(goFlash.policy, "5h")).toBe(16);
  expect(windowCap(goFlash.policy, "7d")).toBe(40);
  expect(windowCap(goFlash.policy, "month")).toBe(80);
  expect(goPro.priceUsd).toBe(10);
  expect(windowCap(goPro.policy, "month")).toBe(15);
  expect(plusFlash.priceUsd).toBe(40);
  expect(windowCap(plusFlash.policy, "5h")).toBe(32);
  expect(windowCap(plusFlash.policy, "7d")).toBe(80);
  expect(windowCap(plusFlash.policy, "month")).toBe(160);
});

test("Codex capacity is null and prints unknown — never 0 or infinity", () => {
  const codex = byId["chatgpt-plus-codex"];
  expect(codex.priceUsd).toBe(20);
  expect(codex.policy).toBeNull();
  expect(codex.confidence).toBe("unknown");
  expect(windowCap(codex.policy, "month")).toBeNull();
  expect(formatCap(windowCap(codex.policy, "month"))).toBe("unknown");
  expect(formatCapacity(null)).toBe("unknown");
  expect(formatCap(null)).not.toBe("$0");
  expect(formatCapacity(null)).not.toBe("0 tasks");
});

test("unknown and zero are different words, and a metered reference keeps its own semantics", () => {
  const payg = byId["api-payg"];
  expect(payg.priceUsd).toBe(0);
  expect(payg.policy).toBeNull();
  expect(formatUsd(0)).toBe("$0");
  expect(formatCap(0)).toBe("$0");
  expect(formatCap(undefined)).toBe("unknown");
  expect(formatCapacity(Number.NaN)).toBe("unknown");
  expect(barPercent(120, 80)).toBe(150);
  expect(barPercent(0, 80)).toBe(0);
  expect(barPercent(10, 0)).toBe(0);
});

test("no setup policy carries another model's or another plan's cap", () => {
  expect(opencode.length).toBe(4);
  const monthlyCaps: Record<string, number> = {
    "go-deepseek-v4.1-flash": 80,
    "go-deepseek-v4-pro": 15,
    "go-plus-deepseek-v4.1-flash": 160,
    "go-plus-deepseek-v4-pro": 60,
  };
  for (const [id, cap] of Object.entries(monthlyCaps)) {
    expect(windowCap(byId[id].policy, "month"), id).toBe(cap);
    expect(byId[id].policy?.windows, id).toHaveLength(3);
  }
  const plusFlash = windowCap(byId["go-plus-deepseek-v4.1-flash"].policy, "month");
  const goFlashCap = windowCap(byId["go-deepseek-v4.1-flash"].policy, "month");
  expect(plusFlash).toBe(160);
  expect(goFlashCap).toBe(80);
  expect(plusFlash).not.toBe((goFlashCap ?? 0) + (windowCap(byId["go-plus-deepseek-v4-pro"].policy, "month") ?? 0));
});

test("coding.html still carries the five mount points the page renders into", () => {
  const page = readFileSync(join(__dirname, "..", "coding.html"), "utf8");
  for (const id of ["coding-controls", "coding-summary", "coding-rows", "coding-note", "coding-sim"]) {
    expect(page, `missing #${id}`).toContain(`id="${id}"`);
  }
  expect(page).toContain(`<script type="module" src="/src/coding.ts"></script>`);
});
