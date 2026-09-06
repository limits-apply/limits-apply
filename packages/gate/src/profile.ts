import type { AgentPick, Candidate, LocalOverlay, ProvenanceRung } from "@limits-apply/intelligence";

export interface LocalCandidateRow {
  id: string;
  model: string;
  endpoint: string;
  failureDomain: string;
  intelligence: { value: number; rung: ProvenanceRung; source: string; verified: string };
  speed: { value: number; rung: ProvenanceRung; source: string; verified: string };
  concurrency: number;
}

export interface GateProfile extends LocalOverlay {
  version: 1;
  region: string;
  credentialNames: string[];
  agentPicks?: AgentPick[];
  localCandidates?: LocalCandidateRow[];
}

export const defaultGateProfile = (): GateProfile => ({
  version: 1,
  region: "global",
  credentialNames: [],
});

export function profileOverlay(profile: GateProfile): LocalOverlay {
  return {
    ...profile,
    credentials: profile.credentialNames,
  };
}

const ZERO_RATE = {
  rung: "modelled" as const,
  source: "marginal cost treated as zero; electricity and hardware amortization out of scope — docs/methodology.md#local-throughput",
};

export function localCandidateToCandidate(row: LocalCandidateRow): Candidate {
  for (const [field, evidence] of [["intelligence", row.intelligence], ["speed", row.speed]] as const) {
    if (!evidence?.source || !evidence?.verified || !(evidence.value > 0)) {
      throw new Error(`${row.id}: local candidate ${field} needs a value, a source and a verified date`);
    }
  }
  const zero = (verified: string) => ({ value: 0, ...ZERO_RATE, verified });
  return {
    id: row.id,
    model: row.model,
    provider: "local",
    endpoint: row.endpoint,
    failureDomain: row.failureDomain,
    billing: "local",
    priceUsd: zero(row.speed.verified),
    allowanceUsd: { value: null, ...ZERO_RATE, verified: row.speed.verified },
    inputRateUsdPerMillion: zero(row.speed.verified),
    cachedInputRateUsdPerMillion: zero(row.speed.verified),
    outputRateUsdPerMillion: zero(row.speed.verified),
    intelligence: row.intelligence,
    speed: row.speed,
    compatible: true,
    identityWorkaround: false,
    regions: ["global"],
    credentials: [],
    concurrency: row.concurrency,
  };
}
