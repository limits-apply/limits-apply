import type {
  Candidate, LocalOverlay, RankedCandidate, Rejection, Verdict, WorkloadProfile,
} from "./types";
import { overlayProfile } from "./profile";

function effectiveCost(candidate: Candidate, profile: WorkloadProfile): number {
  const input = profile.inputTokensPerTurn / 1_000_000 * candidate.inputRateUsdPerMillion.value;
  const cached = profile.cachedInputTokensPerTurn / 1_000_000
    * candidate.cachedInputRateUsdPerMillion.value * (1 - profile.cacheDiscount);
  const output = profile.outputTokensPerTurn / 1_000_000 * candidate.outputRateUsdPerMillion.value;
  return input + cached + output;
}

function reject(candidate: Candidate, profile: WorkloadProfile, now: string): Rejection | null {
  if (!candidate.compatible) return { candidateId: candidate.id, code: "incompatible", reason: "Gateway compatibility is not verified." };
  if (candidate.identityWorkaround) return { candidateId: candidate.id, code: "identity-workaround", reason: "The access path requires a prohibited identity workaround." };
  if (profile.availableCredentials && candidate.credentials.some(name => !profile.availableCredentials!.includes(name))) {
    return { candidateId: candidate.id, code: "credentials", reason: "A required local credential is unavailable." };
  }
  if (profile.region !== "global" && !candidate.regions.includes(profile.region)) return { candidateId: candidate.id, code: "region", reason: `The access path is unavailable in ${profile.region}.` };
  if (candidate.concurrency < profile.minimumConcurrency) return { candidateId: candidate.id, code: "concurrency", reason: `Concurrency ${candidate.concurrency} is below the required ${profile.minimumConcurrency}.` };
  if (candidate.priceUsd.expires && candidate.priceUsd.expires < now) return { candidateId: candidate.id, code: "stale-evidence", reason: "Critical price evidence has expired." };
  return null;
}

function frontier(rows: RankedCandidate[]): { frontier: RankedCandidate[]; dominated: RankedCandidate[] } {
  const dominated = rows.filter(row => rows.some(other => other !== row
    && other.candidate.intelligence.value >= row.candidate.intelligence.value
    && other.effectiveCostUsd <= row.effectiveCostUsd
    && other.speed >= row.speed
    && (other.candidate.intelligence.value > row.candidate.intelligence.value
      || other.effectiveCostUsd < row.effectiveCostUsd || other.speed > row.speed)));
  return { frontier: rows.filter(row => !dominated.includes(row)), dominated };
}

export function buildVerdict(
  candidates: Candidate[],
  profile: WorkloadProfile,
  evidenceVersion: string,
  now = new Date().toISOString().slice(0, 10),
): Verdict {
  const rejected: Rejection[] = [];
  const eligible: RankedCandidate[] = [];
  for (const candidate of candidates) {
    const reason = reject(candidate, profile, now);
    if (reason) rejected.push(reason);
    else eligible.push({
      candidate,
      effectiveCostUsd: effectiveCost(candidate, profile),
      capacity: candidate.allowanceUsd.value == null ? null : candidate.allowanceUsd.value / effectiveCost(candidate, profile),
      speed: candidate.speed.value,
    });
  }
  const { frontier: front, dominated } = frontier(eligible);
  const remote = frontier(eligible.filter(row => row.candidate.billing !== "local")).frontier;
  const build = remote
    .filter(row => row.candidate.intelligence.value >= profile.intelligenceFloor)
    .sort((a, b) => a.effectiveCostUsd - b.effectiveCostUsd || b.speed - a.speed)[0]?.candidate.id ?? null;
  const plan = remote
    .filter(row => row.effectiveCostUsd * profile.turnsPerMonth <= profile.monthlyBudgetUsd)
    .sort((a, b) => b.candidate.intelligence.value - a.candidate.intelligence.value
      || a.effectiveCostUsd - b.effectiveCostUsd || b.speed - a.speed)[0]?.candidate.id ?? null;
  const selected = { build, plan };
  const formulas = [
    "effective cost = input + cached input × (1 − cache discount) + output",
    "build = cheapest frontier candidate above the intelligence floor",
    "plan = strongest frontier candidate within the monthly budget",
  ];
  const body = JSON.stringify({ evidenceVersion, profile, selected, rejected, frontier: front.map(row => row.candidate.id) });
  let hash = 2166136261;
  for (let index = 0; index < body.length; index += 1) hash = Math.imul(hash ^ body.charCodeAt(index), 16777619);
  return {
    id: `verdict-${(hash >>> 0).toString(16)}`,
    evidenceVersion,
    profile,
    selected,
    fallbacks: {},
    frontier: front,
    dominated,
    rejected,
    formulas,
    degraded: rejected.length > 0 && front.length === 0,
    generatedAt: now,
  };
}

export function personalizeVerdict(candidates: Candidate[], base: WorkloadProfile, overlay: LocalOverlay, evidenceVersion: string, now?: string): Verdict {
  return buildVerdict(candidates, overlayProfile(base, overlay), evidenceVersion, now);
}
