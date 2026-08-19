/**
 * The third-party review register against the repository it claims to describe. A
 * clearance document that has drifted from what actually ships is worse than none:
 * it reads as "reviewed" for a file nobody reviewed. Same discipline as
 * `test/prose.test.ts` — the prose is checked against the thing it restates.
 */
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { expect, test } from "vitest";

const ROOT = join(__dirname, "..");
const register = readFileSync(join(ROOT, "docs", "third-party-review.md"), "utf8");

/** Every path or filename the register prints in backticks. */
const CITED = new Set([...register.matchAll(/`([^`]+)`/g)].map(match => match[1]));

/**
 * `data/` holds nothing but third-party payloads, so the register must cite all of it.
 * `src/data/plans.json` is ours but quotes provider material, so it is cited too — the
 * one file on the src side that needs an entry.
 */
const snapshots = Object.keys(import.meta.glob("../data/*.json")).map(path => `data/${basename(path)}`);
const dataFiles = [...snapshots, "src/data/plans.json"];
const icons = Object.keys(import.meta.glob("../src/assets/icons/*.png")).map(path => basename(path));

test("every bundled data snapshot has a row in the register", () => {
  expect(snapshots.length).toBeGreaterThan(0);
  for (const file of dataFiles) expect(CITED, file).toContain(file);
});

test("every provider icon is named in the register", () => {
  expect(icons.length).toBeGreaterThan(0);
  for (const icon of icons) expect(CITED, icon).toContain(icon);
});

test("the register names no file that has since been removed", () => {
  const onDisk = new Set([...dataFiles, ...icons]);
  // Filenames only — the register also backticks bare directories like `data/`.
  const stale = [...CITED].filter(cited => /\.(json|png)$/.test(cited) && !onDisk.has(cited));
  expect(stale).toEqual([]);
});

test("the register defines every status it uses, so no verdict is left to the reader", () => {
  const defined = ["Cleared", "Review pending", "Review per row", "Blocked"]
    .filter(status => register.includes(`| **${status}** |`) || register.includes(`| **${status}** `));
  expect(defined).toEqual(["Cleared", "Review pending", "Review per row", "Blocked"]);

  // Used in a table cell or as the icons heading, minus the legend's own rows.
  const used = new Set([...register.matchAll(/\| (?:\*\*)?(Cleared|Review pending|Review per row|Blocked)(?:\*\*)? \|/g)]
    .map(match => match[1]));
  for (const status of used) expect(defined).toContain(status);
});

test("THIRD_PARTY.md defers to the register instead of carrying its own verdicts", () => {
  const thirdParty = readFileSync(join(ROOT, "THIRD_PARTY.md"), "utf8");
  expect(thirdParty).toContain("docs/third-party-review.md");
  // The two disagreed once — THIRD_PARTY.md called a file blocked that the register
  // lists as review pending. One authority, so status words stay out of this file.
  expect(thirdParty).not.toMatch(/\bblocked\b/i);
});
