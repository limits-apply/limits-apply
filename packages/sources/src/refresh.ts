import type { EvidenceSnapshot, VerdictSnapshot } from "@limits-apply/intelligence";
import { validateEvidenceSnapshot, validateVerdictSnapshot } from "@limits-apply/intelligence";

export interface RefreshState {
  currentEvidence: EvidenceSnapshot | null;
  currentVerdict: VerdictSnapshot | null;
  degraded: boolean;
  errors: string[];
}

export function promoteRefresh(
  state: RefreshState,
  evidence: EvidenceSnapshot,
  verdict: VerdictSnapshot,
): RefreshState {
  const errors = [...validateEvidenceSnapshot(evidence), ...validateVerdictSnapshot(verdict)];
  if (verdict.evidenceVersion !== evidence.version) errors.push("verdict references a non-current evidence snapshot");
  if (errors.length) return { ...state, degraded: true, errors };
  return { currentEvidence: evidence, currentVerdict: verdict, degraded: false, errors: [] };
}
