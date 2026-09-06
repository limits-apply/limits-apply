import type { AgentPair, Candidate, Evidence, EvidenceSnapshot } from "@limits-apply/intelligence";
import { stableJson } from "@limits-apply/intelligence";
import type { AgentPairRow, CatalogRow } from "./catalog";

export interface AaSnapshot {
  source_url: string;
  retrieved_on: string;
  models: Array<{ slug: string; intelligence: number | null }>;
}

export interface AgentsSnapshot {
  attribution: string;
  retrieved: string;
  variants: Array<{ label: string; index: number; costUsd: number | null; wallSeconds: number }>;
}

function fnv(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}

function buildAgentPairs(pairRows: AgentPairRow[], agents: AgentsSnapshot): AgentPair[] {
  const byLabel = new Map(agents.variants.map(variant => [variant.label, variant]));
  return pairRows.map(row => {
    const variant = byLabel.get(row.label);
    if (!variant) throw new Error(`agent-pairs.json maps label "${row.label}", but the agents snapshot no longer publishes it`);
    const evidence = <T>(value: T): Evidence<T> => ({ value, rung: "derived", source: agents.attribution, verified: agents.retrieved });
    return {
      id: row.id,
      agent: row.agent,
      model: row.model,
      index: evidence(Math.round(variant.index * 100 * 100) / 100),
      costPerTaskUsd: variant.costUsd === null ? null : evidence(variant.costUsd),
      minutesPerTask: evidence(variant.wallSeconds / 60),
    };
  });
}

export function buildEvidenceSnapshot(
  rows: CatalogRow[],
  aa: AaSnapshot,
  agents?: AgentsSnapshot,
  pairRows?: AgentPairRow[],
): EvidenceSnapshot {
  const bySlug = new Map(aa.models.map(model => [model.slug, model]));
  const candidates: Candidate[] = rows.map(row => {
    const scored = bySlug.get(row.aaSlug);
    if (!scored) throw new Error(`${row.id}: catalog maps aaSlug "${row.aaSlug}", but the AA snapshot no longer publishes it`);
    if (scored.intelligence === null) throw new Error(`${row.id}: the AA snapshot publishes "${row.aaSlug}" without an Intelligence Index — unrankable`);
    const rate = <T>(value: T): Evidence<T> => ({ value, rung: "derived", source: row.rateSource, verified: row.verified });
    return {
      id: row.id,
      model: row.model,
      provider: row.provider,
      endpoint: row.endpoint,
      failureDomain: row.failureDomain,
      billing: row.billing,
      priceUsd: rate(row.priceUsd),
      allowanceUsd: rate(row.allowanceUsd),
      inputRateUsdPerMillion: rate(row.inputRateUsdPerMillion),
      cachedInputRateUsdPerMillion: rate(row.cachedInputRateUsdPerMillion),
      outputRateUsdPerMillion: rate(row.outputRateUsdPerMillion),
      intelligence: { value: scored.intelligence, rung: "derived", source: aa.source_url, verified: aa.retrieved_on },
      speed: { value: row.speed, rung: "derived", source: row.speedSource, verified: row.verified },
      compatible: row.compatible,
      identityWorkaround: row.identityWorkaround,
      regions: row.regions,
      credentials: row.credentials,
      concurrency: row.concurrency,
    };
  });
  const agentPairs = agents && pairRows ? buildAgentPairs(pairRows, agents) : undefined;
  const retrievedAt = [aa.retrieved_on, ...rows.map(row => row.verified)].sort().at(-1) ?? aa.retrieved_on;
  return {
    kind: "evidence",
    version: `catalog-${retrievedAt}-${fnv(stableJson({ candidates, agentPairs }))}`,
    retrievedAt,
    candidates,
    ...(agentPairs ? { agentPairs } : {}),
  };
}
