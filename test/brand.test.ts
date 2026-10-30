import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const read = (file: string) => readFileSync(join(__dirname, "..", file), "utf8");

const index = read("index.html");

test("the homepage carries the canonical title and description", () => {
  expect(index).toContain("<title>Compare Free AI &amp; Paid Plans | Limits Apply</title>");
  expect(index).toContain(
    '<meta name="description" content="Compare free AI tools, paid subscriptions, and coding setups. See available models, usage limits, and which option fits your budget.">',
  );
  expect(index).toContain('<meta property="og:title" content="Limits Apply — Find the best AI for your budget">');
  expect(index).toContain("Know the limits. Get more done. Compare free and paid AI plans");
});

test("the homepage has one H1, and the canonical headline", () => {
  expect(index.match(/<h1[\s>]/g)?.length).toBe(1);
  expect(index).toContain("<h1>How much work does your AI plan actually buy?</h1>");
  expect(index).toContain("Every AI plan, one scale");
});

test("the table leads the page and links to the research on its own page", () => {
  expect(index).toContain('href="./research.html"');
  expect(index).not.toContain('id="explore"');
});

test("the research page keeps every section id", () => {
  const research = read("research.html");
  for (const id of ["agentic", "gap", "wrong-metric", "metrics", "community-measurements",
    "break-even", "frontier", "harness", "methodology", "limitations", "portfolio", "why",
    "ledger", "the-four", "ledger-gaps"]) {
    expect(research, `${id} is missing from research.html`).toContain(`id="${id}"`);
  }
});

test("every new page states its own canonical H1", () => {
  expect(read("free.html")).toContain("<h1>The best AI you can use for free.</h1>");
  expect(read("coding.html")).toContain("<h1>Ship more code for your budget.</h1>");
  expect(read("compare.html")).toContain("<h1>Compare what you actually get.</h1>");
  expect(read("strategies.html")).toContain("<h1>One plan or a smarter mix?</h1>");
});
