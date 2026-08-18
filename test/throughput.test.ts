import { expect, test } from "vitest";

import { LOCAL_FIT, localRows } from "../src/data/derived/local-estimates";
import { BEST_LOCAL_AA, LOCAL_AA_SNAPSHOT, LOCAL_MODELS } from "../src/data/local-models";
import { LOCAL_RELEASES, RELEASE_SNAPSHOT, releaseFor } from "../src/data/local-releases";
import { MEASUREMENTS } from "../src/data/local-measurements";
import { AA_SNAPSHOT } from "../src/data/aa";
import { CHIPS, chipFor, chipLabel } from "../src/data/silicon";
import { AMBIGUOUS_BINS, parseRenderer } from "../src/lib/silicon-detect";
import { isExact } from "../src/lib/provenance";
import {
  BYTES_PER_GB, FIT_FLOOR, QUANTS, QUANT_KEYS,
  bandwidthCeiling, fitEfficiency, footprint, tasksPerHour, throughput, weightedScore, weights,
} from "../src/lib/throughput";

/* ---------- the form ---------- */

test("weights and footprint refuse a non-positive input rather than returning Infinity", () => {
  expect(weights(27.8, 4.8)).toBeCloseTo(27.8e9 * 0.6, 3);
  expect(() => weights(0, 4.8)).toThrow();
  expect(() => weights(27.8, 0)).toThrow();
  expect(() => bandwidthCeiling(0, 1e9)).toThrow();
  expect(() => bandwidthCeiling(400, 0)).toThrow();
  expect(() => tasksPerHour({ value: 20, low: 18, high: 22 }, 0)).toThrow();
});

test("footprint is monotone in bits per parameter, and 8-bit never fits where 4-bit doesn't", () => {
  const budget = 48 * BYTES_PER_GB;
  for (const model of LOCAL_MODELS) {
    const sizes = QUANT_KEYS.map(key => footprint(weights(model.params, QUANTS[key].bits)));
    for (let i = 1; i < sizes.length; i++) expect(sizes[i], model.name).toBeGreaterThan(sizes[i - 1]);
    const q4 = footprint(weights(model.params, QUANTS.q4.bits));
    const q8 = footprint(weights(model.params, QUANTS.q8.bits));
    if (q4 > budget) expect(q8, model.name).toBeGreaterThan(budget);
  }
});

/* ---------- the fit ---------- */

/** The anchors the constants were actually fitted on, predicted back. */
const anchors = MEASUREMENTS
  .filter(one => one.active != null || weights(one.params, QUANTS[one.quant].bits) >= FIT_FLOOR)
  .map(one => {
    const chip = chipFor(one.chip);
    const bits = QUANTS[one.quant].bits;
    return {
      one,
      predicted: throughput(
        { bandwidth: chip.bandwidth, rung: chip.rung, label: chipLabel(chip) },
        { params: one.params, active: one.active },
        bits,
        LOCAL_FIT,
      ).band,
    };
  });

test("the fitted band contains every anchor it was fitted on", () => {
  for (const { one, predicted } of anchors) {
    const where = `${one.model} ${one.quant} ${one.runtime} on ${one.chip}`;
    expect(predicted.low, where).toBeLessThanOrEqual(one.tokensPerSecond);
    expect(predicted.high, where).toBeGreaterThanOrEqual(one.tokensPerSecond);
    expect(predicted.low).toBeLessThanOrEqual(predicted.value);
    expect(predicted.high).toBeGreaterThanOrEqual(predicted.value);
  }
});

test("the dense form reproduces its own anchors within 15 %", () => {
  const dense = anchors.filter(({ one }) => one.active == null);
  expect(dense.length).toBeGreaterThan(1);
  for (const { one, predicted } of dense) {
    expect(Math.abs(predicted.value - one.tokensPerSecond) / one.tokensPerSecond, one.model)
      .toBeLessThan(0.15);
  }
});

/**
 * The two runs of one configuration that differ only in which app was launched.
 * The fit cannot be inside 15 % of both, and pretending otherwise would hide the
 * finding: runtime choice moves throughput further than the model's own error.
 */
test("runtime choice moves a mixture-of-experts further than the fit's own precision", () => {
  const same = MEASUREMENTS.filter(one =>
    one.chip === "m4max40" && one.weightsKey === "qwen3.5-35b-a3b" && one.quant === "q4");
  expect(same).toHaveLength(2);
  const [fast, slow] = [...same].sort((a, b) => b.tokensPerSecond - a.tokensPerSecond);
  expect(fast.runtime).toBe("llama.cpp");
  expect(fast.tokensPerSecond / slow.tokensPerSecond).toBeGreaterThan(1.5);
});

test("a constant fitted on one point is widened, never returned exact", () => {
  const one = fitEfficiency([
    { bandwidth: 400, params: 30, active: null, bits: 4.8, tokensPerSecond: 16 },
    { bandwidth: 400, params: 30, active: 3, bits: 4.8, tokensPerSecond: 60 },
  ]);
  expect(isExact(one.dense)).toBe(false);
  expect(isExact(one.moe)).toBe(false);
  expect(one.denseThin).toBe(true);
  expect(one.moeThin).toBe(true);
});

test("a fit with no anchor above the floor throws rather than inventing a constant", () => {
  expect(() => fitEfficiency([
    { bandwidth: 400, params: 4, active: null, bits: 4.8, tokensPerSecond: 70 },
  ])).toThrow();
  expect(() => fitEfficiency([
    { bandwidth: 400, params: 30, active: null, bits: 4.8, tokensPerSecond: 16 },
  ])).toThrow();
});

/* ---------- the fit applied to the real data ---------- */

test("every model resolves to a throughput band on every chip, at every quantisation", () => {
  for (const chip of CHIPS) {
    for (const quant of QUANT_KEYS) {
      const rows = localRows(chip.id, quant, 128, LOCAL_MODELS);
      expect(rows, `${chip.id} ${quant}`).toHaveLength(LOCAL_MODELS.length);
      for (const { model, speed, footprint: held } of rows) {
        expect(speed.value, `${model.name} on ${chip.id}`).toBeGreaterThan(0);
        expect(speed.low).toBeLessThanOrEqual(speed.value);
        expect(speed.high).toBeGreaterThanOrEqual(speed.value);
        expect(held).toBeGreaterThan(0);
        expect(speed.formula).toBeTruthy();
        expect(speed.assumptions.length).toBeGreaterThan(0);
      }
    }
  }
});

test("no modelled band is degenerate, and every observed one names a source and a date", () => {
  for (const chip of CHIPS) {
    for (const { model, speed } of localRows(chip.id, "q4", 128, LOCAL_MODELS)) {
      expect(isExact(speed), `${model.name} on ${chip.id}`).toBe(false);
      expect(speed.source, `${model.name} on ${chip.id}`).toMatch(/^https?:\/\//);
      expect(speed.verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  }
});

test("a published run outranks the fit on the chip it was run on", () => {
  const measured = localRows("m3max40", "q4", 128, LOCAL_MODELS)
    .filter(row => row.speed.rung === "observed");
  expect(measured.length).toBeGreaterThan(0);
  for (const row of measured) {
    expect(MEASUREMENTS.some(one =>
      one.chip === "m3max40" && one.weightsKey === row.model.weightsKey && one.quant === "q4")).toBe(true);
  }
  // A chip nobody has run this tier on gets no observed cell anywhere.
  expect(localRows("m5max40", "q4", 128, LOCAL_MODELS).every(row => row.speed.rung === "modelled")).toBe(true);
});

test("a mixture-of-experts row is never slower than a dense row of the same size", () => {
  const rows = localRows("m4max40", "q4", 512, LOCAL_MODELS);
  const dense = rows.filter(row => row.model.active == null);
  for (const moe of rows.filter(row => row.model.active != null)) {
    for (const one of dense) {
      if (one.model.params > moe.model.params) continue;
      expect(moe.speed.value, `${moe.model.name} vs ${one.model.name}`)
        .toBeGreaterThan(one.speed.value);
    }
  }
});

test("rows that exceed the memory budget stay on the table and stay marked", () => {
  const rows = localRows("m4max32", "q8", 36, LOCAL_MODELS);
  expect(rows).toHaveLength(LOCAL_MODELS.length);
  expect(rows.some(row => row.fit === "over")).toBe(true);
  expect(rows.every(row => (row.fit === "over") === (row.footprint > 36e9))).toBe(true);
});

test("a footprint over half the installed memory is half-fit, never a fit", () => {
  const rows = localRows("m4max32", "q4", 36, LOCAL_MODELS);
  expect(rows.some(row => row.fit === "half")).toBe(true);
  for (const row of rows) {
    expect(row.fit, `${row.model.name} at ${row.footprint / 1e9} GB`)
      .toBe(row.footprint > 36e9 ? "over" : row.footprint > 18e9 ? "half" : "full");
  }
});

/* ---------- the silicon ---------- */

test("every chip's memory options are non-empty and ascending", () => {
  for (const chip of CHIPS) {
    expect(chip.ram.length, chip.id).toBeGreaterThan(0);
    expect([...chip.ram].sort((a, b) => a - b), chip.id).toEqual(chip.ram);
    expect(chip.bandwidth.value, chip.id).toBeGreaterThan(0);
    expect(isExact(chip.bandwidth), chip.id).toBe(true);
    expect(chip.source, chip.id).toMatch(/^https?:\/\//);
  }
  expect(new Set(CHIPS.map(chip => chip.id)).size).toBe(CHIPS.length);
});

test("parseRenderer separates the two M4 Max bins and answers null for Safari", () => {
  const angle = (name: string) => `ANGLE (Apple, ANGLE Metal Renderer: Apple ${name}, Unspecified Version)`;
  expect(parseRenderer(angle("M4 Max"), 14)).toBe("m4max32");
  expect(parseRenderer(angle("M4 Max"), 16)).toBe("m4max40");
  expect(parseRenderer(angle("M3 Max"), 14)).toBe("m3max30");
  expect(parseRenderer(angle("M3 Max"), 16)).toBe("m3max40");
  expect(parseRenderer(angle("M4 Pro"), 14)).toBe("m4pro");
  expect(parseRenderer(angle("M5"), 10)).toBe("m5");
  expect(parseRenderer("Apple GPU", 16)).toBe(null);
  expect(parseRenderer("Apple M9 Max", 16)).toBe(null);
  expect(parseRenderer("", 16)).toBe(null);
});

test("a bin no browser can tell apart resolves downwards, and says which chips those are", () => {
  expect(AMBIGUOUS_BINS).toContain("M5 Max");
  const slower = parseRenderer("Apple M5 Max", 18)!;
  expect(chipFor(slower).bandwidth.value).toBe(460);
});

/* ---------- the tier ---------- */

test("the two pages share one index version, so the closing comparison is legitimate", () => {
  expect(LOCAL_AA_SNAPSHOT.version).toBe(AA_SNAPSHOT.version);
});

test("the tier stays inside the 4B–40B window it claims, and its ceiling is the best row", () => {
  for (const model of LOCAL_MODELS) {
    expect(model.params, model.name).toBeGreaterThanOrEqual(4);
    expect(model.params, model.name).toBeLessThanOrEqual(40);
    if (model.active != null) expect(model.active, model.name).toBeLessThan(model.params);
    expect(model.intelligence, model.name).toBeGreaterThan(0);
  }
  expect(BEST_LOCAL_AA).toBe(Math.max(...LOCAL_MODELS.map(model => model.intelligence)));
  expect(new Set(LOCAL_MODELS.map(model => model.key)).size).toBe(LOCAL_MODELS.length);
});

test("every measurement points at a chip that exists and a tier row where it claims one", () => {
  const keys = new Set(LOCAL_MODELS.map(model => model.weightsKey));
  for (const measurement of MEASUREMENTS) {
    expect(() => chipFor(measurement.chip)).not.toThrow();
    expect(QUANTS[measurement.quant], measurement.model).toBeTruthy();
    expect(measurement.tokensPerSecond, measurement.model).toBeGreaterThan(0);
    expect(measurement.source, measurement.model).toMatch(/^https?:\/\//);
    expect(measurement.verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    if (measurement.weightsKey) expect(keys, measurement.model).toContain(measurement.weightsKey);
  }
});

test("tasks per hour is the rate divided by the ledger's own task, and nothing more", () => {
  const hourly = tasksPerHour({ value: 20, low: 18, high: 22 }, 1500);
  expect(hourly.value).toBeCloseTo(48, 9);
  expect(hourly.low).toBeCloseTo(43.2, 9);
  expect(hourly.high).toBeCloseTo(52.8, 9);
});

/* ---------- the score ---------- */

const CEILING = { intelligence: 40, tokensPerSecond: 100 };
const band = (value: number) => ({ value, low: value * 0.8, high: value * 1.2 });

test("the factor is what it says: 0 ranks on the index alone, 1 on the tokens alone", () => {
  const smart = weightedScore(40, band(10), 0, CEILING);
  const quick = weightedScore(20, band(100), 0, CEILING);
  expect(smart.band.value).toBeGreaterThan(quick.band.value);
  expect(smart.band.value).toBeCloseTo(100, 9);

  expect(weightedScore(40, band(10), 1, CEILING).band.value)
    .toBeLessThan(weightedScore(20, band(100), 1, CEILING).band.value);
  expect(weightedScore(20, band(100), 1, CEILING).band.value).toBeCloseTo(100, 9);
});

test("a row leading both axes scores 100, and the band is the throughput band carried through", () => {
  const top = weightedScore(40, band(100), 0.5, CEILING);
  expect(top.band.value).toBeCloseTo(100, 9);
  expect(top.band.low).toBeLessThan(top.band.value);
  expect(top.band.high).toBeGreaterThan(top.band.value);
  expect(isExact(weightedScore(40, { value: 50, low: 50, high: 50 }, 0.5, CEILING).band)).toBe(true);
});

test("moving the factor moves the ranking monotonically, and never past its own endpoints", () => {
  const smart = (factor: number) => weightedScore(40, band(10), factor, CEILING).band.value;
  const quick = (factor: number) => weightedScore(20, band(100), factor, CEILING).band.value;
  let previous = Infinity;
  for (const factor of [0, 0.25, 0.5, 0.75, 1]) {
    const gap = smart(factor) - quick(factor);
    expect(gap, `factor ${factor}`).toBeLessThan(previous);
    previous = gap;
  }
  expect(smart(0.5)).toBeLessThan(smart(0));
  expect(quick(0.5)).toBeGreaterThan(quick(0));
});

test("the score refuses a factor outside 0..1 and a ceiling that is not positive", () => {
  expect(() => weightedScore(40, band(10), 1.5, CEILING)).toThrow();
  expect(() => weightedScore(40, band(10), -0.1, CEILING)).toThrow();
  expect(() => weightedScore(40, band(10), 0.5, { intelligence: 0, tokensPerSecond: 100 })).toThrow();
  expect(() => weightedScore(40, band(10), 0.5, { intelligence: 40, tokensPerSecond: 0 })).toThrow();
});

test("on the real tier, planning tops out on the smartest row and building on a faster one", () => {
  const rows = localRows("m4max40", "q4", 48, LOCAL_MODELS);
  const ceiling = {
    intelligence: Math.max(...rows.map(row => row.model.intelligence)),
    tokensPerSecond: Math.max(...rows.map(row => row.speed.value)),
  };
  const top = (factor: number) => rows
    .map(row => ({ row, score: weightedScore(row.model.intelligence, row.speed, factor, ceiling) }))
    .sort((a, b) => b.score.band.value - a.score.band.value || b.row.speed.value - a.row.speed.value)[0]
    .row;

  expect(top(0).model.intelligence).toBe(BEST_LOCAL_AA);
  expect(top(0.5).speed.value).toBeGreaterThan(top(0).speed.value);
});

/* ---------- release dates and makers ---------- */

test("every model resolves to a release date and a maker, keyed on the weights and not the mode", () => {
  const icons = new Set(Object.keys(import.meta.glob("../public/icons/*.png"))
    .map(path => path.split("/").pop()!.slice(0, -4)));

  for (const model of LOCAL_MODELS) {
    const release = releaseFor(model);
    expect(release, model.name).toBeTruthy();
    expect(release!.on, model.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(icons, `${model.name} — ${release!.maker}`).toContain(release!.maker);
    if (release!.via === "catalogue") {
      expect(release!.agree[0], model.name).toBeGreaterThan(0);
      expect(release!.agree[0], model.name).toBeLessThanOrEqual(release!.agree[1]);
    }
  }

  for (const model of LOCAL_MODELS) {
    const sibling = LOCAL_MODELS.find(other =>
      other !== model && other.weightsKey === model.weightsKey);
    if (sibling) expect(releaseFor(sibling), model.name).toEqual(releaseFor(model));
  }

  expect(Object.keys(LOCAL_RELEASES).sort())
    .toEqual([...new Set(LOCAL_MODELS.map(model => model.weightsKey))].sort());
  expect(RELEASE_SNAPSHOT.verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
