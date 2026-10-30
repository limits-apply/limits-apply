import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { outcomeFor, summarizeRuns, type RunRecord } from "../packages/gate/src/measure";
import { main, type GateIO } from "../packages/gate/src/main";
import { EXIT } from "../packages/gate/src/commands";

const record = (over: Partial<RunRecord>): RunRecord => ({
  workload: "wl-001@v1", access: "Claude Max 20×", config: "claude-opus-5 · Claude Code",
  startedAt: "2026-08-25T12:00:00.000Z", finishedAt: "2026-08-25T12:03:20.000Z",
  exitCode: 0, outcome: "pass", windowsBefore: [], windowsAfter: [],
  ...over,
});

test("exit code 0 is a pass, anything else a fail, and only an override says partial", () => {
  expect(outcomeFor(0, undefined)).toBe("pass");
  expect(outcomeFor(1, undefined)).toBe("fail");
  expect(outcomeFor(null, undefined)).toBe("fail");
  expect(outcomeFor(1, "partial")).toBe("partial");
});

test("a summary counts outcomes and brackets wall clock as a range, never an average", () => {
  const summary = summarizeRuns([
    record({}),
    record({ outcome: "fail", startedAt: "2026-08-25T13:00:00.000Z", finishedAt: "2026-08-25T13:10:00.000Z" }),
  ]);
  expect(summary.runs).toBe(2);
  expect(summary.outcomes).toEqual({ pass: 1, partial: 0, fail: 1 });
  expect(summary.wallClockSeconds).toEqual({ min: 200, max: 600 });
});

test("seven-day deltas exist only where both sides of a run recorded the window", () => {
  const window = (utilization: number) => ({
    label: "7-day window", utilization, resetsAt: "2026-08-28T00:00:00.000Z",
    elapsedFraction: 0.5, projected: null,
  });
  const summary = summarizeRuns([
    record({ windowsBefore: [window(40)], windowsAfter: [window(43)] }),
    record({}),
  ]);
  expect(summary.sevenDayDeltas).toEqual([3]);
});

test("measure runs the command, grades it from the exit code, and appends one JSONL line", async () => {
  const dir = await mkdtemp(join(tmpdir(), "limits-apply-measure-"));
  try {
    const out = join(dir, "measurements.jsonl");
    const io: GateIO = {
      env: {}, home: "/nonexistent-home",
      stdout: () => {}, stderr: () => {},
      fetch: async () => { throw new Error("network access is not available in tests"); },
    };
    const code = await main(["measure", "--workload", "wl-001@v1", "--access", "test", "--config", "test",
      "--out", out, "--", "node", "-e", "process.exit(0)"], io);
    expect(code).toBe(EXIT.ok);
    const lines = (await readFile(out, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);
    const written = JSON.parse(lines[0]) as RunRecord;
    expect(written.outcome).toBe("pass");
    expect(written.windowsBefore).toEqual([]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a failing command is a recorded fail, not a CLI failure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "limits-apply-measure-"));
  try {
    const out = join(dir, "measurements.jsonl");
    const io: GateIO = {
      env: {}, home: "/nonexistent-home",
      stdout: () => {}, stderr: () => {},
      fetch: async () => { throw new Error("network access is not available in tests"); },
    };
    const code = await main(["measure", "--workload", "wl-001@v1", "--access", "test", "--config", "test",
      "--out", out, "--", "node", "-e", "process.exit(3)"], io);
    expect(code).toBe(EXIT.ok);
    const written = JSON.parse((await readFile(out, "utf8")).trim()) as RunRecord;
    expect(written.outcome).toBe("fail");
    expect(written.exitCode).toBe(3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a wrapped run records the tokens its own harness logs observed inside it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "limits-apply-measure-tokens-"));
  try {
    const sessions = join(dir, "sessions");
    await mkdir(sessions, { recursive: true });
    const rollout = join(sessions, "rollout-run.jsonl");
    // The command under test appends the second event mid-run, so both fall inside the window.
    const event = (input: number, cached: number, output: number) =>
      (at: string) =>
        JSON.stringify({
          timestamp: at,
          type: "event_msg",
          payload: {
            type: "token_count",
            info: {
              total_token_usage: {
                input_tokens: input, cached_input_tokens: cached, cache_write_input_tokens: 0,
                output_tokens: output, reasoning_output_tokens: 0, total_tokens: input + output,
              },
              last_token_usage: {},
              model_context_window: 258_400,
            },
            rate_limits: {
              limit_id: "codex",
              primary: { used_percent: 10, window_minutes: 300, resets_at: 1_791_981_228 },
              secondary: { used_percent: 4, window_minutes: 10_080, resets_at: 1_792_517_044 },
              plan_type: "plus",
            },
          },
        });
    await writeFile(rollout, `${event(10_000, 2_000, 500)(new Date().toISOString())}\n`, "utf8");

    const out = join(dir, "measurements.jsonl");
    const io: GateIO = {
      env: {}, home: "/nonexistent-home",
      stdout: () => {}, stderr: () => {},
      fetch: async () => { throw new Error("network access is not available in tests"); },
    };
    const append = `require("node:fs").appendFileSync(${JSON.stringify(rollout)}, ${JSON.stringify(
      event(40_000, 9_000, 1_200)("PLACEHOLDER"),
    )}.replace("PLACEHOLDER", new Date().toISOString()) + "\\n");`;
    const code = await main(["measure", "--workload", "wl-001@v1", "--access", "test", "--config", "test",
      "--sessions", sessions, "--out", out, "--", "node", "-e", append], io);
    expect(code).toBe(EXIT.ok);
    const written = JSON.parse((await readFile(out, "utf8")).trim()) as RunRecord;
    expect(written.observedTokens).toEqual({
      source: "codex-rollout", input: 30_000, cacheRead: 7_000, cacheWrite: 0, output: 700,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
