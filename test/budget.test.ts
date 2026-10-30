import { expect, test } from "vitest";

import { PLANS } from "../src/data/plans";
import { candidatePool } from "../src/ui/budget-modal";

test("no plan with an unresolvable allowance is ever a combination candidate", () => {
  for (const candidate of candidatePool()) {
    expect(candidate.price.value, candidate.plan).toBeGreaterThan(0);
    expect(candidate.tasks.value, candidate.plan).toBeGreaterThan(0);
  }
  const free = PLANS.filter(plan => plan.price === 0);
  expect(free.length).toBeGreaterThan(0);
  expect(candidatePool().some(candidate => free.some(plan => plan.plan === candidate.plan))).toBe(false);
});
