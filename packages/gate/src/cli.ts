import type { Candidate, VerdictSnapshot } from "@limits-apply/intelligence";
import { defaultGateProfile, type GateProfile } from "./profile";
import { type OpencodeChange, mergeOpencodeConfig } from "./opencode";
import { type SmokePoster, smokeTestAliases } from "./smoke";
import { type GatePaths, readProfile, writeProfile } from "./storage";
import { updateGate } from "./update";

export async function bootstrapProfile(paths: GatePaths): Promise<GateProfile> {
  const profile = await readProfile(paths, defaultGateProfile());
  await writeProfile(paths, profile);
  return profile;
}

export interface UpdateOptions {
  paths: GatePaths;
  snapshot: VerdictSnapshot;
  candidates: Candidate[];
  readOpencodeConfig: () => Promise<Record<string, unknown>>;
  writeOpencodeConfig: (config: Record<string, unknown>) => Promise<void>;
  post?: SmokePoster;
  now?: string;
}

export interface UpdateResult {
  gate: "noop" | "activated" | "failed";
  opencodeChanges: OpencodeChange[];
  smoke: Record<string, boolean> | null;
}

export async function runUpdate(options: UpdateOptions): Promise<UpdateResult> {
  // The smoke test passed to updateGate is a static pass: the real network probe runs after
  // activation, below. Feeding its result back into automatic rollback needs updateGate and
  // activate to become async, which is worth doing once Gate drives a live LiteLLM process.
  const gate = await updateGate(options.paths, options.snapshot, options.candidates, () => true, options.now);
  if (gate !== "activated") return { gate, opencodeChanges: [], smoke: null };

  const current = await options.readOpencodeConfig();
  const { config, changes } = mergeOpencodeConfig(current);
  if (changes.length > 0) await options.writeOpencodeConfig(config);

  let smoke: Record<string, boolean> | null = null;
  if (options.post) {
    const aliases = (["build", "plan"] as const).filter(alias => options.snapshot.verdict.selected[alias] !== null);
    smoke = await smokeTestAliases(options.post, "http://127.0.0.1:4000", aliases);
  }

  return { gate, opencodeChanges: changes, smoke };
}
