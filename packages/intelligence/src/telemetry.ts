import { LATEST_RATE_VERSION, PRICED_MODELS, rateCardFor } from "./api-rates.ts";
import { SUBSCRIPTIONS } from "./subscriptions.ts";

/**
 * One quota interval as measured. This is the unit the whole observatory is
 * built from: X tokens of a known mix consumed Y points of quota in window Z,
 * on plan P, with model M and harness H — never more, never less.
 *
 * Sibling imports carry the `.ts` extension so `scripts/*.mjs` can load this
 * module directly under Node's type stripping.
 */
export interface QuotaObservationV1 {
  schemaVersion: 1;
  /** Stable content hash — the same interval is never stored twice. */
  observationId: string;
  /** Opaque per-reporter token: dedupes accounts without identifying people. */
  reporterId: string;

  provider: "openai" | "anthropic";
  subscriptionId: string;
  modelId: string;
  harness: "codex" | "claude-code";
  harnessVersion: string;
  reasoningEffort: string | null;

  observedAt: string;
  region: string | null;

  quotaWindow: {
    type: "5h" | "weekly" | "monthly" | "other";
    resetAt: string | null;
    /** Provider-reported quota share, in percentage points, 0–100. */
    usedBefore: number;
    usedAfter: number;
    unit: "percentage_points";
    /** The counter reset inside the interval — the delta is not a consumption. */
    resetDetected: boolean;
  };

  usage: {
    inputTokens: number | null;
    cacheReadTokens: number | null;
    cacheWriteTokens: number | null;
    outputTokens: number | null;
  };

  apiRateVersion: string | null;
  workloadId: string | null;
  runs: number | null;
  successfulRuns: number | null;

  collectionMethod: "local_log" | "official_status" | "manual";
  evidenceRef: string | null;
  /** True only when no other session could have consumed quota inside the interval. */
  isolationConfirmed: boolean;
}

const PROVIDER_SET = new Set(["openai", "anthropic"]);
const HARNESS_SET = new Set(["codex", "claude-code"]);
const WINDOW_SET = new Set(["5h", "weekly", "monthly", "other"]);
const METHOD_SET = new Set(["local_log", "official_status", "manual"]);

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const ID = /^[0-9a-f]{16}$/;
const REPORTER = /^[A-Za-z0-9-]{4,64}$/;
const REGION = /^[A-Z]{2}$/;

const MAX_TOKENS = 1e14;

function percent(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "number" || !(value >= 0) || !(value <= 100)) {
    errors.push(`${field} must be a number in 0–100`);
  }
}

function tokens(value: unknown, field: string, errors: string[]): void {
  // Absent is null, never zero — a missing category is a disclosure, not a value.
  if (value === null) return;
  if (typeof value !== "number" || !(value >= 0) || !(value <= MAX_TOKENS)) {
    errors.push(`${field} must be null or a token count ≤ 1e14`);
  }
}

function isoInstant(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "string" || !ISO_INSTANT.test(value) || Number.isNaN(Date.parse(value))) {
    errors.push(`${field} must be an ISO instant`);
  }
}

function looksPrivate(value: string): boolean {
  return /[@/]|^https?:\/\/|sk-|Bearer|\.claude|\.codex|Users\/|home\//i.test(value);
}

function looksLocal(value: string): boolean {
  return /@|sk-|Bearer|\.claude|\.codex|Users\/|home\//i.test(value);
}

export function validateObservationV1(raw: unknown): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") return ["observation is not an object"];
  const o = raw as Record<string, unknown>;

  if (o.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (typeof o.observationId !== "string" || !ID.test(o.observationId)) {
    errors.push("observationId must be 16 hex chars");
  }
  if (typeof o.reporterId !== "string" || !REPORTER.test(o.reporterId)) {
    errors.push("reporterId must be 4–64 opaque characters, never an identity");
  }
  if (looksPrivate(o.reporterId as string)) errors.push("reporterId looks like an identity");

  if (!PROVIDER_SET.has(o.provider as string)) errors.push(`provider must be one of ${[...PROVIDER_SET].join(" · ")}`);
  const subscription = SUBSCRIPTIONS.find(s => s.subscriptionId === o.subscriptionId);
  if (!subscription) errors.push("subscriptionId is not in the registry");
  else {
    if (subscription.provider !== o.provider) errors.push("subscriptionId does not belong to provider");
    if (subscription.harness !== "any" && subscription.harness !== o.harness) {
      errors.push(`${subscription.subscriptionId} is consumed through ${subscription.harness}`);
    }
  }

  if (typeof o.modelId !== "string" || !o.modelId.trim()) errors.push("modelId is required");
  if (!HARNESS_SET.has(o.harness as string)) errors.push(`harness must be one of ${[...HARNESS_SET].join(" · ")}`);
  if (typeof o.harnessVersion !== "string" || !o.harnessVersion.trim()) errors.push("harnessVersion is required");
  if (looksPrivate(o.harnessVersion as string)) errors.push("harnessVersion looks like a path");
  if (o.reasoningEffort !== null && (typeof o.reasoningEffort !== "string" || !o.reasoningEffort.trim())) {
    errors.push("reasoningEffort must be null or a non-empty string");
  }

  isoInstant(o.observedAt, "observedAt", errors);
  if (o.region !== null && (typeof o.region !== "string" || !REGION.test(o.region))) {
    errors.push("region must be null or an ISO-3166 alpha-2 code");
  }

  const window = (o.quotaWindow ?? {}) as Record<string, unknown>;
  if (!WINDOW_SET.has(window.type as string)) errors.push(`quotaWindow.type must be one of ${[...WINDOW_SET].join(" · ")}`);
  if (window.unit !== "percentage_points") errors.push("quotaWindow.unit must be percentage_points");
  if (window.resetAt !== null && window.resetAt !== undefined) isoInstant(window.resetAt, "quotaWindow.resetAt", errors);
  percent(window.usedBefore, "quotaWindow.usedBefore", errors);
  percent(window.usedAfter, "quotaWindow.usedAfter", errors);
  if (window.resetDetected !== true && window.resetDetected !== false) {
    errors.push("quotaWindow.resetDetected must be a boolean");
  }

  const usage = (o.usage ?? {}) as Record<string, unknown>;
  tokens(usage.inputTokens, "usage.inputTokens", errors);
  tokens(usage.cacheReadTokens, "usage.cacheReadTokens", errors);
  tokens(usage.cacheWriteTokens, "usage.cacheWriteTokens", errors);
  tokens(usage.outputTokens, "usage.outputTokens", errors);

  if (o.apiRateVersion !== null) {
    if (typeof o.apiRateVersion !== "string" || !/^\d{4}-\d{2}-r\d+$/.test(o.apiRateVersion)) {
      errors.push("apiRateVersion must be null or a dated card version");
    } else if (!rateCardFor(o.modelId as string, o.apiRateVersion)) {
      errors.push(`no rate card for model ${o.modelId} at version ${o.apiRateVersion}`);
    }
  }

  if (o.workloadId !== null && (typeof o.workloadId !== "string" || !/^wl-\d{3}(@v\d+)?$/.test(o.workloadId))) {
    errors.push("workloadId must be null or a versioned id like wl-001@v1");
  }
  if (o.runs !== null && (typeof o.runs !== "number" || !Number.isInteger(o.runs) || o.runs < 0)) {
    errors.push("runs must be null or a non-negative integer");
  }
  if (o.successfulRuns !== null) {
    if (typeof o.successfulRuns !== "number" || !Number.isInteger(o.successfulRuns) || o.successfulRuns < 0) {
      errors.push("successfulRuns must be null or a non-negative integer");
    } else if (typeof o.runs === "number" && o.successfulRuns > o.runs) {
      errors.push("successfulRuns cannot exceed runs");
    }
  }

  if (!METHOD_SET.has(o.collectionMethod as string)) {
    errors.push(`collectionMethod must be one of ${[...METHOD_SET].join(" · ")}`);
  }
  if (o.evidenceRef !== null) {
    if (typeof o.evidenceRef !== "string" || !/^https:\/\//.test(o.evidenceRef)) {
      errors.push("evidenceRef must be null or an https URL");
    } else if (looksLocal(o.evidenceRef)) errors.push("evidenceRef points at a local path");
  }
  if (o.isolationConfirmed !== true && o.isolationConfirmed !== false) {
    errors.push("isolationConfirmed must be a boolean");
  }

  return errors;
}

export function parseObservation(text: string): QuotaObservationV1 {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid observation: not JSON (${(error as Error).message})`);
  }
  const errors = validateObservationV1(raw);
  if (errors.length) throw new Error(`invalid observation: ${errors.join("; ")}`);
  return raw as QuotaObservationV1;
}

/** Default rate version for a fresh observation; the CLI stamps it. */
export const DEFAULT_RATE_VERSION: string | null = LATEST_RATE_VERSION;

/** A collector never needs a card it cannot find — this keeps the two honest. */
export function assertPriced(modelId: string, version: string): void {
  if (!PRICED_MODELS.includes(modelId)) throw new Error(`no API price card for model ${modelId}`);
  if (!rateCardFor(modelId, version)) throw new Error(`no rate card for ${modelId} at ${version}`);
}
