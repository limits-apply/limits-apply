import type { EvidenceSnapshot } from "@limits-apply/intelligence";
import { validateEvidenceSnapshot } from "@limits-apply/intelligence";

export function parseEvidenceSnapshot(raw: string): EvidenceSnapshot {
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
