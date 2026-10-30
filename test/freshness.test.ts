import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";
import { AA_SNAPSHOT, PLAN_ACCESS_VERIFIED } from "../src/data/aa";
import { LOCAL_AA_SNAPSHOT } from "../src/data/local-models";
import { MEASUREMENTS_VERIFIED } from "../src/data/local-measurements";
import { VERIFIED_ON } from "../src/data/plans";
import { SILICON_VERIFIED } from "../src/data/silicon";

const inputs = [VERIFIED_ON, AA_SNAPSHOT.verified, LOCAL_AA_SNAPSHOT.verified, PLAN_ACCESS_VERIFIED,
  SILICON_VERIFIED, MEASUREMENTS_VERIFIED];

test("scripts/freshness.mjs computes the same oldest date ui/freshness.ts renders", () => {
  const actual = execFileSync("node", ["scripts/freshness.mjs"], { encoding: "utf8" }).trim();
  expect(actual).toBe(inputs.reduce((a, b) => (a < b ? a : b)));
  // A silently-dropped input wouldn't necessarily change the min today, but it can
  // never make the result younger than every one of the sources it claims to read.
  for (const input of inputs) expect(actual <= input, input).toBe(true);
});

test("the freshness table names the plan-access date the page also takes the minimum of", () => {
  const table = execFileSync("node", ["scripts/freshness.mjs", "--table"], { encoding: "utf8" });
  expect(table).toContain(`| plan access (\`aa.ts\`) | ${PLAN_ACCESS_VERIFIED} |`);
});
