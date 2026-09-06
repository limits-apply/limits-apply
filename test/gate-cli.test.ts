import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { validateEvidenceSnapshot } from "../packages/intelligence/src/index";
import { validateConfig } from "../packages/gate/src/activation";
import { COMMANDS, EXIT } from "../packages/gate/src/commands";
import { main, type GateIO } from "../packages/gate/src/main";
import { defaultGateRoot, gatePaths } from "../packages/gate/src/storage";
import exampleEvidence from "../packages/gate/fixtures/example-evidence.json";

const failingFetch: GateIO["fetch"] = async () => {
  throw new Error("network access is not available in tests");
};

function io(overrides: Partial<GateIO> = {}): GateIO & { stdoutLines: string[]; stderrLines: string[] } {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  return {
    env: {},
    home: "/nonexistent-home",
    stdout: line => stdoutLines.push(line),
    stderr: line => stderrLines.push(line),
    fetch: failingFetch,
    stdoutLines,
    stderrLines,
    ...overrides,
  };
}

async function withRoot<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "limits-apply-gate-cli-"));
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("defaultGateRoot prefers LIMITSAPPLY_HOME, then XDG_CONFIG_HOME, then the home directory", () => {
  expect(defaultGateRoot({ LIMITSAPPLY_HOME: "/a", XDG_CONFIG_HOME: "/b" }, "/c")).toBe("/a");
  expect(defaultGateRoot({ XDG_CONFIG_HOME: "/b" }, "/c")).toBe(join("/b", "limitsapply"));
  expect(defaultGateRoot({}, "/c")).toBe(join("/c", ".config", "limitsapply"));
});

test("init writes the default profile", async () => {
  await withRoot(async root => {
    const code = await main(["init", "--root", root], io());
    expect(code).toBe(EXIT.ok);
    const profile = JSON.parse(await readFile(gatePaths(root).profile, "utf8"));
    expect(profile).toEqual({ version: 1, region: "global", credentialNames: [] });
  });
});

test("update --example --no-opencode writes all four files, validates clean, and audits an activation", async () => {
  await withRoot(async root => {
    const code = await main(["update", "--root", root, "--example", "--no-opencode"], io());
    expect(code).toBe(EXIT.ok);

    const paths = gatePaths(root);
    const profile = JSON.parse(await readFile(paths.profile, "utf8"));
    expect(profile).toEqual({ version: 1, region: "global", credentialNames: [] });

    const verdictSnapshot = JSON.parse(await readFile(paths.verdict, "utf8"));
    expect(verdictSnapshot.kind).toBe("verdict");

    const runtime = JSON.parse(await readFile(paths.runtime, "utf8"));
    expect(validateConfig(runtime)).toEqual([]);

    const auditLines = (await readFile(paths.audit, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(auditLines.at(-1).event).toBe("activate");
  });
});

test("update --smoke rolls back to the previous runtime when the proxy doesn't answer", async () => {
  await withRoot(async root => {
    const paths = gatePaths(root);
    expect(await main(["update", "--root", root, "--example", "--no-opencode"], io())).toBe(EXIT.ok);
    const runtimeBefore = await readFile(paths.runtime, "utf8");

    // A second, different verdict, so the run is not short-circuited as a no-op before the probe.
    const thinner = { ...exampleEvidence, candidates: exampleEvidence.candidates.slice(0, 2) };
    const evidencePath = join(root, "thinner.json");
    await writeFile(evidencePath, JSON.stringify(thinner), "utf8");

    const dead = io({ fetch: async () => new Response("no proxy", { status: 502 }) });
    const code = await main(["update", "--root", root, "--evidence", evidencePath, "--no-opencode", "--smoke"], dead);

    expect(code).toBe(EXIT.smoke);
    expect(dead.stdoutLines.join("")).toContain("gate: rolled-back");
    expect(await readFile(paths.runtime, "utf8")).toBe(runtimeBefore);
    const audit = (await readFile(paths.audit, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(audit.at(-1).event).toBe("rollback");
  });
});

test("running update --example --no-opencode twice appends noop and leaves the runtime byte-identical", async () => {
  await withRoot(async root => {
    const paths = gatePaths(root);
    const first = await main(["update", "--root", root, "--example", "--no-opencode"], io());
    expect(first).toBe(EXIT.ok);
    const runtimeAfterFirst = await readFile(paths.runtime, "utf8");

    const second = await main(["update", "--root", root, "--example", "--no-opencode"], io());
    expect(second).toBe(EXIT.ok);
    const runtimeAfterSecond = await readFile(paths.runtime, "utf8");
    expect(runtimeAfterSecond).toBe(runtimeAfterFirst);

    const auditLines = (await readFile(paths.audit, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(auditLines.at(-1).event).toBe("noop");
  });
});

test("update --example emits a ranked chain per alias, one deployment per failure domain", async () => {
  await withRoot(async root => {
    expect(await main(["update", "--root", root, "--example", "--no-opencode"], io())).toBe(EXIT.ok);
    const runtime = JSON.parse(await readFile(gatePaths(root).runtime, "utf8"));

    expect(runtime.model_list.map((model: { model_name: string }) => model.model_name))
      .toEqual(["build", "build-2", "plan", "plan-2"]);
    const domains = runtime.model_list.map((model: { litellm_params: { api_base: string } }) => model.litellm_params.api_base);
    expect(new Set(domains.slice(0, 2)).size).toBe(2);
    expect(runtime.litellm_settings.fallbacks).toEqual([{ build: ["build-2", "plan"] }, { plan: ["plan-2"] }]);
  });
});

test("a recorded window removes its failure domain from the next update, and returns it once it reopens", async () => {
  await withRoot(async root => {
    const paths = gatePaths(root);
    expect(await main(["update", "--root", root, "--example", "--no-opencode"], io())).toBe(EXIT.ok);
    const before = JSON.parse(await readFile(paths.runtime, "utf8"));
    const domainOf = (config: { model_list: { litellm_params: { api_base: string } }[] }) =>
      new Set(config.model_list.map(model => model.litellm_params.api_base));
    expect(domainOf(before)).toContain("https://second-vendor.invalid/v1");

    const closed = io();
    expect(await main(["quota", "--root", root, "exhausted", "second-vendor", "--resets", "2099-01-01T00:00:00Z"], closed)).toBe(EXIT.ok);
    expect(await main(["update", "--root", root, "--example", "--no-opencode"], io())).toBe(EXIT.ok);
    const during = JSON.parse(await readFile(paths.runtime, "utf8"));
    expect(domainOf(during)).not.toContain("https://second-vendor.invalid/v1");

    const listed = io();
    expect(await main(["quota", "--root", root], listed)).toBe(EXIT.ok);
    expect(listed.stdoutLines.join("")).toContain("second-vendor: reopens 2099-01-01T00:00:00.000Z (derived, manual)");

    expect(await main(["quota", "--root", root, "exhausted", "second-vendor", "--resets", "2020-01-01T00:00:00Z"], io())).toBe(EXIT.ok);
    expect(await main(["update", "--root", root, "--example", "--no-opencode"], io())).toBe(EXIT.ok);
    const after = JSON.parse(await readFile(paths.runtime, "utf8"));
    expect(domainOf(after)).toContain("https://second-vendor.invalid/v1");
  });
});

test("a runtime that no longer matches what the verdict generates is rewritten, not skipped as a noop", async () => {
  await withRoot(async root => {
    const paths = gatePaths(root);
    expect(await main(["update", "--root", root, "--example", "--no-opencode"], io())).toBe(EXIT.ok);
    const generated = await readFile(paths.runtime, "utf8");

    const stale = JSON.parse(generated);
    delete stale.litellm_settings.fallbacks;
    await writeFile(paths.runtime, `${JSON.stringify(stale, null, 2)}\n`, "utf8");

    expect(await main(["update", "--root", root, "--example", "--no-opencode"], io())).toBe(EXIT.ok);
    expect(await readFile(paths.runtime, "utf8")).toBe(generated);
    const afterRewrite = (await readFile(paths.audit, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(afterRewrite.at(-1).event).toBe("activate");

    expect(await main(["update", "--root", root, "--example", "--no-opencode"], io())).toBe(EXIT.ok);
    const afterSettling = (await readFile(paths.audit, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(afterSettling.at(-1).event).toBe("noop");
  });
});

test("an OpenCode file with unrelated keys survives the merge", async () => {
  await withRoot(async root => {
    const opencodePath = join(root, "opencode.json");
    await writeFile(opencodePath, JSON.stringify({ mcp: { keep: "me" } }, null, 2), "utf8");

    const code = await main(["update", "--root", root, "--example", "--opencode", opencodePath], io());
    expect(code).toBe(EXIT.ok);

    const written = JSON.parse(await readFile(opencodePath, "utf8"));
    expect(written.mcp).toEqual({ keep: "me" });
    expect(written.provider.LIMITSAPPLY).toBeDefined();
  });
});

test("Claude Code's settings are untouched unless --claude-code names the file", async () => {
  await withRoot(async root => {
    const home = join(root, "home");
    const settings = join(home, ".claude", "settings.json");
    await mkdir(join(home, ".claude"), { recursive: true });
    const original = `${JSON.stringify({ env: { EDITOR: "vim" } }, null, 2)}\n`;
    await writeFile(settings, original, "utf8");

    // Its own home, its own default path, its own config sitting right there: still not written.
    const untouched = io({ home });
    expect(await main(["update", "--root", root, "--example", "--no-opencode"], untouched)).toBe(EXIT.ok);
    expect(await readFile(settings, "utf8")).toBe(original);
    expect(untouched.stdoutLines.join("")).not.toContain("claude-code");

    // A second, different verdict, so the run isn't short-circuited as a no-op before the merge.
    const thinner = join(root, "thinner.json");
    await writeFile(thinner, JSON.stringify({ ...exampleEvidence, candidates: exampleEvidence.candidates.slice(0, 2) }), "utf8");

    const named = io({ home });
    expect(await main(
      ["update", "--root", root, "--evidence", thinner, "--no-opencode", "--claude-code", settings],
      named,
    )).toBe(EXIT.ok);

    const written = JSON.parse(await readFile(settings, "utf8"));
    expect(written.env.EDITOR).toBe("vim");
    expect(written.env.ANTHROPIC_MODEL).toBe("build");
    expect(named.stdoutLines.join("")).toContain("claude-code:");
  });
});

test("--proxy redirects the probe alone, never the address written into a harness config", async () => {
  await withRoot(async root => {
    const opencodePath = join(root, "opencode.json");
    await writeFile(opencodePath, "{}", "utf8");

    expect(await main(
      ["update", "--root", root, "--example", "--opencode", opencodePath, "--proxy", "http://127.0.0.1:9999"],
      io(),
    )).toBe(EXIT.ok);

    const written = JSON.parse(await readFile(opencodePath, "utf8"));
    const runtime = JSON.parse(await readFile(gatePaths(root).runtime, "utf8"));
    // The harness has to reach the proxy Gate actually configured, not the one it was told to ping.
    expect(written.provider.LIMITSAPPLY.options.baseURL)
      .toBe(`http://${runtime.general_settings.host}:${runtime.general_settings.port}/v1`);
  });
});

test("pi is never written without --pi either, so only OpenCode is configured by default", async () => {
  await withRoot(async root => {
    const home = join(root, "home");
    await mkdir(join(home, ".pi", "agent"), { recursive: true });
    const models = join(home, ".pi", "agent", "models.json");
    const original = `${JSON.stringify({ defaults: { agent: "keep" } }, null, 2)}\n`;
    await writeFile(models, original, "utf8");

    const run = io({ home });
    expect(await main(["update", "--root", root, "--example", "--no-opencode"], run)).toBe(EXIT.ok);
    expect(await readFile(models, "utf8")).toBe(original);
    expect(run.stdoutLines.join("")).not.toContain("pi:");
  });
});

test("naming --pi against an already-current root writes it: a no-op gate is still a configured gate", async () => {
  await withRoot(async root => {
    const models = join(root, "models.json");
    await writeFile(models, "{}", "utf8");
    expect(await main(["update", "--root", root, "--example", "--no-opencode"], io())).toBe(EXIT.ok);

    const second = io();
    expect(await main(["update", "--root", root, "--example", "--no-opencode", "--pi", models], second)).toBe(EXIT.ok);
    expect(second.stdoutLines.join("")).toContain("gate: noop");
    expect(JSON.parse(await readFile(models, "utf8")).providers.LIMITSAPPLY).toBeTruthy();
    expect(second.stdoutLines.join("")).toContain("pi:");
  });
});

test("update --smoke probes on a no-op too, so a dead proxy is reported and exits 3", async () => {
  await withRoot(async root => {
    expect(await main(["update", "--root", root, "--example", "--no-opencode"], io())).toBe(EXIT.ok);

    const dead = io({ fetch: async () => new Response("no proxy", { status: 502 }) });
    const code = await main(["update", "--root", root, "--example", "--no-opencode", "--smoke"], dead);

    expect(code).toBe(EXIT.smoke);
    expect(dead.stdoutLines.join("")).toContain("gate: noop");
    expect(dead.stdoutLines.join("")).toContain("smoke build: fail");
  });
});

test("an OpenCode file with a comment aborts the update, exits 1, and is left untouched", async () => {
  await withRoot(async root => {
    const opencodePath = join(root, "opencode.json");
    const original = "{\n  // a comment\n  \"mcp\": { \"keep\": \"me\" }\n}\n";
    await writeFile(opencodePath, original, "utf8");

    const captured = io();
    const code = await main(["update", "--root", root, "--example", "--opencode", opencodePath], captured);
    expect(code).toBe(EXIT.failed);

    expect(await readFile(opencodePath, "utf8")).toBe(original);
    const paths = gatePaths(root);
    await expect(readFile(paths.verdict, "utf8")).rejects.toThrow();
  });
});

test("update with no verdict source exits 2", async () => {
  await withRoot(async root => {
    const captured = io();
    const code = await main(["update", "--root", root], captured);
    expect(code).toBe(EXIT.usage);
  });
});

test("an unknown command exits 2 with every command name on stderr", async () => {
  const captured = io();
  const code = await main(["doctor"], captured);
  expect(code).toBe(EXIT.usage);
  const stderr = captured.stderrLines.join("");
  for (const command of COMMANDS) expect(stderr).toContain(command.name);
});

test("the bundled example evidence fixture is valid", () => {
  expect(validateEvidenceSnapshot(exampleEvidence as Parameters<typeof validateEvidenceSnapshot>[0])).toEqual([]);
});

test("status on an empty root exits 0 without crashing", async () => {
  await withRoot(async root => {
    const captured = io();
    const code = await main(["status", "--root", root], captured);
    expect(code).toBe(EXIT.ok);
    expect(captured.stdoutLines.join("")).toContain("No verdict is active");
  });
});

test("status --smoke reports failure and exits smoke when the proxy is unreachable", async () => {
  await withRoot(async root => {
    const context = io();
    expect(await main(["update", "--root", root, "--example", "--no-opencode"], context)).toBe(EXIT.ok);
    const code = await main(["status", "--root", root, "--smoke"], context);
    expect(code).toBe(EXIT.smoke);
    const printed = context.stdoutLines.join("");
    expect(printed).toContain("smoke build: fail");
    expect(printed.match(/smoke build:/g)).toHaveLength(1);
  });
});

test("update --no-opencode reports nothing about opencode", async () => {
  await withRoot(async root => {
    const context = io();
    expect(await main(["update", "--root", root, "--example", "--no-opencode"], context)).toBe(EXIT.ok);
    expect(context.stdoutLines.join("")).not.toContain("opencode");
  });
});

const REPO_ROOT = join(__dirname, "..");
const AA_SNAPSHOT = join(REPO_ROOT, "data/artificial-analysis-2026-08-14.json");

test("evidence builds public current.json from the committed inputs", async () => {
  await withRoot(async dir => {
    const out = join(dir, "current.json");
    const code = await main([
      "evidence",
      "--candidates", join(REPO_ROOT, "src/data/candidates.json"),
      "--aa", AA_SNAPSHOT,
      "--out", out,
    ], io());
    expect(code).toBe(EXIT.ok);
    const written = JSON.parse(await readFile(out, "utf8"));
    expect(validateEvidenceSnapshot(written)).toEqual([]);
  });
});

test("evidence refuses a catalog row it cannot source, naming the row", async () => {
  await withRoot(async dir => {
    const bad = join(dir, "candidates.json");
    await writeFile(bad, JSON.stringify([{ id: "x/broken" }]), "utf8");
    const gate = io();
    const code = await main([
      "evidence",
      "--candidates", bad,
      "--aa", AA_SNAPSHOT,
      "--out", join(dir, "current.json"),
    ], gate);
    expect(code).not.toBe(EXIT.ok);
    expect(gate.stderrLines.join("")).toContain("x/broken");
  });
});

test("a profile whose task classes are neither build nor plan still activates", async () => {
  await withRoot(async root => {
    await writeFile(gatePaths(root).profile, JSON.stringify({
      version: 1, region: "global", credentialNames: [],
      taskClasses: [
        { alias: "bulk", pick: "cheapest-above-floor", intelligenceFloor: 40 },
        { alias: "deep", pick: "strongest-within-budget" },
      ],
    }), "utf8");

    const context = io();
    expect(await main(["update", "--root", root, "--example", "--no-opencode"], context)).toBe(EXIT.ok);
    const runtime = JSON.parse(await readFile(gatePaths(root).runtime, "utf8"));
    expect(runtime.model_list.map((model: { model_name: string }) => model.model_name)).toContain("bulk");
    expect(validateConfig(runtime, ["bulk", "deep"])).toEqual([]);
  });
});

test("status prints one line per route key, not a fixed build/plan pair", async () => {
  await withRoot(async root => {
    const context = io();
    expect(await main(["update", "--root", root, "--example", "--no-opencode"], context)).toBe(EXIT.ok);
    const paths = gatePaths(root);
    const snapshot = JSON.parse(await readFile(paths.verdict, "utf8"));
    snapshot.verdict.routes.bulk = snapshot.verdict.routes.build;
    snapshot.verdict.selected.bulk = snapshot.verdict.selected.build;
    await writeFile(paths.verdict, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

    const printed = io();
    expect(await main(["status", "--root", root], printed)).toBe(EXIT.ok);
    expect(printed.stdoutLines.join("")).toContain(`bulk: ${snapshot.verdict.selected.bulk}\n`);
  });
});

async function writeAgentEvidence(root: string): Promise<string> {
  const current = JSON.parse(await readFile(join(REPO_ROOT, "public/current.json"), "utf8"));
  const path = join(root, "agent-evidence.json");
  await writeFile(path, JSON.stringify({ ...exampleEvidence, agentPairs: current.agentPairs }), "utf8");
  return path;
}

test("status prints per-class dispatch advice when the profile picks an agent pair", async () => {
  await withRoot(async root => {
    const paths = gatePaths(root);
    await writeFile(paths.profile, JSON.stringify({
      version: 1, region: "global", credentialNames: [],
      agentPicks: [{ alias: "implement", indexFloor: 60 }],
    }), "utf8");

    const evidencePath = await writeAgentEvidence(root);
    expect(await main(["update", "--root", root, "--evidence", evidencePath, "--no-opencode"], io())).toBe(EXIT.ok);

    const printed = io();
    expect(await main(["status", "--root", root], printed)).toBe(EXIT.ok);
    const stdout = printed.stdoutLines.join("");
    expect(stdout).toContain("dispatch implement:");
    expect(stdout).toContain("(advice, API-scored)");
  });
});

test("adding agentPicks to an already-current root still reaches status", async () => {
  await withRoot(async root => {
    const evidencePath = await writeAgentEvidence(root);
    expect(await main(["update", "--root", root, "--evidence", evidencePath, "--no-opencode"], io())).toBe(EXIT.ok);

    await writeFile(gatePaths(root).profile, JSON.stringify({
      version: 1, region: "global", credentialNames: [],
      agentPicks: [{ alias: "implement", indexFloor: 60 }],
    }), "utf8");
    expect(await main(["update", "--root", root, "--evidence", evidencePath, "--no-opencode"], io())).toBe(EXIT.ok);

    const printed = io();
    expect(await main(["status", "--root", root], printed)).toBe(EXIT.ok);
    expect(printed.stdoutLines.join("")).toContain("dispatch implement:");
  });
});

test("status prints no dispatch line when the profile carries no agent picks", async () => {
  await withRoot(async root => {
    const evidencePath = await writeAgentEvidence(root);
    expect(await main(["update", "--root", root, "--evidence", evidencePath, "--no-opencode"], io())).toBe(EXIT.ok);

    const printed = io();
    expect(await main(["status", "--root", root], printed)).toBe(EXIT.ok);
    expect(printed.stdoutLines.join("")).not.toContain("dispatch ");
  });
});

const LOCAL_ROW = {
  id: "local/qwen3.6-27b",
  model: "openai/qwen3.6-27b",
  endpoint: "http://mac.tailnet:1234/v1",
  failureDomain: "local-mac",
  intelligence: { value: 55, rung: "derived", source: "AA small-tier snapshot 2026-08", verified: "2026-08-24" },
  speed: { value: 30, rung: "measured", source: "timed run on the mac, 2026-08-24", verified: "2026-08-24" },
  concurrency: 4,
};

const LOCAL_PROFILE = {
  version: 1,
  region: "global",
  credentialNames: [],
  includeLocal: true,
  taskClasses: [
    { alias: "build", pick: "cheapest-above-floor", intelligenceFloor: 50 },
    { alias: "plan", pick: "strongest-within-budget" },
  ],
  localCandidates: [LOCAL_ROW],
};

const reachable: GateIO["fetch"] = async () => new Response("{}", { status: 200 });

test("a declared local candidate joins the ranking and wins the class whose floor it clears", async () => {
  await withRoot(async root => {
    const paths = gatePaths(root);
    await writeFile(paths.profile, JSON.stringify(LOCAL_PROFILE), "utf8");
    expect(await main(["update", "--root", root, "--example", "--no-opencode"], io({ fetch: reachable }))).toBe(EXIT.ok);

    const snapshot = JSON.parse(await readFile(paths.verdict, "utf8"));
    expect(snapshot.verdict.selected.build).toBe(LOCAL_ROW.id);
    const runtime = JSON.parse(await readFile(paths.runtime, "utf8"));
    expect(runtime.model_list[0].litellm_params.api_base).toBe(LOCAL_ROW.endpoint);
  });
});

test("a local candidate whose intelligence names no source is refused by name", async () => {
  await withRoot(async root => {
    const paths = gatePaths(root);
    await writeFile(paths.profile, JSON.stringify({
      ...LOCAL_PROFILE,
      localCandidates: [{ ...LOCAL_ROW, intelligence: { ...LOCAL_ROW.intelligence, source: "" } }],
    }), "utf8");

    const failed = io({ fetch: reachable });
    expect(await main(["update", "--root", root, "--example", "--no-opencode"], failed)).toBe(EXIT.failed);
    expect(failed.stderrLines.join("")).toContain(LOCAL_ROW.id);
  });
});

test("an unreachable local endpoint sits the run out as a probed quota window", async () => {
  await withRoot(async root => {
    const paths = gatePaths(root);
    await writeFile(paths.profile, JSON.stringify(LOCAL_PROFILE), "utf8");

    const offline = io({ fetch: async url => {
      if (url.startsWith(LOCAL_ROW.endpoint)) throw new Error("connection refused");
      return new Response("{}", { status: 200 });
    } });
    expect(await main(["update", "--root", root, "--example", "--no-opencode"], offline)).toBe(EXIT.ok);

    const snapshot = JSON.parse(await readFile(paths.verdict, "utf8"));
    expect(snapshot.verdict.selected.build).not.toBe(LOCAL_ROW.id);
    expect(offline.stderrLines.join("")).toContain(LOCAL_ROW.failureDomain);
    expect(offline.stderrLines.join("")).toContain("endpoint-probe");

    const events = (await readFile(paths.quota, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(events).toEqual([expect.objectContaining({ domain: LOCAL_ROW.failureDomain, source: "endpoint-probe" })]);
  });
});
