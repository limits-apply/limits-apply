import { mkdtemp, readFile, rm } from "node:fs/promises";
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
