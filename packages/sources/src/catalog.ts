import type { BillingMode } from "@limits-apply/intelligence";

/**
 * One hand-entered access path. Rates were read on `rateSource`, speed on `speedSource`,
 * both on `verified` — the same discipline as src/data/plans.json. Intelligence is NOT
 * here: it joins from the committed AA snapshot by `aaSlug`, so one number has one home.
 */
export interface CatalogRow {
  id: string;
  model: string;
  provider: string;
  endpoint: string;
  failureDomain: string;
  billing: BillingMode;
  aaSlug: string;
  priceUsd: number;
  allowanceUsd: number | null;
  inputRateUsdPerMillion: number;
  cachedInputRateUsdPerMillion: number;
  outputRateUsdPerMillion: number;
  speed: number;
  rateSource: string;
  speedSource: string;
  verified: string;
  compatible: boolean;
  identityWorkaround: boolean;
  regions: string[];
  credentials: string[];
  concurrency: number;
}

const STRINGS = [
  "id",
  "model",
  "provider",
  "endpoint",
  "failureDomain",
  "billing",
  "aaSlug",
  "rateSource",
  "speedSource",
  "verified",
] as const;

const NUMBERS = [
  "priceUsd",
  "inputRateUsdPerMillion",
  "cachedInputRateUsdPerMillion",
  "outputRateUsdPerMillion",
  "speed",
  "concurrency",
] as const;

export function parseCandidateRows(raw: string): CatalogRow[] {
  const rows = JSON.parse(raw) as Record<string, unknown>[];
  return rows.map(row => {
    const name = typeof row.id === "string" ? row.id : JSON.stringify(row).slice(0, 60);
    for (const field of STRINGS) {
      if (typeof row[field] !== "string" || row[field] === "") throw new Error(`${name}: ${field} is missing`);
    }
    for (const field of NUMBERS) {
      if (typeof row[field] !== "number" || !Number.isFinite(row[field] as number)) throw new Error(`${name}: ${field} is missing`);
    }
    if (row.allowanceUsd !== null && typeof row.allowanceUsd !== "number") throw new Error(`${name}: allowanceUsd must be a number or null`);
    if (!Array.isArray(row.regions) || !Array.isArray(row.credentials)) throw new Error(`${name}: regions and credentials must be arrays`);
    if (typeof row.compatible !== "boolean" || typeof row.identityWorkaround !== "boolean") throw new Error(`${name}: compatible and identityWorkaround must be booleans`);
    return row as unknown as CatalogRow;
  });
}

/**
 * One hand-entered pair, joined to the committed AA agents snapshot by `label` —
 * the same source-of-truth-throws-on-missing-label discipline as `src/data/agents.ts`.
 */
export interface AgentPairRow {
  id: string;
  agent: string;
  model: string;
  label: string;
}

const AGENT_PAIR_STRINGS = ["id", "agent", "model", "label"] as const;

export function parseAgentPairRows(raw: string): AgentPairRow[] {
  const rows = JSON.parse(raw) as Record<string, unknown>[];
  return rows.map(row => {
    const name = typeof row.id === "string" ? row.id : JSON.stringify(row).slice(0, 60);
    for (const field of AGENT_PAIR_STRINGS) {
      if (typeof row[field] !== "string" || row[field] === "") throw new Error(`${name}: ${field} is missing`);
    }
    return row as unknown as AgentPairRow;
  });
}
