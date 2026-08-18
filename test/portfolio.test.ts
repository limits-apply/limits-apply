import { expect, test } from "vitest";

import {
  combosUnder,
  frontier,
  pickThree,
  scoreCombo,
  weakestRung,
  type Candidate,
} from "../src/lib/portfolio";
import { exact } from "../src/lib/provenance";
import { PLANS, PLAN_SURFACE } from "../src/data/plans";

const candidate = (
  plan: string,
  vendor: string,
  harness: string | null,
  price: number,
  tasks: number,
  intelligence: number,
): Candidate => ({
  plan, vendor, harness,
  price: exact(price),
  tasks: exact(tasks),
  intelligence,
  rung: "measured",
});

/** Two vendors, one shared harness, one plan nobody documents a harness for. */
const POOL: Candidate[] = [
  candidate("Cheap Frontier", "Alpha", "Alpha CLI", 20, 100, 60),
  candidate("Big Alpha", "Alpha", "Alpha CLI", 100, 900, 60),
  candidate("Bravo Volume", "Bravo", "Alpha CLI", 25, 800, 45),
  candidate("Charlie Mid", "Charlie", "Charlie IDE", 30, 400, 52),
  candidate("Delta Chat", "Delta", null, 15, 200, 48),
];

test("a combination never buys the same vendor or the same harness twice", () => {
  for (const combo of combosUnder(POOL, 400, 10_000)) {
    const vendors = combo.members.map(member => member.vendor);
    const harnesses = combo.members.map(member => member.harness).filter(h => h != null);
    expect(new Set(vendors).size).toBe(vendors.length);
    expect(new Set(harnesses).size).toBe(harnesses.length);
  }
});

test("an undocumented harness groups on vendor alone rather than colliding with every other blank", () => {
  const withDelta = combosUnder(POOL, 400, 10_000)
    .filter(combo => combo.members.some(member => member.plan === "Delta Chat"));

  expect(withDelta.some(combo => combo.members.length > 1)).toBe(true);
});

test("no combination is offered above the budget, and the cheapest plan sets the floor", () => {
  for (const budget of [10, 20, 45, 70, 200]) {
    for (const combo of combosUnder(POOL, budget, 10_000)) {
      expect(combo.price.value).toBeLessThanOrEqual(budget);
    }
  }
  expect(combosUnder(POOL, 14, 10_000)).toHaveLength(0);
});

test("headroom is capped by the workload you state, never by the sum of allowances", () => {
  const demand = 300;
  for (const combo of combosUnder(POOL, 400, demand)) {
    expect(combo.headroom.value).toBeLessThanOrEqual(demand);
    expect(combo.headroom.high).toBeLessThanOrEqual(demand);
  }
});

test("a plan added to an already-covered workload buys exactly zero headroom", () => {
  const [cheapFrontier, , bravoVolume] = POOL;
  const demand = 500;

  const alone = scoreCombo([bravoVolume], demand);
  const stacked = scoreCombo([bravoVolume, cheapFrontier], demand);

  // 800 tasks already exceeds a 500-task month, so the second plan moves nothing.
  expect(alone.headroom.value).toBe(demand);
  expect(stacked.headroom.value).toBe(alone.headroom.value);
  expect(stacked.price.value).toBeGreaterThan(alone.price.value);
});

test("under a workload neither plan covers alone, a second surface does add headroom", () => {
  const [cheapFrontier, , bravoVolume] = POOL;
  const demand = 5000;

  expect(scoreCombo([bravoVolume, cheapFrontier], demand).headroom.value)
    .toBeGreaterThan(scoreCombo([bravoVolume], demand).headroom.value);
});

test("intelligence is the highest reached, never the sum of what was bought", () => {
  const [cheapFrontier, , bravoVolume] = POOL;
  const combo = scoreCombo([bravoVolume, cheapFrontier], 10_000);

  expect(combo.ceiling).toBe(60);
  expect(combo.ceiling).toBeLessThan(cheapFrontier.intelligence + bravoVolume.intelligence);
});

test("a combination is no stronger evidence than its weakest member", () => {
  const modelled: Candidate = { ...POOL[0], plan: "Modelled", vendor: "Echo", rung: "modelled" };

  expect(scoreCombo([POOL[2], modelled], 10_000).rung).toBe("modelled");
  expect(weakestRung(["measured", "chained", "observed"])).toBe("chained");
  expect(weakestRung(["measured"])).toBe("measured");
});

test("nothing on the frontier is beaten on cost, ceiling and headroom at once", () => {
  const front = frontier(combosUnder(POOL, 200, 1000));

  for (const combo of front) {
    const dominated = front.some(other =>
      other !== combo
      && other.price.value <= combo.price.value
      && other.ceiling >= combo.ceiling
      && other.headroom.value >= combo.headroom.value
      && (other.price.value < combo.price.value
        || other.ceiling > combo.ceiling
        || other.headroom.value > combo.headroom.value));
    expect(dominated).toBe(false);
  }
});

test("once a workload is covered, no combination on the frontier keeps paying to cover it twice", () => {
  // Bravo Volume alone carries 800 tasks, so a 100-task month is saturated by it.
  const front = frontier(combosUnder(POOL, 200, 100));

  for (const combo of front) {
    const saturated = combo.members.filter(member => member.tasks.value >= 100);
    if (!saturated.length) continue;
    // Anything bought alongside a plan that already covers the month must raise the
    // ceiling, or cost is all it adds and dominance drops it.
    for (const member of combo.members) {
      if (member === saturated[0]) continue;
      expect(member.intelligence).toBeGreaterThan(saturated[0].intelligence);
    }
  }
});

test("the three picks name the axis each one wins", () => {
  const front = frontier(combosUnder(POOL, 200, 1000));
  const picks = pickThree(front, 1000)!;

  expect(picks.ceiling.ceiling).toBe(Math.max(...front.map(combo => combo.ceiling)));
  expect(picks.headroom.headroom.value)
    .toBe(Math.max(...front.map(combo => combo.headroom.value)));
  expect(pickThree([], 1000)).toBe(null);
});

test("the cheapest sufficient combination is null when nothing covers the month", () => {
  const front = frontier(combosUnder(POOL, 200, 100_000));

  expect(pickThree(front, 100_000)!.spend).toBe(null);
  expect(pickThree(front, 100)!.spend).not.toBe(null);
});

test("a budget below the cheapest plan yields no frontier rather than an invented one", () => {
  expect(pickThree(frontier(combosUnder(POOL, 5, 1000)), 1000)).toBe(null);
});

test("every plan declares who bills it, and a harness is named or left blank — never empty", () => {
  for (const plan of PLANS) {
    const surface = PLAN_SURFACE[plan.plan];
    expect(surface, plan.plan).toBeTruthy();
    expect(surface.vendor.length).toBeGreaterThan(0);
    expect(surface.harness).not.toBe("");
  }
  const names = new Set(PLANS.map(plan => plan.plan));
  expect(Object.keys(PLAN_SURFACE).filter(name => !names.has(name))).toEqual([]);
});

test("plan tiers from one vendor share a vendor, so no budget can ever stack them", () => {
  const tiers = [
    ["Claude Pro", "Claude Max 5×", "Claude Max 20×"],
    ["Cursor Pro", "Cursor Pro+", "Cursor Ultra"],
    ["Kimi Moderato", "Kimi Allegretto", "Kimi Allegro", "Kimi Vivace"],
  ];
  for (const tier of tiers) {
    const vendors = new Set(tier.map(name => PLAN_SURFACE[name].vendor));
    expect(vendors.size, tier[0]).toBe(1);
  }
});
