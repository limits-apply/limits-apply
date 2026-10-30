import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  LATEST_RATE_VERSION,
  PRICED_MODELS,
  parseObservation,
  stableJson,
  subscriptionForPlanType,
  type QuotaObservationV1,
} from "@limits-apply/intelligence";
import type { ObservedTokens } from "./measure";

/**
 * Local collectors: the provider's own logs become quota observations. Nothing
 * here reads a private endpoint or a token the CLI was not already given —
 * Codex's rollout files carry the client's own rate-limit events, and Claude's
 * usage windows come from the official endpoint `quota pull` already uses.
 */

type WindowKind = "5h" | "weekly";

export interface CollectOptions {
  /** Opaque per-machine reporter token; dedupes without identifying anyone. */
  reporterId: string;
  /** Assert no other session could consume quota inside the intervals. */
  isolated: boolean;
  region?: string | null;
  workloadId?: string | null;
  since?: string | null;
  collectionMethod?: QuotaObservationV1["collectionMethod"];
  /** Workload run counts, when the range executed a versioned workload. */
  runs?: number | null;
  successfulRuns?: number | null;
}

export interface CollectResult {
  observations: QuotaObservationV1[];
  notes: string[];
}

interface TokenCounts {
  input: number;
  cached: number;
  cacheWrite: number;
  output: number;
}

const ZERO_TOKENS: TokenCounts = { input: 0, cached: 0, cacheWrite: 0, output: 0 };

/* ---------- the observation id is the content, so a double run writes once ---------- */

function canonical(observation: Omit<QuotaObservationV1, "observationId">): string {
  // stableJson, not a key-filtered stringify: the hash must see nested fields
  // (quotaWindow is what separates a 5h interval from a weekly one).
  return stableJson(observation);
}

function observationIdFor(observation: Omit<QuotaObservationV1, "observationId">): string {
  return createHash("sha256").update(canonical(observation)).digest("hex").slice(0, 16);
}

/* ---------- normalization: provider-native categories into the schema's four ---------- */

/**
 * Codex's `input_tokens` already contains its cached and cache-write reads —
 * its own `total_tokens` is exactly input + output with cached shown inside
 * input. Uncached input is what is left once the cache is taken out, so a
 * token is never billed twice.
 */
export function normalizeCodexUsage(raw: TokenCounts): QuotaObservationV1["usage"] {
  const cached = Math.max(0, raw.cached);
  const cacheWrite = Math.max(0, raw.cacheWrite);
  const input = Math.max(0, raw.input - cached - cacheWrite);
  return {
    inputTokens: input,
    cacheReadTokens: cached,
    cacheWriteTokens: cacheWrite,
    outputTokens: Math.max(0, raw.output),
  };
}

/** Anthropic reports the four categories separately; there is nothing to unwrap. */
export function normalizeClaudeUsage(raw: TokenCounts): QuotaObservationV1["usage"] {
  return {
    inputTokens: Math.max(0, raw.input),
    cacheReadTokens: Math.max(0, raw.cached),
    cacheWriteTokens: Math.max(0, raw.cacheWrite),
    outputTokens: Math.max(0, raw.output),
  };
}

function stamp(
  base: Omit<QuotaObservationV1, "observationId" | "apiRateVersion">,
  apiRateVersion: string | null,
): QuotaObservationV1 {
  return { ...base, observationId: observationIdFor({ ...base, apiRateVersion }), apiRateVersion };
}

/* ---------- Codex: rollout JSONL ---------- */

interface RateLimitWindow {
  used_percent?: number;
  window_minutes?: number;
  resets_at?: number;
}

interface CodexPoint {
  at: string;
  totals: TokenCounts;
  used: Partial<Record<WindowKind, number>>;
  resets: Partial<Record<WindowKind, string>>;
  model: string | null;
  effort: string | null;
  planType: string | null;
}

function toWindowKind(minutes: number | undefined): WindowKind | null {
  if (minutes === 300) return "5h";
  if (minutes === 10_080) return "weekly";
  return null;
}

function toCounts(value: Record<string, number> | undefined): TokenCounts | null {
  if (!value || typeof value.input_tokens !== "number" || typeof value.output_tokens !== "number") return null;
  return {
    input: value.input_tokens,
    cached: value.cached_input_tokens ?? 0,
    cacheWrite: value.cache_write_input_tokens ?? 0,
    output: value.output_tokens,
  };
}

async function rolloutFiles(root: string): Promise<string[]> {
  let entries: Dirent[] | undefined;
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map(entry => join(entry.parentPath, entry.name))
    .sort();
}

function parseCodexPoints(text: string): { points: CodexPoint[]; cliVersion: string | null } {
  const points: CodexPoint[] = [];
  let cliVersion: string | null = null;
  let model: string | null = null;
  let effort: string | null = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const payload = event.payload as Record<string, unknown> | undefined;
    if (!payload) continue;
    if (event.type === "session_meta") {
      cliVersion = typeof payload.cli_version === "string" ? payload.cli_version : cliVersion;
    } else if (event.type === "turn_context") {
      model = typeof payload.model === "string" ? payload.model : model;
      effort = typeof payload.effort === "string" ? (payload.effort as string) : effort;
    } else if (event.type === "event_msg" && payload.type === "token_count") {
      const info = payload.info as Record<string, unknown> | undefined;
      const rateLimits = payload.rate_limits as Record<string, unknown> | undefined;
      const totals = toCounts(info?.total_token_usage as Record<string, number> | undefined);
      if (!totals) continue;
      const point: CodexPoint = { at: String(event.timestamp ?? ""), totals, used: {}, resets: {}, model, effort, planType: null };
      for (const slot of ["primary", "secondary"] as const) {
        const window = rateLimits?.[slot] as RateLimitWindow | undefined;
        const kind = toWindowKind(window?.window_minutes);
        if (kind && typeof window?.used_percent === "number") {
          point.used[kind] = window.used_percent;
          if (typeof window.resets_at === "number") point.resets[kind] = new Date(window.resets_at * 1000).toISOString();
        }
      }
      const planType = rateLimits?.plan_type;
      if (typeof planType === "string") point.planType = planType;
      if (!point.at) continue;
      points.push(point);
    }
  }
  points.sort((a, b) => a.at.localeCompare(b.at));
  return { points, cliVersion };
}

/** Intervals between consecutive rate-limit events of one thread, per window kind. */
function codexObservations(
  points: CodexPoint[],
  subscriptionId: string,
  harnessVersion: string,
  options: CollectOptions,
): QuotaObservationV1[] {
  const out: QuotaObservationV1[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const before = points[i - 1];
    const after = points[i];
    if (!after.at) continue;
    const totals: TokenCounts = {
      input: Math.max(0, after.totals.input - before.totals.input),
      cached: Math.max(0, after.totals.cached - before.totals.cached),
      cacheWrite: Math.max(0, after.totals.cacheWrite - before.totals.cacheWrite),
      output: Math.max(0, after.totals.output - before.totals.output),
    };
    for (const kind of Object.keys(after.used) as WindowKind[]) {
      const usedBefore = before.used[kind];
      const usedAfter = after.used[kind];
      const resetAt = after.resets[kind] ?? null;
      if (usedBefore === undefined || usedAfter === undefined) continue;
      const previousReset = before.resets[kind] ?? null;
      const base: Omit<QuotaObservationV1, "observationId" | "apiRateVersion"> = {
        schemaVersion: 1,
        reporterId: options.reporterId,
        provider: "openai",
        subscriptionId,
        modelId: after.model ?? "unknown",
        harness: "codex",
        harnessVersion,
        reasoningEffort: after.effort,
        observedAt: after.at,
        region: options.region ?? null,
        quotaWindow: {
          type: kind,
          resetAt,
          usedBefore,
          usedAfter,
          unit: "percentage_points",
          resetDetected: usedAfter < usedBefore || resetAt !== previousReset,
        },
        usage: normalizeCodexUsage(totals),
        workloadId: options.workloadId ?? null,
        runs: null,
        successfulRuns: null,
        collectionMethod: options.collectionMethod ?? "local_log",
        evidenceRef: null,
        isolationConfirmed: options.isolated,
      };
            out.push(stamp(base, modelHasCard(after.model) ? LATEST_RATE_VERSION : null));
    }
  }
  return out;
}

function modelHasCard(model: string | null): boolean {
  return model !== null && PRICED_MODELS.includes(model);
}

interface CodexSession {
  file: string;
  points: CodexPoint[];
  cliVersion: string | null;
  subscriptionId: string;
}

/** Detect whether any other collected session consumed quota inside an interval. */
function overlapDetector(sessions: CodexSession[]) {
  const otherTimes = new Map<string, string[]>();
  for (const session of sessions) {
    for (const candidate of sessions) {
      if (candidate.file === session.file) continue;
      const times = otherTimes.get(session.file) ?? [];
      times.push(...candidate.points.map(point => point.at));
      otherTimes.set(session.file, times);
    }
  }
  for (const times of otherTimes.values()) times.sort((a, b) => a.localeCompare(b));
  return (file: string, start: string, end: string): boolean => {
    const times = otherTimes.get(file) ?? [];
    return times.some(time => time > start && time < end);
  };
}

export async function collectCodex(sessionsRoot: string, options: CollectOptions): Promise<CollectResult> {
  const notes: string[] = [];
  const sessions: CodexSession[] = [];
  for (const file of await rolloutFiles(sessionsRoot)) {
    const { points, cliVersion } = parseCodexPoints(await readFile(file, "utf8"));
    const planType = points.find(point => point.planType)?.planType ?? null;
    if (!planType) {
      notes.push(`${file}: no rate-limit events — skipped`);
      continue;
    }
    const subscription = subscriptionForPlanType("openai", planType);
    if (!subscription) {
      notes.push(`${file}: plan "${planType}" is not in the registry — skipped`);
      continue;
    }
    if (points.length < 2) {
      notes.push(`${file}: only ${points.length} rate-limit event(s) — no interval yet`);
    }
    sessions.push({ file, points, cliVersion, subscriptionId: subscription.subscriptionId });
  }
  const overlaps = overlapDetector(sessions);
  const observations: QuotaObservationV1[] = [];
  for (const session of sessions) {
    if (session.points.length < 2) continue;
    const since = options.since ?? null;
    const kept = since ? session.points.filter(point => point.at >= since) : session.points;
    const rows = codexObservations(kept, session.subscriptionId, session.cliVersion ?? "unknown", options);
    observations.push(...rows.map(row => markIsolation(row, session, kept, overlaps)));
  }
  return { observations: dedupe(observations), notes };
}

/** An interval is isolated only when the user asserted it or no other collected session lands inside it. */
function markIsolation(
  observation: QuotaObservationV1,
  session: CodexSession,
  kept: CodexPoint[],
  overlaps: (file: string, start: string, end: string) => boolean,
): QuotaObservationV1 {
  const end = observation.observedAt;
  const index = kept.findIndex(point => point.at === end);
  const start = index > 0 ? kept[index - 1].at : null;
  if (observation.isolationConfirmed || start === null) return observation;
  return { ...observation, isolationConfirmed: !overlaps(session.file, start, end) };
}

/* ---------- Claude Code: project transcripts ---------- */

interface ClaudeUsageRecord {
  at: string;
  model: string;
  harnessVersion: string;
  usage: TokenCounts;
  sidechain: boolean;
}

function parseClaudeTranscript(text: string): ClaudeUsageRecord[] {
  const out: ClaudeUsageRecord[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (record.type !== "assistant") continue;
    const message = record.message as Record<string, unknown> | undefined;
    const usage = message?.usage as Record<string, number> | undefined;
    if (!usage || typeof usage.input_tokens !== "number" || typeof usage.output_tokens !== "number") continue;
    out.push({
      at: String(record.timestamp ?? ""),
      model: String(message?.model ?? "unknown"),
      harnessVersion: String(record.version ?? "unknown"),
      usage: {
        input: usage.input_tokens,
        cached: usage.cache_read_input_tokens ?? 0,
        cacheWrite: usage.cache_creation_input_tokens ?? 0,
        output: usage.output_tokens,
      },
      sidechain: record.isSidechain === true,
    });
  }
  return out;
}

async function transcriptFiles(root: string): Promise<string[]> {
  let entries: Dirent[] | undefined;
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map(entry => join(entry.parentPath, entry.name))
    .sort();
}

export interface ClaudeCollectOptions extends CollectOptions {
  subscriptionId: string;
  beforePercent: number | null;
  afterPercent: number | null;
  window: WindowKind;
  resetAt: string | null;
  until: string | null;
}

/**
 * One observation per (model, window): the tokens the transcripts carry, priced
 * against the two quota readings the user supplied or pulled. Without an after
 * reading there is no interval, and nothing is written.
 */
export async function collectClaude(projectsRoot: string, options: ClaudeCollectOptions): Promise<CollectResult> {
  const notes: string[] = [];
  if (options.beforePercent === null || options.afterPercent === null) {
    return { observations: [], notes: ["claude collection needs both quota readings: --before and --after or --pull"] };
  }
  const records: ClaudeUsageRecord[] = [];
  for (const file of await transcriptFiles(projectsRoot)) {
    records.push(...parseClaudeTranscript(await readFile(file, "utf8")));
  }
  const bounded = records.filter(
    record =>
      record.at &&
      (!options.since || record.at >= options.since) &&
      (!options.until || record.at <= options.until),
  );
  if (bounded.length === 0) {
    return { observations: [], notes: ["no assistant usage records in the requested range"] };
  }
  const byModel = new Map<string, ClaudeUsageRecord[]>();
  for (const record of bounded) {
    const bucket = byModel.get(record.model);
    if (bucket) bucket.push(record);
    else byModel.set(record.model, [record]);
  }
  const observations: QuotaObservationV1[] = [];
  for (const [model, rows] of byModel) {
    rows.sort((a, b) => a.at.localeCompare(b.at));
    const totals = rows.reduce<TokenCounts>(
      (sum, row) => ({
        input: sum.input + row.usage.input,
        cached: sum.cached + row.usage.cached,
        cacheWrite: sum.cacheWrite + row.usage.cacheWrite,
        output: sum.output + row.usage.output,
      }),
      { input: 0, cached: 0, cacheWrite: 0, output: 0 },
    );
    const base: Omit<QuotaObservationV1, "observationId" | "apiRateVersion"> = {
      schemaVersion: 1,
      reporterId: options.reporterId,
      provider: "anthropic",
      subscriptionId: options.subscriptionId,
      modelId: model,
      harness: "claude-code",
      harnessVersion: rows[rows.length - 1].harnessVersion,
      reasoningEffort: null,
      observedAt: options.until ?? new Date().toISOString(),
      region: options.region ?? null,
      quotaWindow: {
        type: options.window,
        resetAt: options.resetAt,
        usedBefore: options.beforePercent,
        usedAfter: options.afterPercent,
        unit: "percentage_points",
        resetDetected: options.afterPercent < options.beforePercent,
      },
      usage: normalizeClaudeUsage(totals),
      workloadId: options.workloadId ?? null,
      runs: options.runs ?? null,
      successfulRuns: options.successfulRuns ?? null,
      collectionMethod: options.collectionMethod ?? "manual",
      evidenceRef: null,
      isolationConfirmed: options.isolated,
    };
    observations.push(stamp(base, modelHasCard(model) ? LATEST_RATE_VERSION : null));
  }
  return { observations: dedupe(observations), notes };
}

function dedupe(observations: QuotaObservationV1[]): QuotaObservationV1[] {
  const byId = new Map<string, QuotaObservationV1>();
  for (const observation of observations) if (!byId.has(observation.observationId)) byId.set(observation.observationId, observation);
  return [...byId.values()];
}

/* ---------- the store ---------- */

export async function writeObservations(store: string, observations: QuotaObservationV1[]): Promise<{ written: number; skipped: number }> {
  await mkdir(store, { recursive: true });
  let written = 0;
  let skipped = 0;
  for (const observation of observations) {
    const path = join(store, `${observation.observationId}.json`);
    try {
      await readFile(path, "utf8");
      skipped += 1;
    } catch {
      const next = `${path}.next`;
      await writeFile(next, `${JSON.stringify(observation, null, 2)}\n`, "utf8");
      await rename(next, path);
      written += 1;
    }
  }
  return { written, skipped };
}

export async function readStore(store: string): Promise<QuotaObservationV1[]> {
  let entries: Dirent[] | undefined;
  try {
    entries = await readdir(store, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = entries.filter(entry => entry.isFile() && entry.name.endsWith(".json")).map(entry => entry.name).sort();
  const out: QuotaObservationV1[] = [];
  for (const file of files) {
    try {
      out.push(parseObservation(await readFile(join(store, file), "utf8")));
    } catch (error) {
      throw new Error(`${file}: ${(error as Error).message}`);
    }
  }
  return out;
}

/* ---------- tokens between two instants, for a wrapped graded run ---------- */

/** Codex reports cumulative thread totals; the interval is the difference. */
export async function codexTokensBetween(sessionsRoot: string, fromIso: string, toIso: string): Promise<ObservedTokens | null> {
  const totals: TokenCounts[] = [];
  for (const file of await rolloutFiles(sessionsRoot)) {
    const { points } = parseCodexPoints(await readFile(file, "utf8"));
    const after = [...points].reverse().find(point => point.at <= toIso);
    if (!after) continue;
    const before = [...points].reverse().find(point => point.at <= fromIso)?.totals ?? ZERO_TOKENS;
    totals.push({
      input: after.totals.input - before.input,
      cached: after.totals.cached - before.cached,
      cacheWrite: after.totals.cacheWrite - before.cacheWrite,
      output: after.totals.output - before.output,
    });
  }
  if (totals.length === 0) return null;
  const sum = totals.reduce<TokenCounts>(
    (total, row) => ({
      input: total.input + Math.max(0, row.input),
      cached: total.cached + Math.max(0, row.cached),
      cacheWrite: total.cacheWrite + Math.max(0, row.cacheWrite),
      output: total.output + Math.max(0, row.output),
    }),
    { ...ZERO_TOKENS },
  );
  return { source: "codex-rollout", input: sum.input, cacheRead: sum.cached, cacheWrite: sum.cacheWrite, output: sum.output };
}

/** Claude transcripts carry per-message usage; the interval is the sum. */
export async function claudeTokensBetween(projectsRoot: string, fromIso: string, toIso: string): Promise<ObservedTokens | null> {
  const records: ClaudeUsageRecord[] = [];
  for (const file of await transcriptFiles(projectsRoot)) {
    records.push(...parseClaudeTranscript(await readFile(file, "utf8")));
  }
  const inRange = records.filter(record => record.at >= fromIso && record.at <= toIso);
  if (inRange.length === 0) return null;
  const totals = inRange.reduce<TokenCounts>(
    (sum, row) => ({
      input: sum.input + row.usage.input,
      cached: sum.cached + row.usage.cached,
      cacheWrite: sum.cacheWrite + row.usage.cacheWrite,
      output: sum.output + row.usage.output,
    }),
    { ...ZERO_TOKENS },
  );
  return {
    source: "claude-transcripts",
    input: totals.input,
    cacheRead: totals.cached,
    cacheWrite: totals.cacheWrite,
    output: totals.output,
  };
}

/** The per-machine reporter token; an override keeps CI runs deterministic. */
export async function reporterIdFor(root: string, override: string | null): Promise<string> {
  if (override) return override;
  const path = join(root, "reporter.json");
  try {
    const existing = JSON.parse(await readFile(path, "utf8")) as { reporterId?: string };
    if (existing.reporterId) return existing.reporterId;
  } catch {
    // no reporter yet — one is minted below
  }
  const reporterId = `reporter-${createHash("sha256").update(`${root}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 12)}`;
  await mkdir(root, { recursive: true });
  const next = `${path}.next`;
  await writeFile(next, `${JSON.stringify({ reporterId }, null, 2)}\n`, "utf8");
  await rename(next, path);
  return reporterId;
}
