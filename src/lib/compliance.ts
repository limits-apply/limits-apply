/**
 * What the terms say about each way of buying more capacity — docs/tos-positions.md
 * and the plan's §8.6. A position is a reading, not legal advice: it is dated, and a
 * terms change reopens it.
 *
 * Pure data and predicates — no DOM, no provider figures. Covered by
 * test/compliance.test.ts.
 */

export type ComplianceStatus = "allowed" | "requires_confirmation" | "prohibited" | "unknown";

export const COMPLIANCE_STATUSES = [
  "allowed",
  "requires_confirmation",
  "prohibited",
  "unknown",
] as const;

export interface CompliancePosition {
  status: ComplianceStatus;
  rationale: string;
  termsUrl: string | null;
  checkedAt: string;
  source: "official_terms" | "secondary" | "none";
}

export type ComplianceOption =
  | "single-plan"
  | "higher-tier"
  | "paid-top-up"
  | "multi-provider"
  | "team-seats"
  | "multi-account-same-plan";

const OPENCODE_TERMS = "https://dev.opencode.ai/legal/terms-of-service";
const CHECKED_AT = "2026-10-18";

export const COMPLIANCE_POSITIONS: Record<ComplianceOption, CompliancePosition> = {
  "single-plan": {
    status: "allowed",
    rationale:
      "One paid seat used by the person who bought it is the arrangement the terms are written for.",
    termsUrl: OPENCODE_TERMS,
    checkedAt: CHECKED_AT,
    source: "official_terms",
  },
  "higher-tier": {
    status: "allowed",
    rationale:
      "Buying the vendor's own next tier adds capacity through the contract rather than around it.",
    termsUrl: OPENCODE_TERMS,
    checkedAt: CHECKED_AT,
    source: "official_terms",
  },
  "paid-top-up": {
    status: "requires_confirmation",
    rationale:
      "Paid credits or overage count only where the provider offers them on the account; no clause turns a top-up into a right, so the offer has to be confirmed first.",
    termsUrl: OPENCODE_TERMS,
    checkedAt: CHECKED_AT,
    source: "official_terms",
  },
  "multi-provider": {
    status: "allowed",
    rationale:
      "Distinct companies on separate accounts: each provider's terms govern its own share, and no contract is being circumvented.",
    termsUrl: OPENCODE_TERMS,
    checkedAt: CHECKED_AT,
    source: "official_terms",
  },
  "team-seats": {
    status: "requires_confirmation",
    rationale:
      "Seats or licences are permitted only when the vendor explicitly authorises them for the users concerned; the seat agreement has to be confirmed before purchase.",
    termsUrl: OPENCODE_TERMS,
    checkedAt: CHECKED_AT,
    source: "official_terms",
  },
  "multi-account-same-plan": {
    status: "prohibited",
    rationale:
      "OpenCode's terms forbid using multiple accounts to avoid caps, access restrictions or billing rules. A second personal account bought to multiply one person's quota is exactly that.",
    termsUrl: OPENCODE_TERMS,
    checkedAt: CHECKED_AT,
    source: "official_terms",
  },
};

export function positionFor(key: string): CompliancePosition | null {
  return (COMPLIANCE_POSITIONS as Record<string, CompliancePosition>)[key] ?? null;
}

/** Everything but a prohibited or unknown position may be recommended. */
export function isRecommendable(status: ComplianceStatus): boolean {
  return status === "allowed" || status === "requires_confirmation";
}

export function recommendableOptions(): ComplianceOption[] {
  return (Object.keys(COMPLIANCE_POSITIONS) as ComplianceOption[])
    .filter(key => isRecommendable(COMPLIANCE_POSITIONS[key].status));
}

export function prohibitedOptions(): ComplianceOption[] {
  return (Object.keys(COMPLIANCE_POSITIONS) as ComplianceOption[])
    .filter(key => COMPLIANCE_POSITIONS[key].status === "prohibited");
}
