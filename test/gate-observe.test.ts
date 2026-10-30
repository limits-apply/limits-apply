import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { normalizeClaudeUsage, normalizeCodexUsage } from "../packages/gate/src/observe";
import { EXIT } from "../packages/gate/src/commands";
import { main, type GateIO } from "../packages/gate/src/main";

function io(overrides: Partial<GateIO> = {}): GateIO & { stdoutLines: string[]; stderrLines: string[] } {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  return {
    env: {},
    home: "/nonexistent-home",
    stdout: line => stdoutLines.push(line),
    stderr: line => stderrLines.push(line),
    fetch: async () => {
      throw new Error("network access is not available in tests");
    },
    stdoutLines,
    stderrLines,
    ...overrides,
  };
}

async function withDir<T>(prefix: string, run: (dir: string, home: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  const home = join(dir, "home");
  await mkdir(home, { recursive: true });
  try {
    return await run(dir, home);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/* ---------- normalization: provider-native categories into the schema's four ---------- */

test("codex input is inclusive of its cache, so uncached input is what is left", () => {
  expect(normalizeCodexUsage({ input: 26_000, cached: 10_000, cacheWrite: 0, output: 700 })).toEqual({
    inputTokens: 16_000,
    cacheReadTokens: 10_000,
    cacheWriteTokens: 0,
    outputTokens: 700,
  });
});

test("codex cache writes are taken out of input too, and never go negative", () => {
  expect(normalizeCodexUsage({ input: 5_000, cached: 3_000, cacheWrite: 1_000, output: 100 })).toEqual({
    inputTokens: 1_000,
    cacheReadTokens: 3_000,
    cacheWriteTokens: 1_000,
    outputTokens: 100,
  });
  expect(normalizeCodexUsage({ input: 0, cached: 0, cacheWrite: 0, output: 0 })).toEqual({
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
  });
});

test("anthropic reports the four categories separately, so nothing is unwrapped", () => {
  expect(normalizeClaudeUsage({ input: 2, cached: 40_000, cacheWrite: 12_000, output: 1_500 })).toEqual({
    inputTokens: 2,
    cacheReadTokens: 40_000,
    cacheWriteTokens: 12_000,
    outputTokens: 1_500,
  });
});

/* ---------- fixtures faithful to the providers' own log shapes ---------- */

function tokenCount(at: string, totals: number[], used: [number, number | null], planType = "plus"): string {
  const [input, cached, output] = totals;
  const [primary, secondary] = used;
  return JSON.stringify({
    timestamp: at,
    ordinal: 1,
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: { input_tokens: input, cached_input_tokens: cached, cache_write_input_tokens: 0, output_tokens: output, reasoning_output_tokens: Math.round(output / 3), total_tokens: input + output },
        last_token_usage: { input_tokens: input, cached_input_tokens: cached, cache_write_input_tokens: 0, output_tokens: output, reasoning_output_tokens: 0, total_tokens: input + output },
        model_context_window: 258_400,
      },
      rate_limits: {
        limit_id: "codex",
        primary: { used_percent: primary, window_minutes: 300, resets_at: 1_791_981_228 },
        secondary: secondary === null ? null : { used_percent: secondary, window_minutes: 10_080, resets_at: 1_792_517_044 },
        plan_type: planType,
      },
    },
  });
}

async function writeRollout(dir: string, name: string, lines: string[]): Promise<string> {
  const file = join(dir, name);
  await writeFile(file, `${lines.join("\n")}\n`, "utf8");
  return file;
}

function rolloutHeader(): string[] {
  return [
    JSON.stringify({
      timestamp: "2026-10-14T08:00:00.000Z",
      type: "session_meta",
      payload: { id: "thread-1", cli_version: "0.162.1", model_provider: "openai", cwd: "/private/project", originator: "codex-tui" },
    }),
    JSON.stringify({
      timestamp: "2026-10-14T08:00:01.000Z",
      type: "turn_context",
      payload: { turn_id: "turn-1", model: "gpt-5.6-codex", effort: "medium", cwd: "/private/project" },
    }),
  ];
}

/* ---------- codex ---------- */

test("observe codex turns rate-limit events into intervals with normalized token categories", async () => {
  await withDir("observe-codex-", async (dir, home) => {
    const store = join(dir, "store");
    await mkdir(join(dir, "sessions"), { recursive: true });
    await writeRollout(join(dir, "sessions"), "rollout-a.jsonl", [
      ...rolloutHeader(),
      tokenCount("2026-10-14T08:10:00.000Z", [10_000, 4_000, 500], [20, 8]),
      tokenCount("2026-10-14T08:20:00.000Z", [26_000, 10_000, 700], [22, 9]),
    ]);

    const out = io({ home });
    const code = await main(
      ["observe", "codex", "--sessions", join(dir, "sessions"), "--store", store, "--reporter", "reporter-test01", "--region", "FR"],
      out,
    );
    expect(code).toBe(EXIT.ok);

    const files = await readdir(store);
    expect(files.length).toBe(2); // one interval per window kind
    const rows = [];
    for (const file of files) rows.push(JSON.parse(await readFile(join(store, file), "utf8")));
    const first = rows.find(row => row.quotaWindow.type === "5h")!;
    expect(first.schemaVersion).toBe(1);
    expect(first.subscriptionId).toBe("openai.chatgpt-plus");
    expect(first.modelId).toBe("gpt-5.6-codex");
    expect(first.harnessVersion).toBe("0.162.1");
    expect(first.reasoningEffort).toBe("medium");
    expect(first.region).toBe("FR");
    // input_tokens is reported inclusive of cache reads: 16000 total minus 6000 cached
    expect(first.usage).toEqual({ inputTokens: 10_000, cacheReadTokens: 6_000, cacheWriteTokens: 0, outputTokens: 200 });
    expect(first.quotaWindow.usedBefore).toBe(20);
    expect(first.quotaWindow.usedAfter).toBe(22);
    expect(first.apiRateVersion).toBe("2026-08-r1");

    const rerun = io({ home });
    await main(
      ["observe", "codex", "--sessions", join(dir, "sessions"), "--store", store, "--reporter", "reporter-test01", "--region", "FR"],
      rerun,
    );
    expect(rerun.stdoutLines.join("\n")).toContain("2 already stored");
  });
});

test("observe codex marks an interval isolated only when no other session overlapped", async () => {
  await withDir("observe-isolated-", async (dir, home) => {
    const store = join(dir, "store");
    const sessions = join(dir, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeRollout(sessions, "rollout-solo.jsonl", [
      ...rolloutHeader(),
      tokenCount("2026-10-14T08:10:00.000Z", [10_000, 4_000, 500], [20, 8]),
      tokenCount("2026-10-14T08:20:00.000Z", [26_000, 10_000, 700], [22, 9]),
    ]);
    await main(["observe", "codex", "--sessions", sessions, "--store", store, "--reporter", "reporter-test01"], io({ home }));
    let files = await readdir(store);
    const solo = JSON.parse(await readFile(join(store, files[0]), "utf8"));
    expect(solo.isolationConfirmed).toBe(true);

    const store2 = join(dir, "store2");
    await writeRollout(sessions, "rollout-other.jsonl", [
      ...rolloutHeader(),
      tokenCount("2026-10-14T08:15:00.000Z", [1_000, 0, 100], [21, 8]),
    ]);
    await main(["observe", "codex", "--sessions", sessions, "--store", store2, "--reporter", "reporter-test01"], io({ home }));
    files = await readdir(store2);
    const overlapped = [];
    for (const file of files) overlapped.push(JSON.parse(await readFile(join(store2, file), "utf8")));
    const fiveHour = overlapped.filter(row => row.quotaWindow.type === "5h");
    expect(fiveHour.some(row => row.isolationConfirmed === false)).toBe(true);
  });
});

test("observe codex flags a counter reset instead of billing it as consumption", async () => {
  await withDir("observe-reset-", async (dir, home) => {
    const store = join(dir, "store");
    const sessions = join(dir, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeRollout(sessions, "rollout-reset.jsonl", [
      ...rolloutHeader(),
      tokenCount("2026-10-14T08:10:00.000Z", [10_000, 4_000, 500], [95, 60]),
      tokenCount("2026-10-14T09:10:00.000Z", [13_000, 5_000, 700], [2, 0]),
    ]);
    await main(["observe", "codex", "--sessions", sessions, "--store", store, "--reporter", "reporter-test01"], io({ home }));
    const files = await readdir(store);
    const rows = [];
    for (const file of files) rows.push(JSON.parse(await readFile(join(store, file), "utf8")));
    const reset = rows.find(row => row.quotaWindow.type === "5h");
    expect(reset?.quotaWindow.resetDetected).toBe(true);
  });
});

test("observe codex skips a plan outside the registry and says so", async () => {
  await withDir("observe-plan-", async (dir, home) => {
    const store = join(dir, "store");
    const sessions = join(dir, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeRollout(sessions, "rollout-mystery.jsonl", [
      ...rolloutHeader(),
      tokenCount("2026-10-14T08:10:00.000Z", [10_000, 4_000, 500], [20, 8], "mystery-plan"),
      tokenCount("2026-10-14T08:20:00.000Z", [26_000, 10_000, 700], [22, 9], "mystery-plan"),
    ]);
    const out = io({ home });
    const code = await main(["observe", "codex", "--sessions", sessions, "--store", store, "--reporter", "reporter-test01"], out);
    expect(code).toBe(EXIT.ok);
    expect(out.stderrLines.join("\n")).toContain("mystery-plan");
    expect(await readdir(store)).toEqual([]);
  });
});

/* ---------- claude ---------- */

function claudeAssistant(at: string, model: string, usage: Record<string, number>): string {
  return JSON.stringify({
    type: "assistant",
    uuid: `uuid-${at}`,
    timestamp: at,
    sessionId: "session-1",
    version: "2.1.241",
    isSidechain: false,
    cwd: "/private/project",
    message: { model, usage },
  });
}

test("observe claude sums transcripts per model against two readings", async () => {
  await withDir("observe-claude-", async (dir, home) => {
    const store = join(dir, "store");
    const projects = join(dir, "projects");
    await mkdir(projects, { recursive: true });
    await writeFile(
      join(projects, "session-1.jsonl"),
      [
        claudeAssistant("2026-10-12T10:00:00.000Z", "claude-opus-5", { input_tokens: 2, cache_creation_input_tokens: 12_000, cache_read_input_tokens: 40_000, output_tokens: 1_500 }),
        claudeAssistant("2026-10-12T11:00:00.000Z", "claude-opus-5", { input_tokens: 3, cache_creation_input_tokens: 8_000, cache_read_input_tokens: 60_000, output_tokens: 2_000 }),
      ].join("\n"),
      "utf8",
    );

    const out = io({ home });
    const code = await main(
      ["observe", "claude", "--projects", projects, "--store", store, "--reporter", "reporter-test01",
        "--plan", "anthropic.claude-max-5x", "--before", "40", "--after", "55", "--since", "2026-10-12T00:00:00.000Z"],
      out,
    );
    expect(code).toBe(EXIT.ok);

    const files = await readdir(store);
    expect(files.length).toBe(1);
    const row = JSON.parse(await readFile(join(store, files[0]), "utf8"));
    expect(row.usage).toEqual({ inputTokens: 5, cacheReadTokens: 100_000, cacheWriteTokens: 20_000, outputTokens: 3_500 });
    expect(row.quotaWindow).toMatchObject({ type: "weekly", usedBefore: 40, usedAfter: 55, unit: "percentage_points" });
    expect(row.collectionMethod).toBe("manual");
    expect(row.harness).toBe("claude-code");
    expect(row.harnessVersion).toBe("2.1.241");
  });
});

test("observe claude takes the after reading from the official usage endpoint with --pull", async () => {
  await withDir("observe-pull-", async (dir, _home) => {
    const store = join(dir, "store");
    const projects = join(dir, "projects");
    await mkdir(projects, { recursive: true });
    await writeFile(
      join(projects, "session-1.jsonl"),
      claudeAssistant("2026-10-12T10:00:00.000Z", "claude-opus-5", { input_tokens: 2, cache_creation_input_tokens: 12_000, cache_read_input_tokens: 40_000, output_tokens: 1_500 }),
      "utf8",
    );
    const credentials = join(dir, ".credentials.json");
    await writeFile(
      credentials,
      JSON.stringify({ claudeAiOauth: { accessToken: "token-value", expiresAt: Date.now() + 3_600_000 } }),
      "utf8",
    );
    const fetchImpl: GateIO["fetch"] = async () =>
      new Response(
        JSON.stringify({ five_hour: { utilization: 12, resets_at: "2026-10-14T13:00:00.000Z" }, seven_day: { utilization: 63, resets_at: "2026-10-16T12:00:00.000Z" } }),
        { status: 200 },
      );

    const out = io({ fetch: fetchImpl });
    const code = await main(
      ["observe", "claude", "--projects", projects, "--store", store, "--reporter", "reporter-test01",
        "--plan", "anthropic.claude-max-5x", "--window", "5h", "--before", "40", "--pull", "--credentials", credentials],
      out,
    );
    expect(code).toBe(EXIT.ok);
    const files = await readdir(store);
    const row = JSON.parse(await readFile(join(store, files[0]), "utf8"));
    expect(row.quotaWindow.usedAfter).toBe(12);
    expect(row.quotaWindow.resetAt).toBe("2026-10-14T13:00:00.000Z");
    expect(row.collectionMethod).toBe("official_status");
  });
});

test("observe claude refuses an interval with only one reading", async () => {
  await withDir("observe-half-", async (dir, home) => {
    const out = io({ home });
    const code = await main(
      ["observe", "claude", "--projects", join(dir, "projects"), "--store", join(dir, "store"),
        "--plan", "anthropic.claude-max-5x", "--before", "40"],
      out,
    );
    expect(code).toBe(EXIT.usage);
    expect(out.stderrLines.join("\n")).toContain("two readings");
  });
});

test("observe claude records the workload's run counts beside the interval", async () => {
  await withDir("observe-runs-", async (dir, home) => {
    const store = join(dir, "store");
    const projects = join(dir, "projects");
    await mkdir(projects, { recursive: true });
    await writeFile(
      join(projects, "session-1.jsonl"),
      claudeAssistant("2026-10-12T10:00:00.000Z", "claude-opus-5", { input_tokens: 2, cache_creation_input_tokens: 12_000, cache_read_input_tokens: 40_000, output_tokens: 1_500 }),
      "utf8",
    );

    const ok = io({ home });
    expect(
      await main(
        ["observe", "claude", "--projects", projects, "--store", store, "--reporter", "reporter-test01",
          "--plan", "anthropic.claude-max-5x", "--before", "10", "--after", "30",
          "--workload", "wl-001@v1", "--runs", "10", "--successful-runs", "9"],
        ok,
      ),
    ).toBe(EXIT.ok);
    const files = await readdir(store);
    const row = JSON.parse(await readFile(join(store, files[0]), "utf8"));
    expect(row.workloadId).toBe("wl-001@v1");
    expect(row.runs).toBe(10);
    expect(row.successfulRuns).toBe(9);

    const bad = io({ home });
    expect(
      await main(
        ["observe", "claude", "--projects", projects, "--store", store, "--reporter", "reporter-test01",
          "--plan", "anthropic.claude-max-5x", "--before", "10", "--after", "30", "--runs", "3", "--successful-runs", "9"],
        bad,
      ),
    ).toBe(EXIT.usage);
  });
});

/* ---------- report and export ---------- */

test("observe export prints a bundle and refuses one carrying a local path", async () => {
  await withDir("observe-export-", async (dir, home) => {
    const store = join(dir, "store");
    const sessions = join(dir, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeRollout(sessions, "rollout-a.jsonl", [
      ...rolloutHeader(),
      tokenCount("2026-10-14T08:10:00.000Z", [10_000, 4_000, 500], [20, 8]),
      tokenCount("2026-10-14T08:20:00.000Z", [26_000, 10_000, 700], [22, 9]),
    ]);
    await main(["observe", "codex", "--sessions", sessions, "--store", store, "--reporter", "reporter-test01", "--region", "FR"], io({ home }));

    const plain = io({ home });
    expect(await main(["observe", "export", "--store", store], plain)).toBe(EXIT.ok);
    const bundle = JSON.parse(plain.stdoutLines.join("\n"));
    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.observations.length).toBe(2);

    const sanitized = io({ home });
    expect(await main(["observe", "export", "--store", store, "--sanitized"], sanitized)).toBe(EXIT.ok);
    expect(sanitized.stdoutLines.join("\n")).not.toContain('"region": "FR"');

    // A hand-edited row smuggling a credential past the schema must stop the export.
    const dirty = join(store, "aaaaaaaaaaaaaaaa.json");
    const row = JSON.parse(await readFile(join(store, (await readdir(store))[0]), "utf8"));
    await writeFile(dirty, JSON.stringify({ ...row, reasoningEffort: "Bearer abcdefghijklmnop" }), "utf8");
    const refused = io({ home });
    expect(await main(["observe", "export", "--store", store], refused)).toBe(EXIT.failed);
    expect(refused.stderrLines.join("\n")).toContain("private data");
  });
});

test("observe report summarizes the store and names its evidence status", async () => {
  await withDir("observe-report-", async (dir, home) => {
    const store = join(dir, "store");
    const sessions = join(dir, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeRollout(sessions, "rollout-a.jsonl", [
      ...rolloutHeader(),
      tokenCount("2026-10-14T08:10:00.000Z", [10_000, 4_000, 500], [20, 8]),
      tokenCount("2026-10-14T08:20:00.000Z", [26_000, 10_000, 700], [30, 9]),
    ]);
    await main(["observe", "codex", "--sessions", sessions, "--store", store, "--reporter", "reporter-test01"], io({ home }));

    const out = io({ home });
    expect(await main(["observe", "report", "--store", store], out)).toBe(EXIT.ok);
    const text = out.stdoutLines.join("\n");
    expect(text).toContain("usable interval");
    expect(text).toContain("ChatGPT Plus");
    expect(text).toContain("single-report");
  });
});
