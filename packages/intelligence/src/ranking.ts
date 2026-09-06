import type {
  Candidate, LocalOverlay, RankedCandidate, Rejection, TaskClass, Verdict, WorkloadProfile,
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
  if (profile.exhaustedDomains?.includes(candidate.failureDomain)) {
    return { candidateId: candidate.id, code: "exhausted", reason: "The observed quota window on this access path has not reopened yet." };
  }
  return null;
}

/** Two access paths on one failure domain share a ceiling, so the second is not a route out of the first. */
function routeOrder(rows: RankedCandidate[]): string[] {
  const domains = new Set<string>();
  const ids: string[] = [];
  for (const row of rows) {
    if (domains.has(row.candidate.failureDomain)) continue;
    domains.add(row.candidate.failureDomain);
    ids.push(row.candidate.id);
  }
  return ids;
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

export const DEFAULT_CLASSES: TaskClass[] = [
  { alias: "build", pick: "cheapest-above-floor", fallbackAlias: "plan" },
  { alias: "plan", pick: "strongest-within-budget" },
];

function classRoute(cls: TaskClass, pool: RankedCandidate[], profile: WorkloadProfile): string[] {
  const floor = cls.intelligenceFloor ?? profile.intelligenceFloor;
  const budget = cls.monthlyBudgetUsd ?? profile.monthlyBudgetUsd;
  const rows = cls.pick === "cheapest-above-floor"
    ? pool.filter(row => row.candidate.intelligence.value >= floor)
      .sort((a, b) => a.effectiveCostUsd - b.effectiveCostUsd || b.speed - a.speed)
    : pool.filter(row => row.effectiveCostUsd * profile.turnsPerMonth <= budget)
      .sort((a, b) => b.candidate.intelligence.value - a.candidate.intelligence.value
        || a.effectiveCostUsd - b.effectiveCostUsd || b.speed - a.speed);
  return routeOrder(rows);
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
  // A local model costs nothing to run, so pooled with priced candidates it would take `build` on cost
  // alone and say nothing about the market. It fills an alias only when the evidence asks a local-only
  // question — never when a remote candidate exists but was rejected, which stays the hard failure
  // `docs/gate-parity.md` preserves from rank.py's `paths()`. Pooling is also allowed when the
  // profile opts in — a personal verdict routing its own machine is the point, and the class floor
  // is what keeps "free" from meaning "always".
  const pool = candidates.every(candidate => candidate.billing === "local") || profile.includeLocal
    ? front
    : frontier(eligible.filter(row => row.candidate.billing !== "local")).frontier;
  const classes = profile.taskClasses ?? DEFAULT_CLASSES;
  const seen = new Set<string>();
  for (const cls of classes) {
    if (seen.has(cls.alias)) throw new Error(`duplicate task class "${cls.alias}"`);
    seen.add(cls.alias);
  }
  for (const cls of classes) {
    if (cls.fallbackAlias && !seen.has(cls.fallbackAlias)) {
      throw new Error(`task class "${cls.alias}" falls back to unknown alias "${cls.fallbackAlias}"`);
    }
  }
  const routes = Object.fromEntries(classes.map(cls => [cls.alias, classRoute(cls, pool, profile)]));
  const selected = Object.fromEntries(classes.map(cls => [cls.alias, routes[cls.alias][0] ?? null]));
  const fallbacks = Object.fromEntries(classes
    .filter(cls => cls.fallbackAlias && selected[cls.alias] && selected[cls.fallbackAlias])
    .map(cls => [cls.alias, [cls.fallbackAlias as string]]));
  const formulas = ["effective cost = input + cached input × (1 − cache discount) + output"];
  for (const cls of classes) {
    formulas.push(cls.pick === "cheapest-above-floor"
      ? `${cls.alias} = cheapest frontier candidate above the intelligence floor`
      : `${cls.alias} = strongest frontier candidate within the monthly budget`);
  }
  const body = JSON.stringify({ evidenceVersion, profile, selected, routes, rejected, frontier: front.map(row => row.candidate.id) });
  let hash = 2166136261;
  for (let index = 0; index < body.length; index += 1) hash = Math.imul(hash ^ body.charCodeAt(index), 16777619);
  return {
    id: `verdict-${(hash >>> 0).toString(16)}`,
    evidenceVersion,
    profile,
    selected,
    routes,
    fallbacks,
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
