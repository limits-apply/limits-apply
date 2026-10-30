import type { Candidate, Evidence, ProvenanceRung } from "@limits-apply/intelligence";

export interface RawCandidate extends Omit<Candidate, "priceUsd" | "allowanceUsd" | "intelligence" | "speed"> {
  priceUsd: number;
  allowanceUsd: number | null;
  intelligence: number;
  speed: number;
  source: string;
  verified: string;
  rung: ProvenanceRung;
}

export function normalizeCandidate(raw: RawCandidate): Candidate {
  const evidence = <T>(value: T): Evidence<T> => ({ value, rung: raw.rung, source: raw.source, verified: raw.verified });
  return {
    ...raw,
    priceUsd: evidence(raw.priceUsd),
    allowanceUsd: evidence(raw.allowanceUsd),
    intelligence: evidence(raw.intelligence),
    speed: evidence(raw.speed),
  };
}
