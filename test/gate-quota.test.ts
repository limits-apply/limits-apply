import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { parseClaudeCredentials, usageToQuotaEvent } from "../packages/gate/src/claude-usage";
import { main, type GateIO } from "../packages/gate/src/main";
import { EXIT } from "../packages/gate/src/commands";
import { gatePaths } from "../packages/gate/src/storage";

const CREDENTIALS = JSON.stringify({
  claudeAiOauth: { accessToken: "tok-123", refreshToken: "r", expiresAt: 1787000000000, scopes: [] },
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

async function withRoot<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "limits-apply-gate-quota-"));
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("credentials come from the claudeAiOauth block", () => {
  expect(parseClaudeCredentials(CREDENTIALS)).toEqual({ accessToken: "tok-123", expiresAt: 1787000000000 });
});

test("a credentials file without the block is refused, not defaulted", () => {
  expect(() => parseClaudeCredentials("{}")).toThrow(/claudeAiOauth/);
});

test("an open window writes nothing", () => {
  const usage = { five_hour: { utilization: 80, resets_at: "2026-08-24T18:00:00Z" } };
  expect(usageToQuotaEvent(usage, "anthropic-max", "2026-08-24T14:00:00Z")).toBeNull();
});

test("a closed window becomes one observed event at the latest reopen time", () => {
  const usage = {
    five_hour: { utilization: 100, resets_at: "2026-08-24T18:00:00Z" },
    seven_day_opus: { utilization: 100, resets_at: "2026-08-27T00:00:00Z" },
    seven_day: { utilization: 60, resets_at: "2026-08-27T00:00:00Z" },
  };
  expect(usageToQuotaEvent(usage, "anthropic-max", "2026-08-24T14:00:00Z")).toEqual({
    domain: "anthropic-max",
    observedAt: "2026-08-24T14:00:00Z",
    resetsAt: "2026-08-27T00:00:00.000Z",
    rung: "observed",
    source: "oauth-usage",
  });
});

test("quota pull records a closed window and status then reports it", async () => {
  await withRoot(async root => {
    const credentials = join(root, "credentials.json");
    await writeFile(credentials, JSON.stringify({
      claudeAiOauth: { accessToken: "tok-123", refreshToken: "r", expiresAt: Date.now() + 3_600_000, scopes: [] },
    }));

    const calls: { url: string; init?: RequestInit }[] = [];
    const code = await main(
      ["quota", "pull", "--root", root, "--domain", "anthropic-max", "--credentials", credentials],
      io({
        fetch: async (url, init) => {
          calls.push({ url, init });
          return new Response(
            JSON.stringify({ five_hour: { utilization: 100, resets_at: "2026-08-24T18:00:00Z" } }),
            { status: 200 },
          );
        },
      }),
    );

    expect(code).toBe(EXIT.ok);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.anthropic.com/api/oauth/usage");
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get("anthropic-beta")).toBe("oauth-2025-04-20");
    expect(headers.get("authorization")).toBe("Bearer tok-123");

    const quotaLines = (await readFile(gatePaths(root).quota, "utf8")).trim().split("\n");
    expect(quotaLines).toHaveLength(1);
    const event = JSON.parse(quotaLines[0]);
    expect(event.resetsAt).toBe("2026-08-24T18:00:00.000Z");
    expect(event.rung).toBe("observed");
    expect(event.source).toBe("oauth-usage");
  });
});

test("a 401 names the fix and exits failed without writing", async () => {
  await withRoot(async root => {
    const credentials = join(root, "credentials.json");
    await writeFile(credentials, JSON.stringify({
      claudeAiOauth: { accessToken: "tok-123", refreshToken: "r", expiresAt: Date.now() + 3_600_000, scopes: [] },
    }));

    const testIo = io({ fetch: async () => new Response("", { status: 401 }) });
    const code = await main(
      ["quota", "pull", "--root", root, "--domain", "anthropic-max", "--credentials", credentials],
      testIo,
    );

    expect(code).toBe(EXIT.failed);
    expect(testIo.stderrLines.join("")).toContain("claude");
    await expect(readFile(gatePaths(root).quota, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});

test("quota pull without --domain returns usage", async () => {
  await withRoot(async root => {
    const code = await main(["quota", "pull", "--root", root], io());
    expect(code).toBe(EXIT.usage);
  });
});
