import type { OpencodeQuotaRow } from "./opencode-quota";
import type { IntelligenceReading } from "./aa-intelligence";
import { slugFor } from "./aa-intelligence";

export interface ScrapedFields {
  requestsPerWindow?: number;
  bonusIsPromotional?: boolean;
  bonusLabel?: string | null;
  intelligenceIndex?: number;
  intelligenceVariant?: string;
}

export function mergeOpencodeQuota<T extends { model: string }>(
  rows: T[],
  quota: OpencodeQuotaRow[],
): Array<T & ScrapedFields> {
  const byModel = new Map(quota.map(row => [row.model, row]));
  return rows.map(row => {
    const match = byModel.get(row.model);
    return match
      ? { ...row, requestsPerWindow: match.requestsPerWindow, bonusIsPromotional: match.bonusIsPromotional, bonusLabel: match.bonusLabel }
      : row;
  });
}

export function mergeIntelligenceIndex<T extends { model: string; aaSlug?: string }>(
  rows: T[],
  readings: Map<string, IntelligenceReading>,
): Array<T & ScrapedFields> {
  return rows.map(row => {
    const reading = readings.get(slugFor(row.model, row.aaSlug));
    return reading ? { ...row, intelligenceIndex: reading.index, intelligenceVariant: reading.variant } : row;
  });
}
