import { readFile } from "node:fs/promises";
import type { Candidate, VerdictSnapshot } from "@limits-apply/intelligence";
import { stableJson } from "@limits-apply/intelligence";
import { auditEntry, isNoop } from "./audit";
import { activate, rollback } from "./activation";
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
  smokeTest: (config: LiteLlmConfig) => Promise<boolean>,
  now = new Date().toISOString(),
): Promise<"noop" | "activated" | "failed" | "rolled-back" | "kept"> {
  const previous = await readJson<VerdictSnapshot>(paths.verdict);
  const oldId = previous?.verdict.id ?? null;
  const profileHash = hash(snapshot.profile);
  const current = await readJson<LiteLlmConfig>(paths.runtime);
  const config = generateLiteLlmConfig(snapshot.verdict, candidates);
  // The dispatch advice is compared on its own: it comes from `agentPicks`, which the verdict id
  // does not hash and the LiteLLM config never carries, so neither of the other two halves would
  // notice a profile that has just started — or stopped — asking for it.
  const sameAdvice = stableJson(previous?.agents ?? null) === stableJson(snapshot.agents ?? null);
  if (isNoop(oldId, snapshot.verdict.id) && current && stableJson(current) === stableJson(config) && sameAdvice) {
    await appendAudit(paths, auditEntry("noop", { at: now, oldVerdict: oldId, newVerdict: oldId, profileHash }));
    // Probed anyway. Nothing was written, so there is nothing to roll back, but "the config on
    // disk is already the one you want" and "the proxy serving it answers" are separate questions
    // and --smoke was asked the second one.
    await smokeTest(config);
    return "noop";
  }

  const routed = Object.entries(snapshot.verdict.selected).filter(([, id]) => id).map(([alias]) => alias);
  const result = activate(current, config, routed);
  if (result.error) {
    await appendAudit(paths, auditEntry("failure", {
      at: now, oldVerdict: oldId, newVerdict: snapshot.verdict.id, profileHash, reason: result.error,
    }));
    return "failed";
  }

  await writeRuntime(paths, config);
  await writeVerdict(paths, snapshot);

  if (!(await smokeTest(config))) {
    // The runtime is what LiteLLM serves, so it goes back whenever there is one to go back to —
    // even if the verdict beside it was unreadable. The reason then says so rather than claiming
    // a restore that only half happened.
    const restored = result.previous ? rollback(result) : null;
    const undone = Boolean(restored?.active);
    if (restored?.active) {
      await writeRuntime(paths, restored.active);
      if (previous) await writeVerdict(paths, previous);
    }
    await appendAudit(paths, auditEntry("rollback", {
      at: now, oldVerdict: oldId, newVerdict: snapshot.verdict.id, profileHash,
      reason: `smoke test failed; ${restored
        ? previous
          ? "restored the previous configuration"
          : "restored the previous runtime, but no previous verdict was readable"
        : "no previous configuration to restore"}`,
    }));
    return undone ? "rolled-back" : "kept";
  }

  await appendAudit(paths, auditEntry("activate", {
    at: now, oldVerdict: oldId, newVerdict: snapshot.verdict.id, profileHash,
  }));
  return "activated";
}
