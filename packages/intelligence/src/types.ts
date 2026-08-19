export type BillingMode = "subscription" | "api" | "local";
export type ProvenanceRung = "measured" | "observed" | "derived" | "chained" | "modelled";
export type RejectionCode =
  | "incompatible"
  | "identity-workaround"
  | "region"
  | "credentials"
  | "concurrency"
  | "stale-evidence"
  | "exhausted";

export interface Evidence<T> {
  value: T;
  rung: ProvenanceRung;
  source: string;
  verified: string;
  expires?: string;
}

export interface Candidate {
  id: string;
  model: string;
  provider: string;
  endpoint: string;
  failureDomain: string;
  billing: BillingMode;
  priceUsd: Evidence<number>;
  allowanceUsd: Evidence<number | null>;
  inputRateUsdPerMillion: Evidence<number>;
  cachedInputRateUsdPerMillion: Evidence<number>;
  outputRateUsdPerMillion: Evidence<number>;
  intelligence: Evidence<number>;
  speed: Evidence<number>;
  compatible: boolean;
  identityWorkaround: boolean;
  regions: string[];
  credentials: string[];
  concurrency: number;
}

export interface WorkloadProfile {
  id: string;
  currency: "USD";
  monthlyBudgetUsd: number;
  turnsPerMonth: number;
  inputTokensPerTurn: number;
  cachedInputTokensPerTurn: number;
  outputTokensPerTurn: number;
  cacheDiscount: number;
  minimumConcurrency: number;
  intelligenceFloor: number;
  region: string;
  availableCredentials?: string[];
  exhaustedDomains?: string[];
}

export interface LocalOverlay {
  credentials?: string[];
  exhaustedDomains?: string[];
  region?: string;
  monthlyBudgetUsd?: number;
  minimumConcurrency?: number;
  /** The global floor is set for the frontier; a local tier sits well below it and would select nothing. */
  intelligenceFloor?: number;
}

export interface Rejection {
  candidateId: string;
  code: RejectionCode;
  reason: string;
}

export interface RankedCandidate {
  candidate: Candidate;
  effectiveCostUsd: number;
  capacity: number | null;
  speed: number;
}

export interface Verdict {
  id: string;
  evidenceVersion: string;
  profile: WorkloadProfile;
  selected: { build: string | null; plan: string | null };
  routes: { build: string[]; plan: string[] };
  fallbacks: Record<string, string[]>;
  frontier: RankedCandidate[];
  dominated: RankedCandidate[];
  rejected: Rejection[];
  formulas: string[];
  degraded: boolean;
  generatedAt: string;
}
