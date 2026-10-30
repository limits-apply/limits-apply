import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

import {
  FREE_CHECKED_ON, FREE_OFFERS, USAGE_FILTERS, freeByUsage, narrowFreeOffer,
  type RawFreeOffer,
} from "../src/data/free";
import { filterOffers } from "../src/ui/free-page";

const ROOT = join(__dirname, "..");
const RAW = JSON.parse(readFileSync(join(ROOT, "src", "data", "free-offers.json"), "utf8")) as RawFreeOffer[];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

test("the catalogue holds at least six free offers, each priced at $0", () => {
  expect(FREE_OFFERS.length).toBeGreaterThanOrEqual(6);
  for (const offer of FREE_OFFERS) expect(offer.price).toBe(0);
});

test("every offer id is unique", () => {
  const ids = FREE_OFFERS.map(offer => offer.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("every offer carries an https source and an ISO checked date", () => {
  for (const offer of FREE_OFFERS) {
    expect(offer.source.url, `${offer.id} has no https source`).toMatch(/^https:\/\//);
    expect(offer.source.checkedAt, `${offer.id} has a non-ISO checkedAt`).toMatch(ISO_DATE);
    if (offer.source.publishedAt != null) expect(offer.source.publishedAt).toMatch(ISO_DATE);
  }
  expect(FREE_CHECKED_ON).toBe(FREE_OFFERS.map(offer => offer.source.checkedAt).sort()[0]);
});

test("every limit is a non-negative amount or explicitly unknown", () => {
  for (const offer of FREE_OFFERS) {
    expect(offer.limits.length, `${offer.id} has no limit row`).toBeGreaterThan(0);
    for (const limit of offer.limits) {
      if (limit.amount === null) {
        expect(limit.note, `${offer.id} / ${limit.metric} is unknown without a note`).toBeTruthy();
      } else {
        expect(limit.amount, `${offer.id} / ${limit.metric} is negative`).toBeGreaterThanOrEqual(0);
      }
    }
  }
});

test("a usage filter returns only offers tagged with that usage", () => {
  for (const filter of USAGE_FILTERS) {
    const rows = filterOffers(FREE_OFFERS, filter.id, "all");
    expect(rows.length, `no offer carries ${filter.id}`).toBeGreaterThan(0);
    for (const offer of rows) expect(offer.usage).toContain(filter.id);
    expect(freeByUsage(filter.id)).toEqual(rows);
  }
});

test("a region filter returns only offers present in that region", () => {
  for (const region of new Set(FREE_OFFERS.flatMap(offer => offer.regions))) {
    const rows = filterOffers(FREE_OFFERS, "all", region);
    expect(rows.length, `no offer is available in ${region}`).toBeGreaterThan(0);
    for (const offer of rows) expect(offer.regions).toContain(region);
  }
});

test("an unknown usage returns an empty list rather than every row", () => {
  expect(filterOffers(FREE_OFFERS, "unknown-usage", "all")).toEqual([]);
  expect(freeByUsage("unknown-usage")).toEqual([]);
});

test("the validator refuses a free offer that is not $0", () => {
  expect(() => narrowFreeOffer({ ...RAW[0], price: 1 })).toThrow(/price/);
});

test("the validator refuses an offer with a missing or non-https source", () => {
  expect(() => narrowFreeOffer({ ...RAW[0], source: undefined as unknown as RawFreeOffer["source"] }))
    .toThrow(/https|source/);
  expect(() => narrowFreeOffer({ ...RAW[0], source: { ...RAW[0].source, url: "http://example.com" } }))
    .toThrow(/https/);
});
