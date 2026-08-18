import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";
import { AA_SNAPSHOT } from "../src/data/aa";
import { LOCAL_AA_SNAPSHOT } from "../src/data/local-models";
import { MEASUREMENTS_VERIFIED } from "../src/data/local-measurements";
import { VERIFIED_ON } from "../src/data/plans";
import { SILICON_VERIFIED } from "../src/data/silicon";

test("scripts/freshness.mjs computes the same oldest date ui/freshness.ts renders", () => {
  const inputs = [VERIFIED_ON, AA_SNAPSHOT.verified, LOCAL_AA_SNAPSHOT.verified, SILICON_VERIFIED, MEASUREMENTS_VERIFIED];
  const actual = execFileSync("node", ["scripts/freshness.mjs"], { encoding: "utf8" }).trim();
  expect(actual).toBe(inputs.reduce((a, b) => (a < b ? a : b)));
  // A silently-dropped input wouldn't necessarily change the min today, but it can
  // never make the result younger than every one of the five sources it claims to read.
  for (const input of inputs) expect(actual <= input, input).toBe(true);
});
