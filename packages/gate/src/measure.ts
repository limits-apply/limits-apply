import type { WindowPace } from "./advise";

export type Outcome = "pass" | "partial" | "fail";

/** Token categories the harness's own logs carry, counted between two timestamps. */
export interface ObservedTokens {
  source: "codex-rollout" | "claude-transcripts";
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

export interface RunRecord {
  workload: string;
  access: string;
  config: string;
  startedAt: string;
  finishedAt: string;
  exitCode: number | null;
  outcome: Outcome;
  windowsBefore: WindowPace[];
  windowsAfter: WindowPace[];
  /** Tokens the logs observed inside the run, when a collector could read them. */
  observedTokens?: ObservedTokens | null;
  notes?: string;
}

/** The grader's exit code is the verdict; `partial` exists only as a human override. */
export function outcomeFor(exitCode: number | null, override: Outcome | undefined): Outcome {
  return override ?? (exitCode === 0 ? "pass" : "fail");
}

export function buildRunRecord(fields: Omit<RunRecord, "outcome"> & { override?: Outcome }): RunRecord {
  const { override, ...rest } = fields;
  return { ...rest, outcome: outcomeFor(fields.exitCode, override) };
}

export interface RunSummary {
  runs: number;
  outcomes: Record<Outcome, number>;
  wallClockSeconds: { min: number; max: number };
  sevenDayDeltas: number[];
}

export function summarizeRuns(records: RunRecord[]): RunSummary {
  const outcomes: Record<Outcome, number> = { pass: 0, partial: 0, fail: 0 };
  const seconds: number[] = [];
  const sevenDayDeltas: number[] = [];
  for (const record of records) {
    outcomes[record.outcome] += 1;
    seconds.push((Date.parse(record.finishedAt) - Date.parse(record.startedAt)) / 1000);
    const before = record.windowsBefore.find(w => w.label === "7-day window");
    const after = record.windowsAfter.find(w => w.label === "7-day window");
    if (before && after) sevenDayDeltas.push(after.utilization - before.utilization);
  }
  return {
    runs: records.length,
    outcomes,
    wallClockSeconds: { min: Math.min(...seconds), max: Math.max(...seconds) },
    sevenDayDeltas,
  };
}
