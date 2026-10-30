import { expect, test } from "vitest";
import { catalogFromPage, summarizeCatalog } from "../scripts/sources/aa-catalog.mjs";
import { CATALOG_MODELS, CATALOG_TOTAL, CATALOG_VERIFIED, MAPPED_CATALOG_COUNT, UNMAPPED_CATALOG } from "../src/data/aa-catalog";
import { MAPPED_AA_SLUGS } from "../src/data/aa";

const records = [
  { id: "1", slug: "alpha", name: "Alpha", intelligenceIndex: 61.2 },
  { id: "2", slug: "beta", name: "Beta", intelligenceIndex: 72.4 },
  { id: "3", slug: "gamma", intelligenceIndex: 55 },
  { id: "4", slug: "alpha", name: "Alpha duplicate", intelligenceIndex: 61.2 },
  { id: "5", slug: "evaluation-only", name: "Evaluation only" },
];

const pageWith = (values: object[]) => {
  const stream = values.map(value => JSON.stringify(value)).join("");
  return `<script>self.__next_f.push([1,${JSON.stringify(stream)}])</script>`;
};

test("extracts scored records, excludes evaluations, dedupes by slug and sorts by index", () => {
  const catalog = catalogFromPage(pageWith(records));
  expect(catalog.source_url).toBe("https://artificialanalysis.ai/models");
  expect(catalog.models).toEqual([
    { slug: "beta", name: "Beta", intelligence: 72.4 },
    { slug: "alpha", name: "Alpha", intelligence: 61.2 },
    { slug: "gamma", name: "gamma", intelligence: 55 },
  ]);
  expect(catalog.models.some(model => model.slug === "evaluation-only")).toBe(false);
  expect(summarizeCatalog(catalog)).toContain("3 scored models");
});

test("a page with no data stream throws instead of writing an empty catalogue", () => {
  expect(() => catalogFromPage("<html>nothing here</html>")).toThrow(/no rendered page/);
});

test("a stream with no scored records throws", () => {
  expect(() => catalogFromPage(pageWith([{ id: "1", slug: "evaluation-only", name: "Evaluation only" }])))
    .toThrow(/no scored model records/);
});

test("the registry is exactly the catalogue minus the mapped slugs", () => {
  const expected = CATALOG_MODELS.filter(model => !MAPPED_AA_SLUGS.includes(model.slug));
  expect(UNMAPPED_CATALOG).toEqual(expected);
  expect(MAPPED_CATALOG_COUNT).toBe(CATALOG_TOTAL - UNMAPPED_CATALOG.length);
  expect(CATALOG_VERIFIED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(CATALOG_TOTAL).toBeGreaterThanOrEqual(50);
});

test("every mapped slug exists in the catalogue snapshot", () => {
  const slugs = new Set(CATALOG_MODELS.map(model => model.slug));
  const missing = MAPPED_AA_SLUGS.filter(slug => !slugs.has(slug));
  expect(missing).toEqual([]);
});
