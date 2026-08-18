import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { GateProfile } from "./profile";
import type { LiteLlmConfig } from "./litellm";
import type { AuditEntry } from "./audit";

export interface GatePaths {
  root: string;
  profile: string;
  verdict: string;
  runtime: string;
  audit: string;
}

export function gatePaths(root: string): GatePaths {
  return {
    root,
    profile: join(root, "profile.json"),
    verdict: join(root, "verdict.json"),
    runtime: join(root, "litellm.yaml"),
    audit: join(root, "audit.jsonl"),
  };
}

export function defaultGateRoot(env: NodeJS.ProcessEnv, home: string): string {
  if (env.LIMITSAPPLY_HOME) return env.LIMITSAPPLY_HOME;
  if (env.XDG_CONFIG_HOME) return join(env.XDG_CONFIG_HOME, "limitsapply");
  return join(home, ".config", "limitsapply");
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.next`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
}

/**
 * Absent means first run, so the fallback is written. Anything else — corrupt JSON,
 * bad permissions — throws: `bootstrapProfile` writes back whatever this returns, so
 * swallowing the error would silently overwrite the profile the caller could not read.
 */
export async function readProfile(paths: GatePaths, fallback: GateProfile): Promise<GateProfile> {
  let raw: string;
  try {
    raw = await readFile(paths.profile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
  try {
    return JSON.parse(raw) as GateProfile;
  } catch (error) {
    throw new Error(`${paths.profile} is not valid JSON: ${(error as Error).message}`);
  }
}

export async function writeProfile(paths: GatePaths, profile: GateProfile): Promise<void> {
  await atomicWrite(paths.profile, `${JSON.stringify(profile, null, 2)}\n`);
}

export async function writeRuntime(paths: GatePaths, config: LiteLlmConfig): Promise<void> {
  await atomicWrite(paths.runtime, `${JSON.stringify(config, null, 2)}\n`);
}

export async function writeVerdict(paths: GatePaths, verdict: unknown): Promise<void> {
  await atomicWrite(paths.verdict, `${JSON.stringify(verdict, null, 2)}\n`);
}

export async function appendAudit(paths: GatePaths, entry: AuditEntry): Promise<void> {
  await mkdir(dirname(paths.audit), { recursive: true });
  await appendFile(paths.audit, `${JSON.stringify(entry)}\n`, "utf8");
}
