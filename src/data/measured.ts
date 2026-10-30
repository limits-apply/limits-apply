/**
 * First-party measurement rows. A first-party run enters the ladder at rung
 * `observed` — one subscriber (us) measuring one account under a stated
 * protocol; the layer is 2, the rung is not new.
 */
export interface FirstPartyMeasurement {
  /**
   * A subscription row (apiPerPercent set) names its plans.json row exactly, so
   * the trace can strengthen that plan's allowance. A metered control
   * (apiPerPercent null) names its access path in plain words instead — a
   * pay-as-you-go API is not a plan and never joins PLANS.
   */
  plan: string;
  configuration: string;            // "claude-opus-5 · Claude Code 2.1.x"
  workload: string;                 // "wl-001@v1"
  window: string;                   // human description with dates
  windowDays: number;
  runs: number;                     // ≥ 10, the protocol minimum
  outcomes: { pass: number; partial: number; fail: number };
  /** [low, high] API-equivalent USD per 1% of the window; null for a metered access path. */
  apiPerPercent: [number, number] | null;
  evidence: string;                 // sanitized run-log artifact (repo path or durable URL)
  verified: string;                 // date of the last run in the log
  sources: [label: string, href: string][];
  basis: "first-party";
}

export const FIRST_PARTY_MEASUREMENTS: FirstPartyMeasurement[] = [];
