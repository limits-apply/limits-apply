/** Types for the exports test/opencode-scrape.test.ts drives; `scripts/` is otherwise plain JS. */

/** One plan tier as the docs page publishes it. */
export interface GoTier {
  price: number;
  models: GoModel[];
}

/** One rationed model row. */
export interface GoModel {
  /** The API's own model id. */
  slug: string;
  /** The display name, variant suffix removed. */
  name: string;
  /** Monthly dollars of usage, or null on an unlimited promotional row. */
  usdPerMonth: number | null;
  unlimited: boolean;
  requestsPer5h: number | null;
  requestsPerWeek: number | null;
  requestsPerMonth: number | null;
}

export interface GoSnapshot {
  source: string;
  source_url: string;
  notes: string;
  plans: Record<string, GoTier>;
}

export declare function fetchOpenCodeFrom(page: string): GoSnapshot;

export declare function fetchOpenCode(): Promise<GoSnapshot>;

export declare function summarizeOpenCode(snapshot: GoSnapshot): string;
