import { describe, expect, test } from "vitest";

import {
  COMPLIANCE_POSITIONS, COMPLIANCE_STATUSES, isRecommendable, positionFor,
  prohibitedOptions, recommendableOptions, type ComplianceStatus,
} from "../src/lib/compliance";

const entries = Object.entries(COMPLIANCE_POSITIONS);

test("the six options are exactly the ones the simulator may offer", () => {
  expect(Object.keys(COMPLIANCE_POSITIONS).sort()).toEqual([
    "higher-tier",
    "multi-account-same-plan",
    "multi-provider",
    "paid-top-up",
    "single-plan",
    "team-seats",
  ]);
});

test("multi-account-same-plan is prohibited and never recommendable", () => {
  const position = positionFor("multi-account-same-plan");
  expect(position?.status).toBe("prohibited");
  expect(position?.termsUrl).toBe("https://dev.opencode.ai/legal/terms-of-service");
  expect(isRecommendable(position!.status)).toBe(false);
  expect(recommendableOptions()).not.toContain("multi-account-same-plan");
  expect(prohibitedOptions()).toEqual(["multi-account-same-plan"]);
});

test("the permitted positions are the two allowed plus the two needing confirmation", () => {
  expect(recommendableOptions().sort()).toEqual([
    "higher-tier",
    "multi-provider",
    "paid-top-up",
    "single-plan",
    "team-seats",
  ]);
  expect(COMPLIANCE_POSITIONS["multi-provider"].status).toBe("allowed");
  expect(COMPLIANCE_POSITIONS["paid-top-up"].status).toBe("requires_confirmation");
  expect(COMPLIANCE_POSITIONS["team-seats"].status).toBe("requires_confirmation");
});

test("every position is dated, reasoned, and either carries a terms URL or says none", () => {
  for (const [key, position] of entries) {
    expect(position.rationale.length, key).toBeGreaterThan(20);
    expect(position.checkedAt, key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    if (position.termsUrl === null) {
      expect(position.source, key).toBe("none");
    } else {
      expect(position.termsUrl, key).toMatch(/^https:\/\//);
      expect(position.source, key).not.toBe("none");
    }
  }
});

test("the status vocabulary is closed", () => {
  for (const [key, position] of entries) {
    expect(COMPLIANCE_STATUSES, key).toContain(position.status);
  }
  expect(new Set(COMPLIANCE_STATUSES).size).toBe(COMPLIANCE_STATUSES.length);
});

test("isRecommendable admits only allowed and requires_confirmation", () => {
  const expected: Record<ComplianceStatus, boolean> = {
    allowed: true,
    requires_confirmation: true,
    prohibited: false,
    unknown: false,
  };
  for (const status of COMPLIANCE_STATUSES) {
    expect(isRecommendable(status), status).toBe(expected[status]);
  }
});

describe("positionFor", () => {
  test("returns a position for every known option", () => {
    for (const key of Object.keys(COMPLIANCE_POSITIONS)) {
      expect(positionFor(key)).not.toBeNull();
    }
  });

  test("returns null for an option nobody has read the terms for", () => {
    expect(positionFor("rotate-free-trials")).toBeNull();
  });
});
