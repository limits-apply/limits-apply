/**
 * Every local figure resolved through the ladder, so no cell on the throughput
 * table is blank and none is unlabelled.
 *
 * This is the only place the silicon, the model tier and the measurements meet
 * `lib/throughput.ts` — the local page's `estimates.ts`. A cell is filled here or
 * it is not filled at all; the page reads the result and never re-derives it.
 */
import type { Estimate } from "../../lib/provenance";
import {
  type Fit, type FitLevel, type QuantKey,
  QUANTS, fitEfficiency, fitLevel, footprint, throughput, weights,
} from "../../lib/throughput";
import type { LocalModel } from "../local-models";
import { MEASUREMENTS, MEASUREMENTS_VERIFIED } from "../local-measurements";
import { chipFor, chipLabel } from "../silicon";

/** The measurements, with each chip's published bandwidth attached. */
const SAMPLES = MEASUREMENTS.map(measurement => ({
  bandwidth: chipFor(measurement.chip).bandwidth.value,
  params: measurement.params,
  active: measurement.active,
  bits: QUANTS[measurement.quant].bits,
  tokensPerSecond: measurement.tokensPerSecond,
}));

/** Both constants, fitted — never asserted. */
export const LOCAL_FIT: Fit = fitEfficiency(SAMPLES);

/** Distinct sources behind the fit, for the cells that rest on it. */
const FIT_SOURCES = [...new Set(MEASUREMENTS.map(measurement => measurement.source))];

export interface LocalRow {
  model: LocalModel;
  /** Bytes that must be held in unified memory. */
  footprint: number;
  /** Tokens per second. */
  speed: Estimate;
  /** How it sits in the memory the reader said they have. */
  fit: FitLevel;
}

/** One row per model at the selected chip, quantisation and installed memory. */
export function localRows(chipId: string, quant: QuantKey, ram: number, models: LocalModel[]): LocalRow[] {
  const chip = chipFor(chipId);
  const bits = QUANTS[quant].bits;
  return models
    .map(model => {
      const reports = MEASUREMENTS.filter(one =>
        one.chip === chipId && one.weightsKey === model.weightsKey && one.quant === quant);
      const resolved = throughput(
        { bandwidth: chip.bandwidth, rung: chip.rung, label: chipLabel(chip) },
        model,
        bits,
        LOCAL_FIT,
        reports.map(one => one.tokensPerSecond),
      );
      const held = footprint(weights(model.params, bits));
      return {
        model,
        footprint: held,
        fit: fitLevel(held, ram),
        speed: {
          ...resolved.band,
          rung: resolved.rung,
          formula: resolved.formula,
          assumptions: [
            ...resolved.assumptions,
            `${chipLabel(chip)} — ${chip.bandwidth.value} GB/s, as Apple publishes it`,
          ],
          source: reports[0]?.source ?? FIT_SOURCES[0],
          verified: MEASUREMENTS_VERIFIED,
        },
      };
    })
    .sort((a, b) => b.speed.value - a.speed.value);
}
