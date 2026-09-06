import type { Candidate, Verdict, WorkloadProfile } from "./types";
import type { AgentPair, AgentVerdict } from "./agents";

export interface EvidenceSnapshot {
  kind: "evidence";
  version: string;
  retrievedAt: string;
  candidates: Candidate[];
  agentPairs?: AgentPair[];
}

export interface VerdictSnapshot {
  kind: "verdict";
  version: string;
  evidenceVersion: string;
  generatedAt: string;
  profile: WorkloadProfile;
  verdict: Verdict;
  agents?: AgentVerdict;
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function validateEvidenceSnapshot(snapshot: EvidenceSnapshot): string[] {
  const errors: string[] = [];
  if (snapshot.kind !== "evidence") errors.push("kind must be evidence");
  if (!snapshot.version) errors.push("version is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.retrievedAt)) errors.push("retrievedAt must be an ISO date");
  const ids = new Set<string>();
  for (const candidate of snapshot.candidates) {
    if (ids.has(candidate.id)) errors.push(`duplicate candidate ${candidate.id}`);
    ids.add(candidate.id);
    if (!(candidate.intelligence.value >= 0)) errors.push(`${candidate.id} has invalid intelligence`);
    if (!(candidate.speed.value > 0)) errors.push(`${candidate.id} has invalid speed`);
    if (!(candidate.concurrency >= 0)) errors.push(`${candidate.id} has invalid concurrency`);
  }
  if (snapshot.agentPairs) {
    const pairIds = new Set<string>();
    for (const pair of snapshot.agentPairs) {
      if (pairIds.has(pair.id)) errors.push(`duplicate agent pair ${pair.id}`);
      pairIds.add(pair.id);
      if (!(pair.index.value >= 0 && pair.index.value <= 100)) errors.push(`${pair.id} has invalid index`);
      if (!(pair.minutesPerTask.value > 0)) errors.push(`${pair.id} has invalid minutesPerTask`);
    }
  }
  return errors;
}

export function validateVerdictSnapshot(snapshot: VerdictSnapshot): string[] {
  const errors = snapshot.kind === "verdict" ? [] : ["kind must be verdict"];
  if (!snapshot.version) errors.push("version is required");
  if (snapshot.evidenceVersion !== snapshot.verdict.evidenceVersion) errors.push("evidence versions do not match");
  if (snapshot.profile.id !== snapshot.verdict.profile.id) errors.push("profiles do not match");
  if (!snapshot.verdict.routes) errors.push("verdict predates ranked routes");
  return errors;
}
