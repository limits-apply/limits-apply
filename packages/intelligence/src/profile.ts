import type { LocalOverlay, WorkloadProfile } from "./types";

export const GLOBAL_PROFILE: WorkloadProfile = {
  id: "global-v1",
  currency: "USD",
  monthlyBudgetUsd: 20,
  turnsPerMonth: 100,
  inputTokensPerTurn: 12_000,
  cachedInputTokensPerTurn: 0,
  outputTokensPerTurn: 1_500,
  cacheDiscount: 0,
  minimumConcurrency: 2,
  intelligenceFloor: 45,
  region: "global",
};

export function overlayProfile(base: WorkloadProfile, overlay: LocalOverlay = {}): WorkloadProfile {
  return {
    ...base,
    id: overlay === undefined ? base.id : `${base.id}+local`,
    monthlyBudgetUsd: overlay.monthlyBudgetUsd ?? base.monthlyBudgetUsd,
    minimumConcurrency: overlay.minimumConcurrency ?? base.minimumConcurrency,
    intelligenceFloor: overlay.intelligenceFloor ?? base.intelligenceFloor,
    region: overlay.region ?? base.region,
    availableCredentials: overlay.credentials ?? base.availableCredentials,
    exhaustedDomains: overlay.exhaustedDomains ?? base.exhaustedDomains,
  };
}
