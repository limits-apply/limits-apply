/**
 * Published generation-throughput measurements. Somebody ran it and published the
 * trace — these are the page's only `observed` cells and the anchors every
 * `modelled` cell is fitted on.
 *
 * One runtime family only: GGUF under llama.cpp or its Ollama wrapper. MLX runs
 * the same weights on the same machine 1.5–2× faster, so mixing the two would
 * fit a constant that describes neither. The page says which runtime it models.
 */
import type { QuantKey } from "../lib/throughput";

export interface Measurement {
  chip: string;
  /** Model as the source names it. */
  model: string;
  /** The tier row this joins to, or null when the model is a fit anchor only. */
  weightsKey: string | null;
  /** Billions of parameters held. */
  params: number;
  /** Billions read per token; null means dense. */
  active: number | null;
  quant: QuantKey;
  runtime: string;
  tokensPerSecond: number;
  source: string;
  /** When the source was read. */
  verified: string;
}

export const MEASUREMENTS_VERIFIED = "2026-08-17";

const HIESCH = "https://hiesch.eu/blog/llamacpp-benchmarks-speculative-decoding/";
const KAPETANOVIC = "https://antekapetanovic.com/blog/qwen3.5-apple-silicon-benchmark/";

/**
 * Every M3 Max row below is one machine, one methodology, one post — 64 GB, three
 * runs per configuration, median reported. That is a strength for the fit and a
 * limit on it: the dense constant rests on a single reviewer's Mac.
 */
export const MEASUREMENTS: Measurement[] = [
  { chip: "m3max40", model: "Qwen3.6 27B",     weightsKey: "qwen3.6-27b",     params: 27.8, active: null, quant: "q4", runtime: "llama.cpp", tokensPerSecond: 17.3, source: HIESCH, verified: MEASUREMENTS_VERIFIED },
  { chip: "m3max40", model: "Qwen3.6 27B",     weightsKey: "qwen3.6-27b",     params: 27.8, active: null, quant: "q6", runtime: "llama.cpp", tokensPerSecond: 12.6, source: HIESCH, verified: MEASUREMENTS_VERIFIED },
  { chip: "m3max40", model: "Gemma 4 31B",     weightsKey: "gemma4-31b",      params: 30.7, active: null, quant: "q4", runtime: "llama.cpp", tokensPerSecond: 16.5, source: HIESCH, verified: MEASUREMENTS_VERIFIED },
  { chip: "m3max40", model: "Qwen3 32B",       weightsKey: null,              params: 32.8, active: null, quant: "q4", runtime: "llama.cpp", tokensPerSecond: 17.4, source: HIESCH, verified: MEASUREMENTS_VERIFIED },

  { chip: "m3max40", model: "Gemma 4 26B A4B", weightsKey: "gemma4-26b-a4b",  params: 25.2, active: 3.8,  quant: "q4", runtime: "llama.cpp", tokensPerSecond: 63.9, source: HIESCH, verified: MEASUREMENTS_VERIFIED },
  { chip: "m3max40", model: "Gemma 4 26B A4B", weightsKey: "gemma4-26b-a4b",  params: 25.2, active: 3.8,  quant: "q2", runtime: "llama.cpp", tokensPerSecond: 71.0, source: HIESCH, verified: MEASUREMENTS_VERIFIED },
  { chip: "m3max40", model: "Qwen3.5 35B A3B", weightsKey: "qwen3.5-35b-a3b", params: 36.0, active: 3.0,  quant: "q4", runtime: "llama.cpp", tokensPerSecond: 58.3, source: HIESCH, verified: MEASUREMENTS_VERIFIED },
  { chip: "m3max40", model: "Qwen3.6 35B A3B", weightsKey: "qwen3.6-35b-a3b", params: 36.0, active: 3.0,  quant: "q4", runtime: "llama.cpp", tokensPerSecond: 58.4, source: HIESCH, verified: MEASUREMENTS_VERIFIED },

  { chip: "m4max40", model: "Qwen3.5 35B A3B", weightsKey: "qwen3.5-35b-a3b", params: 36.0, active: 3.0,  quant: "q4", runtime: "llama.cpp", tokensPerSecond: 71.4, source: KAPETANOVIC, verified: MEASUREMENTS_VERIFIED },
  { chip: "m4max40", model: "Qwen3.5 35B A3B", weightsKey: "qwen3.5-35b-a3b", params: 36.0, active: 3.0,  quant: "q4", runtime: "Ollama",    tokensPerSecond: 44.3, source: KAPETANOVIC, verified: MEASUREMENTS_VERIFIED },
];
