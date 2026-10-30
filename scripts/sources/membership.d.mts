/** Types for the exports test/membership.test.ts drives; `scripts/` is otherwise plain JS. */

export interface MembershipModel {
  slug: string;
  name: string;
  intelligence: number;
}

export interface MembershipRow {
  provider: string;
  best: MembershipModel;
  mapped: MembershipModel;
  gap: number;
  lagging: boolean;
}

export declare function membershipLag(models: MembershipModel[], mappedSlugs: string[]): MembershipRow[];

export declare function mappedSlugsFromSource(source: string): string[];

export declare function summarizeMembership(rows: MembershipRow[]): string;
