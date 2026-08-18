import { expect, test } from "vitest";
import { parseOpencodeQuota, validateOpencodeQuota } from "../packages/sources/src/opencode-quota";
import { parseIntelligenceIndex, slugFor } from "../packages/sources/src/aa-intelligence";
import { mergeIntelligenceIndex, mergeOpencodeQuota } from "../packages/sources/src/merge-evidence";
import { isLocalizedPricing } from "../scripts/sources/pricing.mjs";

const OPENCODE_FIXTURE = `
<span data-item data-kind="go" data-model="deepseek-v4-pro"><span data-value>3,450</span><span data-name>DeepSeek V4 Pro</span></span>
<span data-item data-kind="go" data-model="deepseek-v4-flash"><span data-value>63,300</span><span data-name>DeepSeek V4 Flash</span><span data-bonus>2x usage</span></span>
<span data-item data-kind="promo" data-model="deepseek-v4-flash"><span data-value>999</span><span data-name>promo bar</span></span>
`;

test("parses plan rows, keeps post-bonus totals verbatim, skips promo bars, and doesn't leak a neighboring item's bonus", () => {
  const rows = validateOpencodeQuota(parseOpencodeQuota(OPENCODE_FIXTURE, "go"), 2);
  expect(rows).toHaveLength(2);
  const flash = rows.find(row => row.model === "deepseek-v4-flash");
  expect(flash?.requestsPerWindow).toBe(63300);
  expect(flash?.bonusIsPromotional).toBe(true);
  expect(flash?.displayName).toBe("DeepSeek V4 Flash");
  // pro immediately precedes bonused flash in the markup: a too-wide segment
  // boundary would steal flash's data-bonus and wrongly flag pro as promotional.
  const pro = rows.find(row => row.model === "deepseek-v4-pro");
  expect(pro?.bonusIsPromotional).toBe(false);
  expect(pro?.bonusLabel).toBeNull();
  expect(pro?.requestsPerWindow).toBe(3450);
});

test("a wrong row count fails validation instead of writing a partial ledger", () => {
  expect(() => validateOpencodeQuota(parseOpencodeQuota(OPENCODE_FIXTURE, "go"), 5)).toThrow(/expected 5 rows, got 2/);
});

test("a duplicate model fails validation", () => {
  const duplicated = `${OPENCODE_FIXTURE}\n<span data-item data-kind="go" data-model="deepseek-v4-flash"><span data-value>1</span></span>`;
  expect(() => validateOpencodeQuota(parseOpencodeQuota(duplicated, "go"), 3)).toThrow(/duplicate/);
});

const aaFixture = (name: string, score: number, prose = `${name} scores ${score} on the Artificial Analysis Intelligence Index.`) =>
  `<span>${score}</span></div><div class="foo">Artificial Analysis Intelligence Index</div><p>${prose}</p>`;

test("both witnesses agree and the variant label survives", () => {
  const reading = parseIntelligenceIndex(aaFixture("Kimi K3 (max)", 60), "kimi-k3");
  expect(reading).toEqual({ index: 60, variant: "Kimi K3 (max)" });
});

test("a page missing the index entirely is refused", () => {
  expect(() => parseIntelligenceIndex("<html>nothing here</html>", "x")).toThrow(/changed their markup/);
});

test("one witness alone is refused", () => {
  const headlineOnly = "<span>99</span></div><div class=\"x\">Artificial Analysis Intelligence Index";
  expect(() => parseIntelligenceIndex(headlineOnly, "x")).toThrow(/single witness/);
});

test("disagreeing witnesses are refused rather than guessed", () => {
  const mixed = aaFixture("Kimi K3 (max)", 60, "Kimi K3 (max) scores 57 on the Artificial Analysis Intelligence Index.");
  expect(() => parseIntelligenceIndex(mixed, "kimi-k3")).toThrow(/headline says 60, prose says 57/);
});

test("slug rule: dots become hyphens, aa_slug overrides", () => {
  expect(slugFor("glm-5.2")).toBe("glm-5-2");
  expect(slugFor("mimo-v2.5", "mimo-v2-5-0424")).toBe("mimo-v2-5-0424");
});

test("mergeOpencodeQuota only touches the fields the scraper owns", () => {
  const curated = [{ model: "deepseek-v4-flash", notes: "keep me", provider: "opencode-go" }];
  const quota = [{ model: "deepseek-v4-flash", displayName: "DeepSeek V4 Flash", requestsPerWindow: 63300, bonusIsPromotional: true, bonusLabel: "2x usage" }];
  const merged = mergeOpencodeQuota(curated, quota);
  expect(merged[0]).toMatchObject({ notes: "keep me", provider: "opencode-go", requestsPerWindow: 63300, bonusIsPromotional: true });
});

test("mergeOpencodeQuota leaves rows with no matching scrape untouched", () => {
  const curated = [{ model: "unscraped-model", notes: "keep me" }];
  const merged = mergeOpencodeQuota(curated, []);
  expect(merged[0]).toEqual({ model: "unscraped-model", notes: "keep me" });
});

test("mergeIntelligenceIndex keys by aa_slug when present, else by model", () => {
  const curated = [{ model: "mimo-v2.5", aaSlug: "mimo-v2-5-0424", notes: "keep me" }];
  const readings = new Map([["mimo-v2-5-0424", { index: 60, variant: "Mimo V2.5" }]]);
  const merged = mergeIntelligenceIndex(curated, readings);
  expect(merged[0]).toMatchObject({ notes: "keep me", intelligenceIndex: 60, intelligenceVariant: "Mimo V2.5" });
});

test("mergeIntelligenceIndex applies slugFor's dot-to-hyphen rule when no aa_slug is set", () => {
  const curated = [{ model: "glm-5.2", notes: "keep me" }];
  const readings = new Map([["glm-5-2", { index: 70, variant: "GLM 5.2" }]]);
  const merged = mergeIntelligenceIndex(curated, readings);
  expect(merged[0]).toMatchObject({ notes: "keep me", intelligenceIndex: 70, intelligenceVariant: "GLM 5.2" });
});

test("a pricing page rendered in another currency is blocked, never reported as changed", () => {
  // Tags become spaces, so a symbol and its amount arrive separated: "€  21,99".
  expect(isLocalizedPricing(" gemini advanced €  21,99 / mois ")).toBe(true);
  expect(isLocalizedPricing(" google ai pro $19.99 / month ")).toBe(false);
  // A page quoting both still shows the USD figure, so it stays checkable.
  expect(isLocalizedPricing(" $19.99 or €21,99 ")).toBe(false);
  expect(isLocalizedPricing(" starting at just 18 usd ")).toBe(false);
  // No prices at all is a different failure — length and figure checks own it.
  expect(isLocalizedPricing(" usage limits apply ")).toBe(false);
});
