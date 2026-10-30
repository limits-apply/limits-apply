import type { QuotaObservationV1 } from "./telemetry.ts";
import { SUBSCRIPTIONS } from "./subscriptions.ts";
import {
  admissible,
  detectQuotaChange,
  evidenceStatus,
  intervalRate,
  isAdmissible,
  quotaDelta,
  robustBand,
  tokenTotals,
  type Band,
  type ChangeVerdict,
  type EvidenceStatus,
} from "./telemetry-stats.ts";

/**
 * Fold validated observations into the aggregate the page renders. Nothing
 * here re-derives a figure the interval engine refused: an inadmissible
 * interval keeps its id and reason and leaves the statistics alone.
 *
 * Sibling imports carry the `.ts` extension so `scripts/*.mjs` can load this
 * module directly under Node's type stripping.
 */

export interface GroupKey {
  provider: string;
  subscriptionId: string;
  modelId: string;
  harness: string;
  windowType: string;
}

export interface SeriesPoint {
  observedAt: string;
  observationId: string;
  tokensPerPoint: number;
  apiUsdPerPoint: number | null;
  cacheShare: number | null;
  collectionMethod: QuotaObservationV1["collectionMethod"];
  isolationConfirmed: boolean;
}

export interface ExcludedInterval {
  observationId: string;
  reason: string;
}

export interface GroupAggregate {
  key: GroupKey;
  plan: string;
  intervals: number;
  reporters: number;
  status: EvidenceStatus;
  tokensPerPoint: Band | null;
  apiUsdPerPoint: Band | null;
  cacheShare: Band | null;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  series: SeriesPoint[];
  excluded: ExcludedInterval[];
  change: ChangeVerdict | null;
}

export interface Observatory {
  schemaVersion: 1;
  observations: number;
  admissibleIntervals: number;
  groups: GroupAggregate[];
}

export function groupKeyOf(o: QuotaObservationV1): GroupKey {
  return {
    provider: o.provider,
    subscriptionId: o.subscriptionId,
    modelId: o.modelId,
    harness: o.harness,
    windowType: o.quotaWindow.type,
  };
}

function planNameOf(o: QuotaObservationV1): string {
  return SUBSCRIPTIONS.find(s => s.subscriptionId === o.subscriptionId)?.plan ?? o.subscriptionId;
}

/** Baseline is the older half of the ordered sample, current the newer half. */
function changeOf(series: SeriesPoint[]): ChangeVerdict | null {
  const priced = series.filter(p => p.apiUsdPerPoint != null);
  if (priced.length < 4) return null;
  const mid = Math.floor(priced.length / 2);
  return detectQuotaChange(
    priced.slice(0, mid).map(p => p.apiUsdPerPoint as number),
    priced.slice(mid).map(p => p.apiUsdPerPoint as number),
  );
}

export function aggregateObservations(observations: QuotaObservationV1[]): Observatory {
  const groups: GroupAggregate[] = [];
  const byKey = new Map<string, { key: GroupKey; bucket: QuotaObservationV1[] }>();
  for (const o of observations) {
    const key = groupKeyOf(o);
    const hash = `${key.provider}/${key.subscriptionId}/${key.modelId}/${key.windowType}/${key.harness}`;
    const entry = byKey.get(hash);
    if (entry) entry.bucket.push(o);
    else byKey.set(hash, { key, bucket: [o] });
  }

  for (const { key, bucket } of byKey.values()) {
    const usable = bucket.filter(isAdmissible);
    const reporters = new Set(usable.map(o => o.reporterId));
    const series: SeriesPoint[] = usable
      .map(o => ({ o, rate: intervalRate(o) }))
      .filter(({ rate }) => rate !== null)
      .map(({ o, rate }) => ({
        observedAt: o.observedAt,
        observationId: o.observationId,
        tokensPerPoint: (rate as NonNullable<typeof rate>).tokensPerPoint,
        apiUsdPerPoint: (rate as NonNullable<typeof rate>).apiUsdPerPoint,
        cacheShare: (rate as NonNullable<typeof rate>).cacheShare,
        collectionMethod: o.collectionMethod,
        isolationConfirmed: o.isolationConfirmed,
      }))
      .sort((a, b) => a.observedAt.localeCompare(b.observedAt));

    const tokens = robustBand(series.map(p => p.tokensPerPoint));
    const priced = series.filter(p => p.apiUsdPerPoint != null);
    const excluded: ExcludedInterval[] = bucket
      .filter(o => !isAdmissible(o))
      .map(o => ({ observationId: o.observationId, reason: admissible(o).reason ?? "not admissible" }));

    groups.push({
      key,
      plan: planNameOf(bucket[0]),
      intervals: series.length,
      reporters: reporters.size,
      status: evidenceStatus({
        intervals: series.length,
        windowTypes: 1,
        reporters: reporters.size,
      }),
      tokensPerPoint: tokens,
      apiUsdPerPoint: robustBand(priced.map(p => p.apiUsdPerPoint as number)),
      cacheShare: robustBand(series.filter(p => p.cacheShare != null).map(p => p.cacheShare as number)),
      firstObservedAt: series[0]?.observedAt ?? null,
      lastObservedAt: series[series.length - 1]?.observedAt ?? null,
      series,
      excluded,
      change: changeOf(series),
    });
  }

  groups.sort(
    (a, b) => a.plan.localeCompare(b.plan) || a.key.modelId.localeCompare(b.key.modelId) || a.key.windowType.localeCompare(b.key.windowType),
  );

  return {
    schemaVersion: 1,
    observations: observations.length,
    admissibleIntervals: groups.reduce((sum, g) => sum + g.intervals, 0),
    groups,
  };
}

/** Redistributable table of every aggregate, one row per observation. */
export function observationsCsv(observations: QuotaObservationV1[]): string {
  const header = [
    "observationId",
    "provider",
    "subscriptionId",
    "modelId",
    "harness",
    "harnessVersion",
    "reasoningEffort",
    "observedAt",
    "windowType",
    "resetAt",
    "usedBefore",
    "usedAfter",
    "inputTokens",
    "cacheReadTokens",
    "cacheWriteTokens",
    "outputTokens",
    "apiRateVersion",
    "collectionMethod",
    "isolationConfirmed",
  ].join(",");
  const cell = (value: string | number | boolean | null) => {
    if (value === null) return "";
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows = [...observations]
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
    .map(o =>
      [
        o.observationId,
        o.provider,
        o.subscriptionId,
        o.modelId,
        o.harness,
        o.harnessVersion,
        o.reasoningEffort,
        o.observedAt,
        o.quotaWindow.type,
        o.quotaWindow.resetAt,
        o.quotaWindow.usedBefore,
        o.quotaWindow.usedAfter,
        quotaDelta(o),
        o.usage.inputTokens,
        o.usage.cacheReadTokens,
        o.usage.cacheWriteTokens,
        o.usage.outputTokens,
        tokenTotals(o).total,
        o.apiRateVersion,
        o.collectionMethod,
        o.isolationConfirmed,
      ]
        .map(cell)
        .join(","),
    );
  return [header, ...rows].join("\n");
}
