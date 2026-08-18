import type { LocalOverlay } from "@limits-apply/intelligence";

export interface GateProfile extends LocalOverlay {
  version: 1;
  region: string;
  credentialNames: string[];
}

export const defaultGateProfile = (): GateProfile => ({
  version: 1,
  region: "global",
  credentialNames: [],
});

export function profileOverlay(profile: GateProfile): LocalOverlay {
  return {
    ...profile,
    credentials: profile.credentialNames,
  };
}
