import type { EvidenceSnapshot, VerdictSnapshot } from "@limits-apply/intelligence";
import { validateEvidenceSnapshot, validateVerdictSnapshot } from "@limits-apply/intelligence";

export function parseCurrentVerdict(raw: string): VerdictSnapshot {
  let parsed: VerdictSnapshot;
  try {
    parsed = JSON.parse(raw) as VerdictSnapshot;
  } catch {
    throw new Error("current verdict is not valid JSON");
  }
  const errors = validateVerdictSnapshot(parsed);
  if (errors.length) throw new Error(`invalid current verdict: ${errors.join("; ")}`);
  return parsed;
}

export function parseEvidence(raw: string): EvidenceSnapshot {
  let parsed: EvidenceSnapshot;
  try {
    parsed = JSON.parse(raw) as EvidenceSnapshot;
  } catch {
    throw new Error("evidence snapshot is not valid JSON");
  }
  const errors = validateEvidenceSnapshot(parsed);
  if (errors.length) throw new Error(`invalid evidence snapshot: ${errors.join("; ")}`);
  return parsed;
}
