import { describe, expect, test } from "vitest";

import { ESTIMATES } from "../src/data/derived/estimates";
import { PLANS, type Plan } from "../src/data/plans";
import {
  MAX_COMPARE, compareRows, defaultCompareSelection, selectComparePlan,
} from "../src/ui/compare-page";

const byName = (name: string): Plan => {
  const plan = PLANS.find(row => row.plan === name);
  if (!plan) throw new Error(`missing plan ${name}`);
  return plan;
};

const rowsFor = (plans: Plan[]) => new Map(compareRows(plans).map(row => [row.id, row]));

test("compareRows keeps the seven rows in a fixed order", () => {
  expect(compareRows([byName("OpenCode Go")]).map(row => row.id)).toEqual([
    "price", "model", "index", "allowance", "unit", "per-dollar", "source",
  ]);
});

describe("a $0 plan", () => {
  const rows = rowsFor([byName("Google Gemini API Free")]);

  test("shows a zero price and no per-dollar figure", () => {
    expect(rows.get("price")!.cells[0].value).toBe(0);
    const perDollar = rows.get("per-dollar")!.cells[0];
    expect(perDollar.value).toBeNull();
    expect(perDollar.text).toBe("not defined at $0");
  });

  test("keeps an unpublished allowance null, never zero", () => {
    expect(ESTIMATES["Google Gemini API Free"].allowance).toBeNull();
    const allowance = rows.get("allowance")!.cells[0];
    expect(allowance.value).toBeNull();
    expect(allowance.text).toBeNull();
    expect(allowance.value).not.toBe(0);
    expect(allowance.detail).toMatch(/no published allowance at \$0/);
  });
});

describe("unknown stays unknown", () => {
  test("a plan with no scored model gets no index", () => {
    const rows = rowsFor([byName("GitHub Copilot Free")]);
    expect(rows.get("model")!.cells[0].text).toBeNull();
    expect(rows.get("index")!.cells[0].value).toBeNull();
    expect(rows.get("allowance")!.cells[0].value).toBeNull();
  });

  test("no numeric cell is zero merely because a figure is missing", () => {
    for (const plan of PLANS.filter(row => row.price === 0)) {
      for (const row of compareRows([plan])) {
        for (const content of row.cells) {
          if (content.value === 0) {
            expect(row.id, plan.plan).toBe("price");
            expect(content.text, plan.plan).toBe("$0 / month");
          }
        }
      }
    }
  });
});

describe("a paid plan", () => {
  test("carries price, index, allowance rung and source date", () => {
    const rows = rowsFor([byName("OpenCode Go")]);
    const price = rows.get("price")!.cells[0];
    const index = rows.get("index")!.cells[0];
    const allowance = rows.get("allowance")!.cells[0];
    const source = rows.get("source")!.cells[0];

    expect(price.value).toBe(10);
    expect(index.value).not.toBeNull();
    expect(allowance.value).not.toBeNull();
    expect(allowance.rung).not.toBeNull();
    expect(allowance.confidence).not.toBeNull();
    expect(source.href).toMatch(/^https:\/\//);
    expect(source.detail).toMatch(/^verified \d{4}-\d{2}-\d{2}$/);
  });

  test("has a per-dollar figure once the allowance is known", () => {
    const perDollar = rowsFor([byName("OpenCode Go")]).get("per-dollar")!.cells[0];
    expect(perDollar.value).not.toBeNull();
    expect(perDollar.value!).toBeGreaterThan(0);
    expect(perDollar.text).toMatch(/\/ \$1$/);
  });
});

test("the default selection is two $0 rows and two paid rows, within the cap", () => {
  const selected = defaultCompareSelection();
  expect(selected).toHaveLength(MAX_COMPARE);
  const chosen = selected.map(byName);
  expect(chosen.filter(plan => plan.price === 0)).toHaveLength(2);
  expect(chosen.filter(plan => (plan.price ?? 0) > 0)).toHaveLength(2);
});

test("selection refuses a fifth plan and lets one be replaced", () => {
  const names = PLANS.slice(0, 5).map(plan => plan.plan);
  let selected: string[] = [];
  for (const name of names) selected = selectComparePlan(selected, name, true);

  expect(selected).toHaveLength(MAX_COMPARE);
  expect(selectComparePlan(selected, names[4], true)).toHaveLength(MAX_COMPARE);
  expect(selectComparePlan(selected, names[4], true)).not.toContain(names[4]);

  selected = selectComparePlan(selected, names[0], false);
  expect(selected).toHaveLength(MAX_COMPARE - 1);
  expect(selectComparePlan(selected, names[4], true)).toContain(names[4]);
});
