/**
 * The OpenCode Go scraper against a saved copy of the docs page markup. The page
 * moved to `opencode.ai/v2/docs/console/go` in October 2026 and changed shape
 * twice over in the process, so the parser's contract is pinned here rather than
 * rediscovered: a row the page publishes an ambiguous number for is a failure,
 * never a guess.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fetchOpenCodeFrom } from "../scripts/sources/opencode.mjs";

const page = readFileSync(join(__dirname, "fixtures", "opencode-go.html"), "utf8");

test("both tiers parse, one row per model, keyed on the API's own slug", () => {
  const snapshot = fetchOpenCodeFrom(page);
  expect(Object.keys(snapshot.plans).sort()).toEqual(["go", "go-plus"]);

  for (const [plan, tier] of Object.entries(snapshot.plans)) {
    expect(tier.models, plan).toHaveLength(32);
    expect(new Set(tier.models.map(m => m.slug)).size, plan).toBe(32);
    // Every rationed row carries both a dollar cap and a request estimate; the
    // three promotional rows carry neither and are marked unlimited instead.
    const rationed = tier.models.filter(m => !m.unlimited);
    for (const model of rationed) {
      expect(model.usdPerMonth, plan).toBeGreaterThan(0);
      expect(model.requestsPerMonth, plan).toBeGreaterThan(0);
    }
    expect(tier.models.filter(m => m.unlimited), plan).toHaveLength(3);
  }
});

test("the plans are read apart, not as two documents in one", () => {
  const { go, "go-plus": goPlus } = fetchOpenCodeFrom(page).plans;
  // Same model, different tier — the figures must not leak between the panels.
  expect(go.models.find(m => m.slug === "glm-5.2")!.usdPerMonth).toBe(60);
  expect(goPlus.models.find(m => m.slug === "glm-5.2")!.usdPerMonth).toBe(180);
  expect(go.models.find(m => m.slug === "kimi-k3")!.usdPerMonth).toBe(15);
  expect(goPlus.models.find(m => m.slug === "kimi-k3")!.usdPerMonth).toBe(60);
  // The two tiers' prices are the plan page's own, not derived.
  expect(go.price).toBe(10);
  expect(goPlus.price).toBe(40);
});

test("a context- or peak-split price row joins the one request row it belongs to", () => {
  // The price table splits these into variants; the request table lists each
  // model once. The join must land on one row with both figures present.
  const go = fetchOpenCodeFrom(page).plans.go;
  for (const slug of ["qwen3.7-plus", "deepseek-v4-pro", "gpt-5.6-luna", "grok-4.6"]) {
    const model = go.models.find(m => m.slug === slug)!;
    expect(model, slug).toBeDefined();
    expect(model.usdPerMonth, slug).toBeGreaterThan(0);
    expect(model.requestsPerMonth, slug).toBeGreaterThan(0);
  }
});

test("a promotional cap reads as the figure the page applies, never the struck-through one", () => {
  const gemini = fetchOpenCodeFrom(page).plans.go.models.find(m => m.slug === "gemini-4-argon-contributor")!;
  // The cell renders "$30" struck through, "$60" in strong, and a "2x · Limited
  // time" badge. The list price must never win.
  expect(gemini.usdPerMonth).toBe(60);
  expect(gemini.requestsPer5h).toBe(440);
  expect(gemini.requestsPerMonth).toBe(2120);
});

test("an unlimited promotional row is a word, not a number", () => {
  const free = fetchOpenCodeFrom(page).plans.go.models.filter(m => m.unlimited);
  expect(free.map(m => m.slug)).toEqual(["cat-jam-free", "longcat-2.5-preview-free", "step-5-preview-free"]);
  for (const model of free) {
    expect(model.usdPerMonth).toBeNull();
    expect(model.requestsPerMonth).toBeNull();
  }
});

test("a tier that disappears from the page fails closed", () => {
  // Renaming the panel attribute leaves the tier's tables unattributable, so the
  // parse refuses rather than crediting Go Plus's figures to Go.
  expect(() => fetchOpenCodeFrom(page.replace('data-plan-panel="go-plus"', 'data-plan-x="go-plus"')))
    .toThrow(/go-plus holds 0 price tables/);
});

test("a moved column fails closed rather than reading the wrong cell", () => {
  expect(() => fetchOpenCodeFrom(page.replace("Monthly limit", "Monthly ceiling")))
    .toThrow(/a column moved/);
  expect(() => fetchOpenCodeFrom(page.replace("Requests per 5 hours", "Requests every 5 hours")))
    .toThrow(/a column moved/);
  // Swapping one price table's columns is the subtler version: the header no
  // longer matches any signature, so nothing is read from it at all.
  const swapped = page.replace("<th>Cached Write</th><th>Monthly limit</th>", "<th>Monthly limit</th><th>Cached Write</th>");
  expect(() => fetchOpenCodeFrom(swapped)).toThrow(/price tables|column moved/);
});

test("a roster that loses its price rows fails closed", () => {
  // Every model the request roster names must carry a price row; the parse refuses
  // rather than recording a null cap for a model the page does price. Which
  // guard fires first is an implementation detail — refusing is the contract.
  const unpriced = page.replace(/<td><strong>(\$\d+)<\/strong><\/td>/g, "<td><strong>—</strong></td>");
  expect(() => fetchOpenCodeFrom(unpriced)).toThrow(/rationed models|no price row|cannot read/);
});

test("the failure messages name the page, so a human knows where to look", () => {
  expect(() => fetchOpenCodeFrom("<html>nothing here</html>")).toThrow(/the page moved/);
});
