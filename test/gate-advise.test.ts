import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  DAYS_PER_MONTH, formatExport, monthlyEquivalent, paceWindow, summarizeUsage, type UsageMessage,
} from "../packages/gate/src/advise";
import { main, type GateIO } from "../packages/gate/src/main";
import { EXIT } from "../packages/gate/src/commands";

const NOW = Date.parse("2026-08-25T12:00:00Z");
const DAY = 86_400_000;

const message = (over: Partial<UsageMessage>): UsageMessage => ({
  role: "assistant",
  providerID: "anthropic",
  modelID: "claude-opus-5",
  cost: 1,
  tokens: { input: 1000, output: 100, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: NOW - DAY },
  ...over,
});

function io(overrides: Partial<GateIO> = {}): GateIO & { stdoutLines: string[]; stderrLines: string[] } {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  return {
    env: {},
    home: "/nonexistent-home",
    stdout: line => stdoutLines.push(line),
    stderr: line => stderrLines.push(line),
    fetch: async () => { throw new Error("network access is not available in tests"); },
    stdoutLines,
    stderrLines,
    ...overrides,
  };
}

/* ---------- summarizeUsage ---------- */

test("only costed assistant turns inside the window are summed", () => {
  const summary = summarizeUsage([
    message({ cost: 2 }),
    message({ role: "user", cost: 99 }),
    message({ cost: 3, time: { created: NOW - 40 * DAY } }),
    message({ cost: undefined }),
    message({ cost: 0, providerID: "ollama", modelID: "devstral" }),
  ], NOW - 30 * DAY, NOW);
  expect(summary.totalUsd).toBe(2);
  expect(summary.messages).toBe(2);
  expect(summary.costed).toBe(1);
  expect(summary.zeroCost).toBe(1);
});

test("configurations aggregate per provider×model and sort by spend", () => {
  const summary = summarizeUsage([
    message({ cost: 1 }),
    message({ cost: 4, providerID: "openai", modelID: "gpt-5.6" }),
    message({ cost: 2 }),
  ], NOW - 30 * DAY, NOW);
  expect(summary.byConfig.map(row => `${row.provider} ${row.usd}`)).toEqual(["openai 4", "anthropic 3"]);
  expect(summary.byConfig[1].tokensIn).toBe(2000);
  expect(summary.byConfig[1].tokensOut).toBe(200);
});

test("reasoning tokens count as output, not a category of their own", () => {
  const summary = summarizeUsage([
    message({ tokens: { input: 10, output: 20, reasoning: 30, cache: { read: 0, write: 0 } } }),
  ], NOW - 30 * DAY, NOW);
  expect(summary.byConfig[0].tokensOut).toBe(50);
});

/* ---------- paceWindow ---------- */

test("pace projects utilization over the elapsed fraction of the stated window", () => {
  // 7-day window, 3.5 days to the reset: half elapsed, 40% used → on pace for 80%.
  const pace = paceWindow("7-day window", { utilization: 40, resets_at: new Date(NOW + 3.5 * DAY).toISOString() }, 168, NOW);
  expect(pace?.elapsedFraction).toBeCloseTo(0.5, 12);
  expect(pace?.projected).toBeCloseTo(80, 12);
});

test("a window that just opened projects nothing rather than dividing by nearly zero", () => {
  const pace = paceWindow("5-hour window", { utilization: 1, resets_at: new Date(NOW + 4.99 * 3_600_000).toISOString() }, 5, NOW);
  expect(pace?.projected).toBeNull();
});

test("a missing or unparsable window is skipped, not defaulted", () => {
  expect(paceWindow("7-day window", undefined, 168, NOW)).toBeNull();
  expect(paceWindow("7-day window", { utilization: 40, resets_at: "not-a-date" }, 168, NOW)).toBeNull();
});

test("a reset already in the past clamps to a fully elapsed window", () => {
  const pace = paceWindow("5-hour window", { utilization: 90, resets_at: new Date(NOW - DAY).toISOString() }, 5, NOW);
  expect(pace?.elapsedFraction).toBe(1);
  expect(pace?.projected).toBe(90);
});

/* ---------- month normalization ---------- */

test("the monthly equivalent uses the same month as the site", () => {
  expect(DAYS_PER_MONTH).toBeCloseTo(365.25 / 12, 12);
  expect(monthlyEquivalent(30, 30)).toBeCloseTo(30 * DAYS_PER_MONTH / 30, 12);
});

/* ---------- export ---------- */

test("the export fills what the machine knows and prompts for what only the user knows", () => {
  const summary = summarizeUsage([message({ cost: 2 })], NOW - 30 * DAY, NOW);
  const text = formatExport(summary, [
    { label: "7-day window", utilization: 40, resetsAt: "2026-08-28T00:00:00.000Z", elapsedFraction: 0.5, projected: 80 },
  ], "2026-07-26T12:00:00.000Z", "2026-08-25T12:00:00.000Z");
  expect(text).toContain("### Access path");
  expect(text).toContain("<your exact plan and billing tier");
  expect(text).toContain("anthropic · claude-opus-5");
  expect(text).toContain("$2.00");
  expect(text).toContain("7-day window: 40% used");
  expect(text).toContain("issues/new?template=measurement-submission.yml");
});

/* ---------- the command ---------- */

async function withStorage<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "limits-apply-advise-"));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("advise on a machine with records prices them and exits 0 without writing", () => withStorage(async dir => {
  const session = join(dir, "ses_1");
  await mkdir(session, { recursive: true });
  await writeFile(join(session, "msg_1.json"), JSON.stringify(message({ cost: 2.5, time: { created: Date.now() - DAY } })));
  const gate = io();
  const code = await main(["advise", "--opencode", dir, "--price", "200"], gate);
  expect(code).toBe(EXIT.ok);
  const out = gate.stdoutLines.join("");
  expect(out).toContain("read-only");
  expect(out).toContain("$2.50 metered");
  expect(out).toContain("anthropic · claude-opus-5");
  expect(out).toContain("× the price");
  expect(gate.stderrLines.join("")).toContain("no Claude subscription windows");
}));

test("advise with nothing to read says so and fails instead of inventing a summary", async () => {
  const gate = io();
  const code = await main(["advise", "--opencode", "/nonexistent-opencode"], gate);
  expect(code).toBe(EXIT.failed);
  expect(gate.stderrLines.join("")).toContain("nothing to read");
});

test("advise --export prints the submission form, not the summary", () => withStorage(async dir => {
  await writeFile(join(dir, "msg_1.json"), JSON.stringify(message({ cost: 1, time: { created: Date.now() - DAY } })));
  const gate = io();
  const code = await main(["advise", "--opencode", dir, "--export"], gate);
  expect(code).toBe(EXIT.ok);
  const out = gate.stdoutLines.join("");
  expect(out).toContain("### Access path");
  expect(out).not.toContain("read-only");
}));

test("advise pulls the Claude windows and paces them when credentials exist", () => withStorage(async dir => {
  const credentials = join(dir, "credentials.json");
  await writeFile(credentials, JSON.stringify({ claudeAiOauth: { accessToken: "tok", expiresAt: Date.now() + DAY } }));
  const gate = io({
    fetch: async url => {
      expect(url).toContain("api/oauth/usage");
      return new Response(JSON.stringify({
        seven_day: { utilization: 40, resets_at: new Date(Date.now() + 3.5 * DAY).toISOString() },
      }), { status: 200 });
    },
  });
  const code = await main(["advise", "--opencode", "/nonexistent-opencode", "--credentials", credentials], gate);
  expect(code).toBe(EXIT.ok);
  const out = gate.stdoutLines.join("");
  expect(out).toContain("7-day window: 40% used");
  expect(out).toContain("on pace for ~80%");
}));
