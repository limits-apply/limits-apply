/**
 * Local generation throughput. A subscription's ceiling is a policy nobody
 * publishes; a machine's ceiling is arithmetic — generation reads every active
 * parameter once per token, so tok/s ≈ bandwidth × efficiency ÷ active bytes.
 *
 * The two constants in that form are *fitted on published measurements*, the way
 * `fitAllowanceMultiple` fits the disclosed exchange rate. Nothing here asserts a
 * number. Pure functions only — no DOM, no data.
 */
import {
  type Band, type Rung,
  THIN_SAMPLE, THIN_SPREAD, quantiles, weakest, widenIfDegenerate,
} from "./provenance";

export const BYTES_PER_GB = 1e9;

/** Bits per parameter each GGUF format actually costs, embeddings included. */
export const QUANTS = {
  q2: { label: "Q2_K_XL", bits: 2.8 },
  q4: { label: "Q4_K_M", bits: 4.8 },
  q6: { label: "Q6_K", bits: 6.6 },
  q8: { label: "Q8_0", bits: 8.5 },
  bf16: { label: "BF16", bits: 16 },
} as const;

export type QuantKey = keyof typeof QUANTS;
export const QUANT_KEYS = Object.keys(QUANTS) as QuantKey[];

/** Bytes of weights for a parameter count in billions. */
export function weights(params: number, bits: number): number {
  if (!(params > 0)) throw new Error(`weights needs a positive parameter count, got ${params}`);
  if (!(bits > 0)) throw new Error(`weights needs a positive bit width, got ${bits}`);
  return (params * BYTES_PER_GB * bits) / 8;
}

/**
 * What must fit in unified memory: the weights plus room for the KV cache,
 * activations and the runtime itself. A flat allowance, because the real figure
 * depends on the context length the reader chooses and nobody publishes theirs.
 */
export const KV_ALLOWANCE = 1.2;
export const footprint = (weightBytes: number): number => weightBytes * KV_ALLOWANCE;

/**
 * The share of installed memory a model may take and still be called a fit. The
 * rest of the machine stays resident — window server, browser, editor — and a
 * footprint above this share loads only on an idle Mac with nothing else open.
 */
export const USABLE_SHARE = 0.5;

export type FitLevel = "full" | "half" | "over";

/** Full below the usable share, half up to installed memory, over beyond it. */
export function fitLevel(footprintBytes: number, ramGB: number): FitLevel {
  const installed = ramGB * BYTES_PER_GB;
  if (footprintBytes > installed) return "over";
  return footprintBytes > installed * USABLE_SHARE ? "half" : "full";
}

/**
 * Below this many bytes of weights a fixed per-token cost dominates and the
 * bandwidth form overstates the machine — the same reason the ledger fits its
 * exchange rate per billing class rather than once across the market. The dense
 * constant is fitted only above it, and a row below it says so.
 */
export const FIT_FLOOR = 8 * BYTES_PER_GB;

/** The theoretical ceiling: bandwidth ÷ bytes read per token. */
export function bandwidthCeiling(bandwidthGBs: number, bytesPerToken: number): number {
  if (!(bandwidthGBs > 0)) throw new Error(`bandwidthCeiling needs a positive bandwidth, got ${bandwidthGBs}`);
  if (!(bytesPerToken > 0)) throw new Error(`bandwidthCeiling needs positive bytes, got ${bytesPerToken}`);
  return (bandwidthGBs * BYTES_PER_GB) / bytesPerToken;
}

export interface Sample {
  bandwidth: number;
  params: number;
  active: number | null;
  bits: number;
  tokensPerSecond: number;
}

export interface Fit {
  /** Share of the theoretical ceiling a dense model reaches. */
  dense: Band;
  /** What a mixture-of-experts returns of what its active weights alone promise. */
  moe: Band;
  denseN: number;
  moeN: number;
  denseThin: boolean;
  moeThin: boolean;
}

/**
 * The residual spread: min to max, not the interquartile range. A dozen runs
 * split across two runtimes and two expert ratios is a spread, not a
 * distribution, and an IQR over it would exclude the very measurements the
 * constant was fitted on — a modelled band that does not contain its own anchor
 * is the failure this whole module exists to prevent. Below `THIN_SAMPLE` even
 * min/max is a coincidence, so it is widened the way the ladder widens everywhere.
 */
function spread(ratios: number[]): { band: Band; thin: boolean } {
  const fit = quantiles(ratios);
  const thin = fit.n < THIN_SAMPLE;
  return {
    thin,
    band: widenIfDegenerate({
      value: fit.median,
      low: Math.min(...ratios) / (thin ? THIN_SPREAD : 1),
      high: Math.max(...ratios) * (thin ? THIN_SPREAD : 1),
    }),
  };
}

/**
 * Solve the dense efficiency and the MoE penalty from the measurements, and
 * return each as a band whose width is the residual spread. A constant fitted on
 * one point is not exact, so `widenIfDegenerate` applies here as everywhere.
 */
export function fitEfficiency(samples: Sample[]): Fit {
  const dense = samples.filter(sample =>
    sample.active == null && weights(sample.params, sample.bits) >= FIT_FLOOR);
  if (!dense.length) throw new Error("no dense measurement sits above FIT_FLOOR — nothing to fit");

  const denseFit = spread(dense.map(sample =>
    sample.tokensPerSecond / bandwidthCeiling(sample.bandwidth, weights(sample.params, sample.bits))));

  const moe = samples.filter(sample => sample.active != null);
  if (!moe.length) throw new Error("no mixture-of-experts measurement — the penalty cannot be fitted");

  const moeFit = spread(moe.map(sample =>
    sample.tokensPerSecond
    / (bandwidthCeiling(sample.bandwidth, weights(sample.active!, sample.bits)) * denseFit.band.value)));

  return {
    dense: denseFit.band,
    moe: moeFit.band,
    denseN: dense.length,
    moeN: moe.length,
    denseThin: denseFit.thin,
    moeThin: moeFit.thin,
  };
}

export interface Throughput {
  /** Tokens per second. */
  band: Band;
  rung: Rung;
  formula: string;
  assumptions: string[];
}

const round = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
const gb = (bytes: number) => `${round(bytes / BYTES_PER_GB)} GB`;

/**
 * One cell. `observed` where somebody published a run of exactly this weights
 * file on exactly this chip at exactly this quantisation, `modelled` otherwise —
 * and never stronger than the rung the chip's own bandwidth stands on.
 */
export function throughput(
  chip: { bandwidth: Band; rung: Rung; label: string },
  model: { params: number; active: number | null },
  bits: number,
  fit: Fit,
  reports: number[] = [],
): Throughput {
  const held = weights(model.params, bits);
  const read = model.active == null ? held : weights(model.active, bits);
  const ceiling = bandwidthCeiling(chip.bandwidth.value, read);

  if (reports.length) {
    const band = widenIfDegenerate({
      value: reports.reduce((sum, one) => sum + one, 0) / reports.length,
      low: Math.min(...reports),
      high: Math.max(...reports),
    });
    return {
      band,
      rung: weakest(chip.rung, "observed"),
      formula: reports.length === 1
        ? `${round(reports[0])} tok/s, as published`
        : `${reports.length} published runs: ${reports.map(round).join(", ")} tok/s`,
      assumptions: [
        `measured on ${chip.label}, not fitted`,
        ...(reports.length === 1
          ? [`a single report carries no range, so the band is widened ×${THIN_SPREAD} either side`]
          : ["the range is what the published runs disagree about — mostly which runtime was launched"]),
      ],
    };
  }

  const penalty = model.active == null ? null : fit.moe;
  const efficiency = penalty
    ? { value: fit.dense.value * penalty.value, low: fit.dense.low * penalty.low, high: fit.dense.high * penalty.high }
    : fit.dense;

  const band = {
    value: ceiling * efficiency.value,
    low: ceiling * efficiency.low,
    high: ceiling * efficiency.high,
  };
  const thin = read < FIT_FLOOR && model.active == null;

  return {
    band: thin ? { value: band.value, low: band.low / THIN_SPREAD, high: band.high } : band,
    rung: weakest(chip.rung, "modelled"),
    formula: `${round(chip.bandwidth.value)} GB/s ÷ ${gb(read)} × ${round(efficiency.value * 100)} %`
      + ` = ${round(band.value)} tok/s`,
    assumptions: [
      `generation reads every active parameter once per token — ${gb(read)} of ${gb(held)} held`,
      `dense fit: ${round(fit.dense.value * 100)} % of the bandwidth ceiling,`
        + ` band ${round(fit.dense.low * 100)}–${round(fit.dense.high * 100)} % (n=${fit.denseN}${fit.denseThin ? ", thin sample — band widened" : ""})`,
      ...(penalty
        ? [`mixture-of-experts penalty: ×${round(penalty.value)} of what the active weights alone promise,`
          + ` band ×${round(penalty.low)}–×${round(penalty.high)} (n=${fit.moeN}${fit.moeThin ? ", thin sample — band widened" : ""})`,
          "routing and expert gather are fitted together, not separated — nobody publishes the split"]
        : []),
      ...(thin
        ? [`${gb(read)} of weights sits below the ${gb(FIT_FLOOR)} the constant was fitted above,`
          + " where a fixed per-token cost dominates — the low bound is widened, the figure still reads optimistic"]
        : []),
      "GGUF under llama.cpp or Ollama; MLX runs the same weights 1.5–2× faster and is not modelled here",
    ],
  };
}

export interface Weighted {
  /** 0 to 100, where 100 leads the tier on both axes at once. */
  band: Band;
  formula: string;
  assumptions: string[];
}

/**
 * Intelligence and throughput on one axis, because on this page neither alone
 * answers the question: the smartest model the machine holds may generate at
 * walking pace, and the fastest is the least able. The factor says which one the
 * reader is buying — 0 the index alone, 1 the tokens alone, 0.5 both equally.
 *
 * Geometric, and normalised by the strongest row on each axis, so no unit survives
 * into the score and a row cannot buy back a collapse on one axis with the other.
 * It is a preference applied to two Layer 1 figures, never a measurement of
 * anything: it ranks rows against each other and says nothing about a row alone.
 */
export function weightedScore(
  intelligence: number,
  tokensPerSecond: Band,
  factor: number,
  ceiling: { intelligence: number; tokensPerSecond: number },
): Weighted {
  if (!(factor >= 0 && factor <= 1)) throw new Error(`weightedScore needs a factor in 0..1, got ${factor}`);
  if (!(ceiling.intelligence > 0) || !(ceiling.tokensPerSecond > 0)) {
    throw new Error("weightedScore needs a positive ceiling on both axes");
  }

  const smart = intelligence / ceiling.intelligence;
  const at = (rate: number) => 100 * smart ** (1 - factor) * (rate / ceiling.tokensPerSecond) ** factor;

  return {
    band: {
      value: at(tokensPerSecond.value),
      low: at(tokensPerSecond.low),
      high: at(tokensPerSecond.high),
    },
    formula: `(${round(intelligence)} ÷ ${round(ceiling.intelligence)} index)^${(1 - factor).toFixed(2)}`
      + ` × (${round(tokensPerSecond.value)} ÷ ${round(ceiling.tokensPerSecond)} tok/s)^${factor.toFixed(2)}`
      + ` × 100 = ${round(at(tokensPerSecond.value))}`,
    assumptions: [
      factor === 0
        ? "the factor is 0: speed is ignored and the ranking is the index, whatever the machine does with it"
        : factor === 1
          ? "the factor is 1: intelligence is ignored and the ranking is tokens per second"
          : `the factor is ${factor.toFixed(2)}: a preference you set, not a measurement — every row is scored on the same one`,
      "each axis is divided by the best row in the tier, so the score is a rank within this table and"
        + " carries no unit that survives outside it",
      "the band is the throughput band carried through — the index has no band, the machine does",
    ],
  };
}

/** Tokens per second expressed in the ledger's own unit. A rate, never a month. */
export function tasksPerHour(tokensPerSecond: Band, outputTokensPerTask: number): Band {
  if (!(outputTokensPerTask > 0)) {
    throw new Error(`tasksPerHour needs a positive task size, got ${outputTokensPerTask}`);
  }
  const per = 3600 / outputTokensPerTask;
  return { value: tokensPerSecond.value * per, low: tokensPerSecond.low * per, high: tokensPerSecond.high * per };
}
