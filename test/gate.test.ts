import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { mergeOpencodeConfig } from "../packages/gate/src/opencode";
import { smokeTestAlias, smokeTestAliases } from "../packages/gate/src/smoke";
import { bootstrapProfile, runUpdate } from "../packages/gate/src/cli";
import { gatePaths } from "../packages/gate/src/storage";
import { generateLiteLlmConfig } from "../packages/gate/src/litellm";
import { liveQuota, scanOpencodeMessages } from "../packages/gate/src/quota";
import { GLOBAL_PROFILE, buildVerdict } from "../packages/intelligence/src/index";
import type { Candidate } from "../packages/intelligence/src/index";


test("merges build/plan aliases without touching unrelated top-level keys", () => {
  const config = { mcp: { some: "server" }, provider: { other: { name: "Other" } } };
  const { config: next } = mergeOpencodeConfig(config);
  expect(next.mcp).toEqual({ some: "server" });
  expect((next.provider as Record<string, unknown>).other).toEqual({ name: "Other" });
  expect((next.provider as Record<string, unknown>).LIMITSAPPLY).toMatchObject({
    models: { build: { name: expect.any(String) }, plan: { name: expect.any(String) } },
  });
  expect(next.model).toBe("LIMITSAPPLY/build");
  expect((next.mode as Record<string, unknown>).build).toMatchObject({ model: "LIMITSAPPLY/build" });
  expect((next.mode as Record<string, unknown>).plan).toMatchObject({ model: "LIMITSAPPLY/plan" });
});

test("reports no changes when re-applying the same config", () => {
  const first = mergeOpencodeConfig({});
  const second = mergeOpencodeConfig(first.config);
  expect(second.changes).toEqual([]);
});

test("reports changes when the LiteLLM base URL differs", () => {
  const first = mergeOpencodeConfig({});
  const second = mergeOpencodeConfig(first.config, "http://127.0.0.1:5000/v1");
  expect(second.changes.length).toBeGreaterThan(0);
});

test("does not mutate the caller's original config, provider, or mode objects", () => {
  const config = {
    provider: { other: { name: "Other" } },
    mode: { build: { model: "old-build" }, plan: { model: "old-plan" } },
  };
  const providerSnapshot = { ...config.provider };
  const modeSnapshot = { ...config.mode };

  mergeOpencodeConfig(config);

  expect(config.provider).toEqual(providerSnapshot);
  expect(config.mode).toEqual(modeSnapshot);
});

test("a 200 response containing pong passes", async () => {
  const post = async () => ({ status: 200, body: "pong" });
  expect(await smokeTestAlias(post, "http://127.0.0.1:4000", "build")).toBe(true);
});

test("a 429 rate-limit response passes — it still proves correct wiring and auth", async () => {
  const post = async () => ({ status: 429, body: "RateLimitError: usage limit reached" });
  expect(await smokeTestAlias(post, "http://127.0.0.1:4000", "build")).toBe(true);
});

test("a 200 response with unrelated content fails", async () => {
  const post = async () => ({ status: 200, body: "{}" });
  expect(await smokeTestAlias(post, "http://127.0.0.1:4000", "build")).toBe(false);
});

test("a 500 response fails", async () => {
  const post = async () => ({ status: 500, body: "internal error" });
  expect(await smokeTestAlias(post, "http://127.0.0.1:4000", "build")).toBe(false);
});

test("smokeTestAliases checks every alias and reports per-alias results", async () => {
  const post = async (_url: string, body: unknown) => {
    const model = (body as { model: string }).model;
    return { status: 200, body: model === "build" ? "pong" : "nope" };
  };
  const results = await smokeTestAliases(post, "http://127.0.0.1:4000", ["build", "plan"]);
  expect(results).toEqual({ build: true, plan: false });
});

const evidence = <T>(value: T) => ({ value, rung: "measured" as const, source: "https://example.test", verified: "2026-08-17" });
const candidate = (id: string, intelligence: number, cost: number): Candidate => ({
  id, model: id, provider: id, endpoint: `http://127.0.0.1/${id}`, failureDomain: id,
  billing: "api", priceUsd: evidence(cost), allowanceUsd: evidence(null),
  inputRateUsdPerMillion: evidence(cost), cachedInputRateUsdPerMillion: evidence(cost),
  outputRateUsdPerMillion: evidence(cost), intelligence: evidence(intelligence), speed: evidence(100),
  compatible: true, identityWorkaround: false, regions: ["global"], credentials: [], concurrency: 4,
});

test("bootstrapProfile writes the default profile to disk when none exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "limits-apply-cli-"));
  try {
    const profile = await bootstrapProfile(gatePaths(root));
    expect(profile).toEqual({ version: 1, region: "global", credentialNames: [] });
    const onDisk = JSON.parse(await readFile(gatePaths(root).profile, "utf8"));
    expect(onDisk).toEqual(profile);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runUpdate activates, merges OpenCode config, and smoke-tests both aliases", async () => {
  const root = await mkdtemp(join(tmpdir(), "limits-apply-cli-"));
  try {
    const candidates = [candidate("cheap", 50, 1), candidate("smart", 70, 2)];
    const verdict = buildVerdict(candidates, { ...GLOBAL_PROFILE, turnsPerMonth: 1 }, "evidence-v1", "2026-08-17");
    const snapshot = { kind: "verdict" as const, version: "verdict-v1", evidenceVersion: "evidence-v1", generatedAt: "2026-08-17", profile: verdict.profile, verdict };
    let written: Record<string, unknown> | null = null;
    const result = await runUpdate({
      paths: gatePaths(root), snapshot, candidates,
      readOpencodeConfig: async () => ({ mcp: { keep: "me" } }),
      writeOpencodeConfig: async config => { written = config; },
      post: async (_url, body) => {
        const model = (body as { model: string }).model;
        return { status: 200, body: model === "build" || model === "plan" ? "pong" : "{}" };
      },
      now: "2026-08-17T00:00:00Z",
    });
    expect(result.gate).toBe("activated");
    expect(result.opencodeChanges.length).toBeGreaterThan(0);
    expect(result.smoke).toEqual({ build: true, plan: true });
    expect((written as unknown as Record<string, unknown>).mcp).toEqual({ keep: "me" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runUpdate short-circuits on a no-op verdict without touching OpenCode or smoke-testing", async () => {
  const root = await mkdtemp(join(tmpdir(), "limits-apply-cli-"));
  try {
    const candidates = [candidate("cheap", 50, 1)];
    const verdict = buildVerdict(candidates, { ...GLOBAL_PROFILE, turnsPerMonth: 1 }, "evidence-v1", "2026-08-17");
    const snapshot = { kind: "verdict" as const, version: "verdict-v1", evidenceVersion: "evidence-v1", generatedAt: "2026-08-17", profile: verdict.profile, verdict };
    const paths = gatePaths(root);
    await writeFile(paths.verdict, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    const runtime = generateLiteLlmConfig(verdict, candidates);
    await writeFile(paths.runtime, `${JSON.stringify(runtime, null, 2)}\n`, "utf8");
    let opencodeTouched = false;
    const result = await runUpdate({
      paths, snapshot, candidates,
      readOpencodeConfig: async () => { opencodeTouched = true; return {}; },
      writeOpencodeConfig: async () => { opencodeTouched = true; },
      now: "2026-08-17T01:00:00Z",
    });
    expect(result.gate).toBe("noop");
    expect(opencodeTouched).toBe(false);
    expect(result.smoke).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the last reading of a domain wins, and a window that has reopened stops rejecting", () => {
  const events = [
    { domain: "seat", observedAt: "2026-08-18T00:00:00Z", resetsAt: "2026-08-18T05:00:00Z", rung: "derived" as const, source: "window-length" },
    { domain: "seat", observedAt: "2026-08-18T06:00:00Z", resetsAt: "2026-08-18T11:00:00Z", rung: "observed" as const, source: "retry-after" },
    { domain: "other", observedAt: "2026-08-18T00:00:00Z", resetsAt: "2026-08-18T01:00:00Z", rung: "derived" as const, source: "window-length" },
  ];
  expect(liveQuota(events, "2026-08-18T07:00:00Z")).toEqual([events[1]]);
  expect(liveQuota(events, "2026-08-18T12:00:00Z")).toEqual([]);
});

test("locally observed quota state never leaks into the published Layer 1 surface", async () => {
  const { execSync } = await import("node:child_process");
  const hits = execSync(
    "git grep -l -E 'quota\\.jsonl|QuotaEvent' -- src packages/sources || true",
    { cwd: join(__dirname, ".."), encoding: "utf8" },
  ).trim();
  expect(hits).toBe("");
});

const refusal = (providerID: string, at: number, data: Record<string, unknown>) =>
  ({ role: "assistant", providerID, time: { created: at, completed: at }, error: { name: "ProviderError", data } });

test("a quota refusal without a reset time is derived from the window length, not published as observed", () => {
  const at = Date.parse("2026-08-18T06:00:00Z");
  const { events } = scanOpencodeMessages([refusal("vendor", at, { message: "429 rate limit exceeded" })], () => "vendor-domain", 5);
  expect(events).toEqual([{
    domain: "vendor-domain",
    observedAt: "2026-08-18T06:00:00.000Z",
    resetsAt: "2026-08-18T11:00:00.000Z",
    rung: "derived",
    source: "window-length",
  }]);
});

test("a refusal that names its own reopen time is recorded as observed", () => {
  const at = Date.parse("2026-08-18T06:00:00Z");
  const message = refusal("vendor", at, { message: "usage limit reached", resetsAt: "2026-08-18T09:30:00Z" });
  const { events } = scanOpencodeMessages([message], () => "vendor-domain", 5);
  expect(events[0]).toMatchObject({ resetsAt: "2026-08-18T09:30:00.000Z", rung: "observed", source: "provider-reset" });
});

test("an abort is not a refusal, and an unmapped provider is named rather than dropped", () => {
  const at = Date.parse("2026-08-18T06:00:00Z");
  const aborted = { role: "assistant", providerID: "vendor", time: { created: at }, error: { name: "MessageAbortedError", data: { message: "The operation was aborted." } } };
  expect(scanOpencodeMessages([aborted], () => "vendor-domain", 5).events).toEqual([]);

  const unknown = refusal("nowhere", at, { message: "429" });
  const result = scanOpencodeMessages([unknown], () => null, 5);
  expect(result.events).toEqual([]);
  expect(result.unmapped).toEqual(["nowhere"]);
});
