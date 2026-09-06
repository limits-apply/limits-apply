import { expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CLASSES, GLOBAL_PROFILE, buildVerdict, overlayProfile, validateEvidenceSnapshot } from "../packages/intelligence/src/index";
import { activate, generateLiteLlmConfig, gatePaths, rollback, updateGate } from "../packages/gate/index";
import type { Candidate } from "../packages/intelligence/src/index";

const evidence = <T>(value: T) => ({ value, rung: "measured" as const, source: "https://example.test", verified: "2026-08-17" });
const candidate = (id: string, intelligence: number, cost: number): Candidate => ({
  id, model: id, provider: id, endpoint: `http://127.0.0.1/${id}`, failureDomain: id,
  billing: "api", priceUsd: evidence(cost), allowanceUsd: evidence(null),
  inputRateUsdPerMillion: evidence(cost), cachedInputRateUsdPerMillion: evidence(cost),
  outputRateUsdPerMillion: evidence(cost), intelligence: evidence(intelligence), speed: evidence(100),
  compatible: true, identityWorkaround: false, regions: ["global"], credentials: [], concurrency: 4,
});

test("global profile and local overlays are deterministic", () => {
  expect(GLOBAL_PROFILE.monthlyBudgetUsd).toBe(20);
  expect(overlayProfile(GLOBAL_PROFILE, { monthlyBudgetUsd: 5, region: "eu" })).toMatchObject({
    id: "global-v1+local", monthlyBudgetUsd: 5, region: "eu",
  });
});

test("verdict rejects hard-gated candidates and selects stable roles", () => {
  const candidates = [candidate("cheap", 50, 1), candidate("smart", 70, 2)];
  const verdict = buildVerdict(candidates, { ...GLOBAL_PROFILE, turnsPerMonth: 1 }, "evidence-v1", "2026-08-17");
  expect(verdict.selected.build).toBe("cheap");
  expect(verdict.selected.plan).toBe("smart");
  expect(verdict.id).toBe("verdict-" + verdict.id.slice("verdict-".length));
  expect(generateLiteLlmConfig(verdict, candidates).model_list[0].model_name).toBe("build");
});

test("build falls back to plan, and LiteLLM gets the list-of-dicts shape it documents", () => {
  const candidates = [candidate("cheap", 50, 1), candidate("smart", 70, 2)];
  const verdict = buildVerdict(candidates, { ...GLOBAL_PROFILE, turnsPerMonth: 1 }, "evidence-v1", "2026-08-17");
  expect(verdict.fallbacks).toEqual({ build: ["plan"] });
  expect(generateLiteLlmConfig(verdict, candidates).litellm_settings.fallbacks)
    .toEqual([{ build: ["build-2", "plan"] }, { plan: ["plan-2"] }]);
});

test("two access paths on one failure domain yield one deployment, not two rungs of the same ladder", () => {
  const shared = (id: string, intelligence: number, cost: number): Candidate =>
    ({ ...candidate(id, intelligence, cost), failureDomain: "one-account" });
  const candidates = [shared("first", 50, 1), shared("second", 70, 2), candidate("elsewhere", 60, 1.5)];
  const verdict = buildVerdict(candidates, { ...GLOBAL_PROFILE, turnsPerMonth: 1 }, "evidence-v1", "2026-08-17");
  expect(verdict.routes.build).toEqual(["first", "elsewhere"]);
  expect(generateLiteLlmConfig(verdict, candidates).model_list
    .filter(model => model.model_name.startsWith("build"))
    .map(model => model.litellm_params.model)).toEqual(["first", "elsewhere"]);
});

test("a subscription sits out a closed window; a metered path only sits out a burst", () => {
  const subscription = { ...candidate("seat", 70, 1), billing: "subscription" as const };
  const metered = candidate("metered", 50, 0.5);
  const candidates = [subscription, metered];
  const verdict = buildVerdict(candidates, { ...GLOBAL_PROFILE, turnsPerMonth: 1 }, "evidence-v1", "2026-08-17");
  const cooldowns = Object.fromEntries(generateLiteLlmConfig(verdict, candidates).model_list
    .map(model => [model.litellm_params.model, model.litellm_params.cooldown_time]));
  expect(cooldowns).toEqual({ seat: 300, metered: 60 });
});

test("an exhausted failure domain leaves both routes at once, not one alias at a time", () => {
  const candidates = [candidate("cheap", 50, 1), candidate("smart", 70, 2)];
  const profile = overlayProfile(GLOBAL_PROFILE, { exhaustedDomains: ["cheap"] });
  const verdict = buildVerdict(candidates, { ...profile, turnsPerMonth: 1 }, "evidence-v1", "2026-08-17");
  expect(verdict.rejected).toContainEqual(expect.objectContaining({ candidateId: "cheap", code: "exhausted" }));
  expect(verdict.routes).toEqual({ build: ["smart"], plan: ["smart"] });
});

test("exhausting every domain yields null aliases rather than promoting a rejected candidate", () => {
  const candidates = [candidate("cheap", 50, 1), candidate("smart", 70, 2)];
  const profile = overlayProfile(GLOBAL_PROFILE, { exhaustedDomains: ["cheap", "smart"] });
  const verdict = buildVerdict(candidates, { ...profile, turnsPerMonth: 1 }, "evidence-v1", "2026-08-17");
  expect(verdict.selected).toEqual({ build: null, plan: null });
  expect(verdict.routes).toEqual({ build: [], plan: [] });
});

test("an alias that resolved to nothing is never named as a fallback target", () => {
  const candidates = [candidate("pricey", 70, 100)];
  const verdict = buildVerdict(candidates, GLOBAL_PROFILE, "evidence-v1", "2026-08-17");
  expect(verdict.selected).toEqual({ build: "pricey", plan: null });
  expect(generateLiteLlmConfig(verdict, candidates).litellm_settings.fallbacks).toEqual([]);
});

test("build and plan never select a local-billing candidate", () => {
  const cloud = candidate("cloud", 50, 1);
  const local = { ...candidate("local-model", 90, 0.0001), billing: "local" as const, speed: evidence(1) };
  const verdict = buildVerdict([cloud, local], { ...GLOBAL_PROFILE, turnsPerMonth: 1 }, "evidence-v1", "2026-08-17");
  expect(verdict.selected.build).toBe("cloud");
  expect(verdict.selected.plan).toBe("cloud");
});

test("a dominant local-billing candidate does not veto remote build/plan selection via dominance", () => {
  const cloud = candidate("cloud", 50, 1);
  const local = { ...candidate("local-dominant", 90, 0.0001), billing: "local" as const };
  const verdict = buildVerdict([cloud, local], { ...GLOBAL_PROFILE, turnsPerMonth: 1 }, "evidence-v1", "2026-08-17");
  expect(verdict.selected.build).toBe("cloud");
  expect(verdict.selected.plan).toBe("cloud");
});

test("local-only evidence fills both aliases: build takes the fastest, plan the strongest", () => {
  const local = (id: string, intelligence: number, speed: number): Candidate => ({
    ...candidate(id, intelligence, 0), billing: "local" as const, speed: evidence(speed),
  });
  // The local tier sits below the frontier's floor, so the overlay lowers it — otherwise nothing clears it.
  const profile = overlayProfile(GLOBAL_PROFILE, { intelligenceFloor: 20 });
  const candidates = [local("ling", 25, 127), local("qwen", 38, 17)];
  const verdict = buildVerdict(candidates, profile, "evidence-v1", "2026-08-17");
  expect(verdict.selected.build).toBe("ling");
  expect(verdict.selected.plan).toBe("qwen");
  expect(generateLiteLlmConfig(verdict, candidates).model_list.map(model => model.model_name))
    .toEqual(["build", "build-2", "plan", "plan-2"]);
});

test("dominance runs catalog-wide, not scoped to a single provider/plan (diverges from llm-gate)", () => {
  const weak = { ...candidate("weak", 50, 2), provider: "provider-a" };
  const strong = { ...candidate("strong", 60, 1), provider: "provider-b" };
  const verdict = buildVerdict([weak, strong], { ...GLOBAL_PROFILE, turnsPerMonth: 1 }, "evidence-v1", "2026-08-17");
  expect(verdict.dominated.map(row => row.candidate.id)).toContain("weak");
  expect(verdict.frontier.map(row => row.candidate.id)).toEqual(["strong"]);
});

test("plan ties break by cost ascending, matching llm-gate's (-intelligence, cost) sort key", () => {
  const cheap = candidate("cheap-tie", 60, 1);
  const pricier = candidate("pricier-tie", 60, 2);
  const verdict = buildVerdict([cheap, pricier], { ...GLOBAL_PROFILE, turnsPerMonth: 1 }, "evidence-v1", "2026-08-17");
  expect(verdict.selected.plan).toBe("cheap-tie");
});

test("build/plan stay null when every remote candidate is rejected, never falling back to a rejected or local candidate", () => {
  const stale = { ...candidate("stale", 90, 1), priceUsd: { ...evidence(1), expires: "2020-01-01" } };
  const local = { ...candidate("local-only", 95, 0.0001), billing: "local" as const };
  const verdict = buildVerdict([stale, local], { ...GLOBAL_PROFILE, turnsPerMonth: 1 }, "evidence-v1", "2026-08-17");
  expect(verdict.selected.build).toBeNull();
  expect(verdict.selected.plan).toBeNull();
});

test("invalid refreshes retain the last-known-good evidence", () => {
  const valid = {
    kind: "evidence" as const, version: "evidence-v1", retrievedAt: "2026-08-17", candidates: [candidate("cheap", 50, 1)],
  };
  expect(validateEvidenceSnapshot(valid)).toEqual([]);
  expect(validateEvidenceSnapshot({ ...valid, candidates: [candidate("cheap", -1, 1), candidate("cheap", 50, 1)] })).toEqual([
    "cheap has invalid intelligence", "duplicate candidate cheap",
  ]);
});

test("failed activation leaves the active config untouched and can roll back", () => {
  const candidates = [candidate("cheap", 50, 1), candidate("smart", 70, 2)];
  const verdict = buildVerdict(candidates, { ...GLOBAL_PROFILE, turnsPerMonth: 1 }, "evidence-v1", "2026-08-17");
  const config = generateLiteLlmConfig(verdict, candidates);
  const active = activate(null, config);
  expect(active.error).toBeNull();
  const broken = { ...config, model_list: config.model_list.filter(model => model.model_name !== "plan") };
  const rejected = activate(active.active, broken, Object.keys(verdict.routes));
  expect(rejected.error).toContain("missing plan alias");
  expect(rejected.active).toBe(active.active);
  const committed = activate(active.active, config);
  expect(rollback(committed).active).toBe(active.active);
});

test("Gate writes isolated state atomically and turns repeated updates into no-ops", async () => {
  const root = await mkdtemp(join(tmpdir(), "limits-apply-gate-"));
  try {
    const candidates = [candidate("cheap", 50, 1), candidate("smart", 70, 2)];
    const verdict = buildVerdict(candidates, { ...GLOBAL_PROFILE, turnsPerMonth: 1 }, "evidence-v1", "2026-08-17");
    const snapshot = {
      kind: "verdict" as const, version: "verdict-v1", evidenceVersion: "evidence-v1",
      generatedAt: "2026-08-17", profile: verdict.profile, verdict,
    };
    const paths = gatePaths(root);
    expect(await updateGate(paths, snapshot, candidates, async () => true, "2026-08-17T00:00:00Z")).toBe("activated");
    expect(JSON.parse(await readFile(paths.runtime, "utf8")).general_settings.host).toBe("127.0.0.1");
    expect(await updateGate(paths, snapshot, candidates, async () => true, "2026-08-17T01:00:00Z")).toBe("noop");
    expect((await readFile(paths.audit, "utf8")).split("\n").filter(Boolean)).toHaveLength(2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("without taskClasses the verdict still selects build and plan exactly as before", () => {
  const candidates = [candidate("cheap", 50, 1), candidate("smart", 70, 2)];
  const verdict = buildVerdict(candidates, GLOBAL_PROFILE, "evidence-v1", "2026-08-24");
  expect(Object.keys(verdict.routes).sort()).toEqual(["build", "plan"]);
  expect(verdict.selected).toEqual({ build: "cheap", plan: "smart" });
  expect(verdict.fallbacks).toEqual({ build: ["plan"] });
});

test("a bulk class with a lower floor routes to the cheaper candidate build refuses", () => {
  const candidates = [candidate("cheap", 42, 1), candidate("smart", 70, 2)];
  const profile = {
    ...GLOBAL_PROFILE,
    taskClasses: [...DEFAULT_CLASSES, { alias: "bulk", pick: "cheapest-above-floor" as const, intelligenceFloor: 40 }],
  };
  const verdict = buildVerdict(candidates, profile, "evidence-v1", "2026-08-24");
  expect(Object.keys(verdict.routes).sort()).toEqual(["build", "bulk", "plan"]);
  expect(verdict.routes.build).toEqual(["smart"]);
  expect(verdict.routes.bulk).toEqual(["cheap", "smart"]);
});

test("duplicate aliases and dangling fallbacks are refused by name", () => {
  const candidates = [candidate("cheap", 50, 1), candidate("smart", 70, 2)];
  const dup = { ...GLOBAL_PROFILE, taskClasses: [DEFAULT_CLASSES[0], DEFAULT_CLASSES[0]] };
  expect(() => buildVerdict(candidates, dup, "evidence-v1", "2026-08-24")).toThrow(/build/);
  const dangling = {
    ...GLOBAL_PROFILE,
    taskClasses: [{ alias: "a", pick: "cheapest-above-floor" as const, fallbackAlias: "ghost" }],
  };
  expect(() => buildVerdict(candidates, dangling, "evidence-v1", "2026-08-24")).toThrow(/ghost/);
});

const localCandidate: Candidate = {
  ...candidate("local/qwen", 48, 0), billing: "local", speed: evidence(20),
};

test("without includeLocal a market verdict never routes to local", () => {
  const candidates = [candidate("cheap", 50, 1), candidate("smart", 70, 2), localCandidate];
  const verdict = buildVerdict(candidates, GLOBAL_PROFILE, "evidence-v1", "2026-08-24");
  for (const route of Object.values(verdict.routes)) expect(route).not.toContain(localCandidate.id);
});

test("with includeLocal, local wins the classes whose floor it clears and no other", () => {
  const candidates = [candidate("cheap", 50, 1), candidate("smart", 70, 2), localCandidate];
  const profile = {
    ...GLOBAL_PROFILE,
    includeLocal: true,
    taskClasses: [
      { alias: "build", pick: "cheapest-above-floor" as const, fallbackAlias: "deep" },
      { alias: "deep", pick: "cheapest-above-floor" as const, intelligenceFloor: 60 },
    ],
  };
  const verdict = buildVerdict(candidates, profile, "evidence-v1", "2026-08-24");
  expect(verdict.selected.build).toBe(localCandidate.id);
  expect(verdict.routes.deep).not.toContain(localCandidate.id);
});
