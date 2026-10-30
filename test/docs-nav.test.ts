import { expect, test } from "vitest";

import { activeSection } from "../src/ui/docs-nav";

test("the section being read is the last one whose top has crossed the header edge", () => {
  expect(activeSection([-400, -120, 300, 900], 78)).toBe(1);
});

test("the first section holds while the hero is still on screen", () => {
  expect(activeSection([200, 800, 1400], 78)).toBe(0);
});

test("the last section holds once every top is past the edge", () => {
  expect(activeSection([-900, -600, -200], 78)).toBe(2);
});
