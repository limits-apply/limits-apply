import type { Candidate, VerdictSnapshot } from "@limits-apply/intelligence";
import { defaultGateProfile, type GateProfile } from "./profile";
import type { ConfigChange, HarnessMerge } from "./harness";
import type { LiteLlmConfig } from "./litellm";
import { DEFAULT_PROXY, type SmokePoster, smokeTestAliases } from "./smoke";
import { type GatePaths, readProfile, writeProfile } from "./storage";
import { updateGate } from "./update";

export async function bootstrapProfile(paths: GatePaths): Promise<GateProfile> {
  const profile = await readProfile(paths, defaultGateProfile());
  await writeProfile(paths, profile);
  return profile;
}

/** One harness config file this run is allowed to touch, already resolved to a path by the caller. */
export interface HarnessTarget {
  id: string;
  merge: HarnessMerge;
  read: () => Promise<Record<string, unknown>>;
  write: (config: Record<string, unknown>) => Promise<void>;
}

export interface UpdateOptions {
  paths: GatePaths;
  snapshot: VerdictSnapshot;
  candidates: Candidate[];
  harnesses: HarnessTarget[];
  post?: SmokePoster;
  proxy?: string;
  now?: string;
}

export interface UpdateResult {
  gate: "noop" | "activated" | "failed" | "rolled-back" | "kept";
  changes: Record<string, ConfigChange[]>;
  smoke: Record<string, boolean> | null;
}

export async function runUpdate(options: UpdateOptions): Promise<UpdateResult> {
  const post = options.post;
  let smoke: Record<string, boolean> | null = null;
  // Only the primary alias of each route is probed. `model_list` also carries each route's ranked
  // fallbacks (`build-2`, `plan-2`, …), and a fallback that can't answer is what the chain is for.
  const smokeTest = post
    ? async (config: LiteLlmConfig): Promise<boolean> => {
        const deployed = new Set(config.model_list.map(model => model.model_name));
        const aliases = Object.keys(options.snapshot.verdict.routes).filter(alias => deployed.has(alias));
        smoke = await smokeTestAliases(post, options.proxy ?? DEFAULT_PROXY, aliases);
        return Object.values(smoke).every(Boolean);
      }
    : async (): Promise<boolean> => true;

  const gate = await updateGate(options.paths, options.snapshot, options.candidates, smokeTest, options.now);
  // `noop` as well as `activated`: what a harness gets written is the proxy address, not the
  // verdict, so the only question is whether the config Gate wants is the one on disk. It is in
  // both cases — and a reader who adds `--pi` to a root that is already current means it.
  if (gate !== "activated" && gate !== "noop") return { gate, changes: {}, smoke };

  const changes: Record<string, ConfigChange[]> = {};
  for (const harness of options.harnesses) {
    // DEFAULT_PROXY, never `options.proxy`: `generateLiteLlmConfig` always binds port 4000 and
    // `validateConfig` rejects anything but loopback, so that is where the proxy Gate wrote is.
    // `--proxy` redirects the probe alone — pointing a harness somewhere Gate didn't configure
    // would leave opencode.json and litellm.yaml disagreeing about the address.
    const merged = harness.merge(await harness.read(), DEFAULT_PROXY);
    if (merged.changes.length > 0) await harness.write(merged.config);
    changes[harness.id] = merged.changes;
  }

  return { gate, changes, smoke };
}
