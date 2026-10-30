import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

import { CLAIMS, type ClaimKey } from "../src/claims";
import { AGENT_POINTS } from "../src/data/agents";
import { DISCLOSURE } from "../src/data/derived/disclosure";

const ROOT = join(__dirname, "..");

const htmlFiles = [
  ...readdirSync(ROOT).filter(name => name.endsWith(".html")).map(name => join(ROOT, name)),
  ...readdirSync(join(ROOT, "docs")).filter(name => name.endsWith(".html"))
    .map(name => join(ROOT, "docs", name)),
];

const html = Object.fromEntries(htmlFiles.map(file => [file, readFileSync(file, "utf8")]));

test("every claim used by a page is registered, and every registered claim is usable", () => {
  const used = new Set<string>();
  for (const source of Object.values(html)) {
    for (const match of source.matchAll(/<!--\s*claim:([\w.-]+)\s*-->/g)) used.add(match[1]);
  }
  for (const key of used) expect(CLAIMS[key as ClaimKey], key).toBeTypeOf("function");
  for (const [key, claim] of Object.entries(CLAIMS)) expect(claim(), key).toBeTruthy();
});

test("the static pages carry no stale literals the data already replaced", () => {
  const stale = [
    "0.2 points apart",
    "$0.55 to $11.71",
    "9 publish what the money buys",
    "the other 49",
    "no published current.json",
    "Four files",
    "can run up to",
    "does not exist — not here",
  ];
  for (const [file, source] of Object.entries(html)) {
    for (const phrase of stale) expect(source, `${file} still says "${phrase}"`).not.toContain(phrase);
  }
});

test("the hosted evidence snapshot exists where the docs point", () => {
  expect(existsSync(join(ROOT, "public", "current.json"))).toBe(true);
  expect(html[join(ROOT, "docs", "index.html")]).toContain("current.json");
});

test("the disclosed counts are rendered from the same object the staircase uses", () => {
  expect(CLAIMS["disclosure.summary"]()).toContain(`${DISCLOSURE.total} AI subscription plans`);
  expect(CLAIMS["disclosure.summary"]()).toContain(`${DISCLOSURE.usd} publish what the money buys`);
  expect(CLAIMS["disclosure.observed"]()).toContain(`${DISCLOSURE.observed} published traces`);
  expect(CLAIMS["agentic.range"]()).toContain(
    `$${Math.min(...AGENT_POINTS.map(point => point.x)).toFixed(2)}`);
  expect(CLAIMS["agentic.range"]()).toContain(
    `$${Math.max(...AGENT_POINTS.map(point => point.x)).toFixed(2)}`);
});

test("the agent-gap prose is computed, not a stale literal", () => {
  for (const file of ["src/ui/portfolio.ts", "src/data/illustrative.ts"]) {
    const source = readFileSync(join(ROOT, file), "utf8");
    expect(source, `${file} still hardcodes the old gap`).not.toContain("0.2 points apart");
  }
  expect(readFileSync(join(ROOT, "src/ui/portfolio.ts"), "utf8"))
    .toContain("Math.abs(codex.index - claude.index)");
});

test("the local hero states an estimate, not a ceiling above its own band", () => {
  expect(html[join(ROOT, "local.html")]).toContain("can run at about");
});

test("Gate owns five files, and every page says so", () => {
  expect(html[join(ROOT, "gate.html")]).toContain("Five files, no secrets");
  expect(html[join(ROOT, "docs", "cli.html")]).toContain("the five files it owns");
});
