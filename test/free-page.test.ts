import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const ROOT = join(__dirname, "..");
const freeHtml = readFileSync(join(ROOT, "free.html"), "utf8");
const freeTs = readFileSync(join(ROOT, "src", "free.ts"), "utf8");

test("free.html carries every seat the page mounts into, and its own stylesheet", () => {
  for (const seat of ["free-filters", "free-grid", "free-note"])
    expect(freeHtml, `missing seat #${seat}`).toContain(`id="${seat}"`);
  expect(freeHtml).toContain(`<script type="module" src="/src/free.ts"></script>`);
  expect(freeHtml).toContain(`<link rel="stylesheet" href="/src/styles/parts/free.css">`);
  expect(existsSync(join(ROOT, "src/styles/parts/free.css"))).toBe(true);
});

test("src/free.ts wires the free page renderer", () => {
  expect(freeTs).toContain(`import { renderFreePage } from "./ui/free-page"`);
  expect(freeTs).toContain("renderFreePage()");
});
