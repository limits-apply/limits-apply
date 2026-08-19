import { readFile } from "node:fs/promises";
import type { Candidate, VerdictSnapshot } from "@limits-apply/intelligence";
import { stableJson } from "@limits-apply/intelligence";
import { auditEntry, isNoop } from "./audit";
import { activate } from "./activation";
import { generateLiteLlmConfig, type LiteLlmConfig } from "./litellm";
import { appendAudit, type GatePaths, writeRuntime, writeVerdict } from "./storage";

function hash(value: unknown): string {
  let result = 2166136261;
  const text = stableJson(value);
  for (let index = 0; index < text.length; index += 1) result = Math.imul(result ^ text.charCodeAt(index), 16777619);
  return (result >>> 0).toString(16);
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function updateGate(
  paths: GatePaths,
  snapshot: VerdictSnapshot,
  candidates: Candidate[],
  smokeTest: (config: LiteLlmConfig) => boolean,
  now = new Date().toISOString(),
): Promise<"noop" | "activated" | "failed"> {
  const previous = await readJson<VerdictSnapshot>(paths.verdict);
  const oldId = previous?.verdict.id ?? null;
  const profileHash = hash(snapshot.profile);
  const current = await readJson<LiteLlmConfig>(paths.runtime);
  const config = generateLiteLlmConfig(snapshot.verdict, candidates);
  if (isNoop(oldId, snapshot.verdict.id) && current && stableJson(current) === stableJson(config)) {
    await appendAudit(paths, auditEntry("noop", { at: now, oldVerdict: oldId, newVerdict: oldId, profileHash }));
    return "noop";
  }

  const result = activate(current, config, smokeTest);
  if (result.error) {
    await appendAudit(paths, auditEntry("failure", {
      at: now, oldVerdict: oldId, newVerdict: snapshot.verdict.id, profileHash, reason: result.error,
    }));
    return "failed";
  }

  await writeRuntime(paths, config);
  await writeVerdict(paths, snapshot);
  await appendAudit(paths, auditEntry("activate", {
    at: now, oldVerdict: oldId, newVerdict: snapshot.verdict.id, profileHash,
  }));
  return "activated";
}
